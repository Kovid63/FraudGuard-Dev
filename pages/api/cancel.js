// pages/api/orders/cancel.js

import sessionHandler from "./utils/sessionHandler";
import clientPromise from "../../lib/mongo";
import {
  incrementRiskPreventedAmount,
  updateOrdersOnHold,
} from "./utils/updateRiskStats";
import { shopify } from "../../lib/shopify";
import { removeStatusTags } from "./utils/removeStatusTags";

/**
 * Shopify cancellation + restock
 */
async function cancelOrderWithRestock(
  client,
  orderGid,
  orderName,
  reason,
  sendEmail,
  autoRestock
) {
  console.log("[RESTOCK TEST] Calling orderCancel mutation for:", orderGid);
  console.log("[RESTOCK TEST] autoRestock =", autoRestock);

  try {
    const mutation = `
      mutation orderCancel(
        $orderId: ID!
        $notifyCustomer: Boolean
        $reason: OrderCancelReason!
        $staffNote: String
        $restock: Boolean!
      ) {
        orderCancel(
          orderId: $orderId
          notifyCustomer: $notifyCustomer
          reason: $reason
          staffNote: $staffNote
          refund: true
          restock: $restock
        ) {
          job {
            id
            done
          }
          orderCancelUserErrors {
            message
            code
            field
          }
          userErrors {
            message
            field
          }
        }
      }
    `;

    const variables = {
      orderId: orderGid,
      notifyCustomer: sendEmail,
      reason,
      staffNote: `Order ${orderName} cancelled by FraudGuard – Payment voided & inventory restocked`,
      restock: autoRestock,
    };

    const response = await client.request(mutation, { variables });
    const result = response.data.orderCancel;

    console.log(
      "[RESTOCK TEST] orderCancel response:",
      JSON.stringify(result, null, 2)
    );

    if (result.orderCancelUserErrors?.length || result.userErrors?.length) {
      console.log("[RESTOCK TEST] Errors:", result.orderCancelUserErrors || result.userErrors);
      return {
        success: false,
        errors: result.orderCancelUserErrors || result.userErrors,
      };
    }

    console.log("[RESTOCK TEST] Shopify accepted cancellation. Job:", result.job?.id);

    return { success: true, jobId: result.job?.id };

  } catch (err) {
    console.error("[RESTOCK TEST] GraphQL cancel failed:", err.message);
    return { success: false, error: err.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const {
    orderId,
    shop,
    orderAmount,
    admin_graphql_api_id,
    orderName,
    isManuallyCancelled,
    shouldSendCancellationEmail,
    fromTimeout
  } = req.body;

  try {
    const mongoClient = await clientPromise;
    const db = mongoClient.db(shop.split(".")[0]);

    const orderDetails = await db.collection("orders").findOne({ id: orderId });

    if (fromTimeout && orderDetails.guard.status !== "pending") {
      return res.status(400).json({
        error: "Order status is not pending, cannot auto cancel.",
      });
    }

    // READ AUTO RESTOCK SETTING
    const settings = await db
      .collection("risk-settings")
      .findOne({ id: "risk-config" });

    const autoRestock = settings?.autoRestockCancelledOrders ?? false;

    const session = await sessionHandler.loadSession(shop);
    const client = new shopify.clients.Graphql({ session });

    console.info("[api-cancel] Request received:", { shop, orderId });
    console.log("[api-cancel] AutoRestock setting =", autoRestock);

    /**
     * STEP 1 — Check if already cancelled
     */
    const orderCheck = await client.request(`
      query {
        order(id: "${admin_graphql_api_id}") {
          cancelledAt
        }
      }
    `);

    if (orderCheck?.data?.order?.cancelledAt) {
      return res.status(400).json({
        error: "Order already cancelled. Restock not possible.",
      });
    }

    /**
     * STEP 2 — Fetch transactions
     */
    const txRes = await fetch(
      `https://${shop}/admin/api/2025-04/orders/${orderId}/transactions.json`,
      { headers: { "X-Shopify-Access-Token": session.accessToken } }
    );

    const txData = await txRes.json();
    const authorizationTx = txData?.transactions?.find(
      (tx) => tx.kind === "authorization" && tx.status === "success"
    );

    if (!authorizationTx) {
      return res.status(400).json({ error: "No successful authorization transaction found." });
    }

    const capturedTx = txData.transactions.find(
      (tx) => tx.kind === "capture" && tx.status === "success"
    );
    if (capturedTx) {
      return res.status(400).json({
        error: "Payment already captured. Refund required instead.",
      });
    }

    /**
     * STEP 3 — Void the authorization
     */
    await fetch(
      `https://${shop}/admin/api/2025-04/orders/${orderId}/transactions.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": session.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transaction: { kind: "void", parent_id: authorizationTx.id },
        }),
      }
    );

    /**
     * STEP 4 — Cancel with restock (based on DB setting)
     */
    const reason = isManuallyCancelled ? "CUSTOMER" : "FRAUD";

    const cancelResult = await cancelOrderWithRestock(
      client,
      admin_graphql_api_id,
      orderName || `#${orderId}`,
      reason,
      shouldSendCancellationEmail,
      autoRestock
    );

    if (!cancelResult.success) {
      return res.status(500).json({
        error: "Cancellation failed",
        details: cancelResult.errors || cancelResult.error,
      });
    }

    /**
     * STEP 5 — Update DB
     */
    const existingOrder = await db.collection("orders").findOne(
      { shop, id: orderId },
      { projection: { "guard.status": 1, "guard.riskStatusTag": 1 } }
    );

    const riskTag = existingOrder?.guard?.riskStatusTag;

    await db.collection("orders").updateOne(
      { shop, id: orderId },
      {
        $set: {
          "guard.status": "cancelled payment",
          "guard.paymentStatus.captured": false,
          "guard.paymentStatus.cancelled": true,
          "guard.remark": existingOrder?.guard?.status || "unknown",
          "guard.cancelledAt": new Date(),
          "guard.cancelJobId": cancelResult.jobId,
        },
      }
    );

    /**
     * STEP 6 — Remove tags
     */
    if (riskTag) {
      await removeStatusTags(client, admin_graphql_api_id, [riskTag]);
    }

    /**
     * STEP 7 — Update risk metrics
     */
    await incrementRiskPreventedAmount(shop, parseFloat(orderAmount));
    await updateOrdersOnHold(shop, true);

    res.status(200).json({
      success: true,
      orderCancelled: true,
      inventoryRestocked: autoRestock,
      emailSent: shouldSendCancellationEmail,
      jobId: cancelResult.jobId,
    });
  } catch (err) {
    console.error("[api-cancel] Internal error:", err.message);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
}
