
import { buffer } from "micro";
import { shopify } from "../../../lib/shopify";
import clientPromise from "../../../lib/mongo";
import { getCardBrandFromBin, getRiskLevel } from "../utils/riskLevel";
import sessionHandler from "../utils/sessionHandler";
import { updateOrdersOnHold } from "../utils/updateRiskStats";
import { whichOrdersToFlag } from "../utils/whichOrdersToFlag";
import { whichOrdersToSendEmail } from "../utils/whichOrdersToSendEmail";
import withMiddleware from "../utils/middleware/withMiddleware";
import { EMAIL_RESEND_DELAY_IN_DAYS } from "../../../config/constants";
import { addStatusTags } from "../utils/addStatusTags";
import { getBinFromOrderId } from "../validation";
import countries from "i18n-iso-countries";
const axios = require("axios");

countries.registerLocale(require("i18n-iso-countries/langs/en.json"));

export const config = {
  api: {
    bodyParser: false,
  },
};

function normalizeCountry(value) {
  if (!value) return null;
  const alpha2 = countries.getAlpha2Code(value, "en");
  return alpha2 || value.toUpperCase();
}

function normalizeAddress(addr) {
  return addr
    .toLowerCase()
    .replace(/[,\s]+/g, " ")
    .replace(/\bnull\b/g, "")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

function addressMatches(orderAddr, ruleAddr) {
  if (!orderAddr || !ruleAddr) return false;
  const orderWords = normalizeAddress(orderAddr);
  const ruleWords = normalizeAddress(ruleAddr);
  if (ruleWords.length === 0) return false;

  const allRuleWordsInOrder = ruleWords.every((ruleWord) =>
    orderWords.some(
      (orderWord) =>
        orderWord.includes(ruleWord) || ruleWord.includes(orderWord)
    )
  );

  if (allRuleWordsInOrder) return true;

  return orderWords.every((orderWord) =>
    ruleWords.some(
      (ruleWord) => ruleWord.includes(orderWord) || orderWord.includes(ruleWord)
    )
  );
}

function normalizeIp(ip) {
  return ip?.trim().toLowerCase();
}

function ipMatches(orderIp, ruleIp, blocks = 4) {
  if (!orderIp || !ruleIp) return false;
  const orderPrefix = normalizeIp(orderIp)
    .split(":")
    .slice(0, blocks)
    .join(":");
  const rulePrefix = normalizeIp(ruleIp).split(":").slice(0, blocks).join(":");
  return orderPrefix === rulePrefix;
}

async function checkAccessControl(db, shop, orderData) {
  try {
    const collection = db.collection("access_control");
    const email = orderData.email?.toLowerCase().trim();
    const phone = orderData.billing_address?.phone?.replace(/\D/g, "");
    const shippingAddress = orderData.shipping_address;
    const ipAddress = orderData.browser_ip?.trim();
    const country = normalizeCountry(
      shippingAddress?.country_code || shippingAddress?.country
    );

    let fullAddress = null;
    if (shippingAddress) {
      fullAddress = [
        shippingAddress.address1,
        shippingAddress.address2,
        shippingAddress.city,
        shippingAddress.province,
        shippingAddress.zip,
        shippingAddress.country,
      ]
        .filter(Boolean)
        .join(", ")
        .toLowerCase()
        .trim();
    }

    const blocklistRules = await collection
      .find({ shop, listType: "blocklist" })
      .toArray();

    for (const rule of blocklistRules) {
      const ruleValue = (rule.value || "").toLowerCase().trim();

      if (rule.type === "Email" && email && email === ruleValue) {
        return {
          shouldBlock: true,
          listType: "blocklist",
          matchType: "email",
          matchValue: rule.value,
          ruleId: rule._id.toString(),
        };
      }

      if (
        rule.type === "Phone" &&
        phone &&
        phone === ruleValue.replace(/\D/g, "")
      ) {
        return {
          shouldBlock: true,
          listType: "blocklist",
          matchType: "phone",
          matchValue: rule.value,
          ruleId: rule._id.toString(),
        };
      }

      if (
        rule.type === "Address" &&
        fullAddress &&
        addressMatches(fullAddress, ruleValue)
      ) {
        return {
          shouldBlock: true,
          listType: "blocklist",
          matchType: "address",
          matchValue: rule.value,
          ruleId: rule._id.toString(),
        };
      }
    }

    const allowlistRules = await collection
      .find({ shop, listType: "allowlist" })
      .toArray();

    for (const rule of allowlistRules) {
      const ruleValue = (rule.value || "").toLowerCase().trim();
      if (rule.type === "Email" && email && email === ruleValue) {
        console.log(
          "Email on allowlist & no parameters on the blocklist bypassing the order & overriding the risk score"
        );
        return {
          shouldBypass: true,
          listType: "allowlist",
          matchType: "email",
          matchValue: rule.value,
          ruleId: rule._id.toString(),
        };
      }
    }

    const matchedTypes = new Set();
    const matchedRules = [];

    for (const rule of allowlistRules) {
      const ruleValue = (rule.value || "").toLowerCase().trim();

      if (
        rule.type === "Phone" &&
        phone &&
        phone === ruleValue.replace(/\D/g, "")
      ) {
        matchedTypes.add("phone");
        matchedRules.push({
          type: "phone",
          value: rule.value,
          id: rule._id.toString(),
        });
      } else if (
        rule.type === "Address" &&
        fullAddress &&
        addressMatches(fullAddress, ruleValue)
      ) {
        matchedTypes.add("address");
        matchedRules.push({
          type: "address",
          value: rule.value,
          id: rule._id.toString(),
        });
      } else if (
        rule.type === "IP Address" &&
        ipAddress &&
        ipMatches(ipAddress, rule.value)
      ) {
        matchedTypes.add("ip");
        matchedRules.push({
          type: "ip",
          value: rule.value,
          id: rule._id.toString(),
        });
      } else if (
        rule.type === "Country" &&
        country &&
        normalizeCountry(rule.value) === country
      ) {
        matchedTypes.add("country");
        matchedRules.push({
          type: "country",
          value: rule.value,
          id: rule._id.toString(),
        });
      }
    }

    if (matchedTypes.size >= 2) {
      return {
        shouldBypass: true,
        listType: "allowlist",
        matchedTypes: Array.from(matchedTypes),
        matchedRules,
      };
    }

    return { shouldBypass: false, shouldBlock: false };
  } catch (error) {
    console.error("Error checking access control lists:", error.message, {
      category: "webhook-order-create",
    });
    return { shouldBypass: false, shouldBlock: false, error: error.message };
  }
}

async function retryDbOperation(operation, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (
        error.code === 11000 ||
        (error.message && error.message.includes("duplicate key"))
      ) {
        console.warn(
          `Duplicate key error during DB operation (attempt ${attempt}/${maxRetries}). Indicating pre-existing data or race condition.`,
          { category: "webhook-order-create" }
        );
        return { duplicateKeyError: true, error, success: false };
      }
      console.error(
        `Database operation failed (attempt ${attempt}/${maxRetries}):`,
        error.message,
        { category: "webhook-order-create" }
      );
      if (attempt >= maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay * attempt));
    }
  }
}

async function getOrderRisks(shopifyClient, orderIdGid) {
  const query = `
    query getOrderRisks($orderId: ID!) {
      order(id: $orderId) {
        risk { assessments { facts { description sentiment } riskLevel } recommendation }
      }
    }
  `;
  try {
    const response = await shopifyClient.request(query, {
      variables: { orderId: orderIdGid },
    });
    if (response?.data?.order?.risk) return response.data.order.risk;
    console.warn("No risk data found for order", {
      category: "webhook-order-create",
    });
    return {};
  } catch (error) {
    console.warn("Non-critical: Error fetching order risks:", error.message, {
      category: "webhook-order-create",
    });
    return {};
  }
}

async function getOrderTxnDetails(shopifyClient, orderIdGid) {
  const query = `
    query GetOrderTransactions($orderId: ID!) {
      order(id: $orderId) {
        transactions { accountNumber status kind }
      }
    }
  `;
  try {
    const response = await shopifyClient.request(query, {
      variables: { orderId: orderIdGid },
    });
    if (response?.data?.order?.transactions)
      return response.data.order.transactions;
    console.warn("No transaction data found for order", {
      category: "webhook-order-create",
    });
    return [];
  } catch (error) {
    console.warn(
      "Non-critical: Error fetching order transactions:",
      error.message,
      {
        category: "webhook-order-create",
      }
    );
    return [];
  }
}

async function getFulfillmentOrders(
  shopifyClient,
  orderIdGid,
  maxRetries = 5,
  delayMs = 2000
) {
  const query = `
    query GetFulfillmentOrders($orderId: ID!) {
      order(id: $orderId) {
        fulfillmentOrders(first: 10) {
          edges {
            node {
              id
              status
            }
          }
        }
      }
    }
  `;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await shopifyClient.request(query, {
        variables: { orderId: orderIdGid },
      });

      if (response?.data?.order?.fulfillmentOrders?.edges) {
        const fulfillmentOrders =
          response.data.order.fulfillmentOrders.edges.map((edge) => edge.node);

        if (fulfillmentOrders.length > 0) {
          console.info(
            `Found ${fulfillmentOrders.length} fulfillment orders for ${orderIdGid} on attempt ${attempt}`,
            { category: "webhook-order-create" }
          );
          return fulfillmentOrders;
        }

        if (attempt < maxRetries) {
          console.info(
            `No fulfillment orders found for ${orderIdGid} on attempt ${attempt}/${maxRetries}, retrying in ${delayMs}ms...`,
            { category: "webhook-order-create" }
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }

      console.warn(
        `No fulfillment orders found for order ${orderIdGid} after ${maxRetries} attempts`,
        { category: "webhook-order-create" }
      );
      return [];
    } catch (error) {
      console.warn(
        `Error fetching fulfillment orders (attempt ${attempt}/${maxRetries}):`,
        error.message,
        { category: "webhook-order-create" }
      );

      if (attempt === maxRetries) {
        console.error(
          `Failed to fetch fulfillment orders after ${maxRetries} attempts for order ${orderIdGid}`,
          { category: "webhook-order-create" }
        );
        return [];
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return [];
}

async function holdFulfillmentOrders(
  shopifyClient,
  fulfillmentOrderIds,
  reason = "OTHER"
) {
  if (!fulfillmentOrderIds || fulfillmentOrderIds.length === 0) {
    console.warn("No fulfillment order IDs provided for hold operation", {
      category: "webhook-order-create",
    });
    return { success: false, error: "No fulfillment order IDs provided" };
  }

  const mutation = `
    mutation FulfillmentOrderHold($fulfillmentHold: FulfillmentOrderHoldInput!, $id: ID!) {
      fulfillmentOrderHold(fulfillmentHold: $fulfillmentHold, id: $id) {
        fulfillmentOrder {
          id
          status
        }
        fulfillmentHold {
          id
          reason
        }
        remainingFulfillmentOrder {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const results = [];

  for (const fulfillmentOrderId of fulfillmentOrderIds) {
    try {
      const variables = {
        id: fulfillmentOrderId,
        fulfillmentHold: {
          reason: reason,
          reasonNotes: "Order flagged by Fraud Guard risk assessment system",
        },
      };

      const response = await shopifyClient.request(mutation, { variables });

      if (response?.data?.fulfillmentOrderHold?.userErrors?.length > 0) {
        const errors = response.data.fulfillmentOrderHold.userErrors;
        console.warn(
          `Hold operation had user errors for fulfillment order ${fulfillmentOrderId}:`,
          errors,
          { category: "webhook-order-create" }
        );
        results.push({
          fulfillmentOrderId,
          success: false,
          errors: errors.map((e) => e.message).join(", "),
        });
      } else if (response?.data?.fulfillmentOrderHold?.fulfillmentOrder) {
        console.info(
          `Successfully held fulfillment order ${fulfillmentOrderId}`,
          { category: "webhook-order-create" }
        );
        results.push({
          fulfillmentOrderId,
          success: true,
          status: response.data.fulfillmentOrderHold.fulfillmentOrder.status,
          holdId: response.data.fulfillmentOrderHold.fulfillmentHold?.id,
        });
      } else {
        console.warn(
          `Unexpected response structure for hold operation on ${fulfillmentOrderId}:`,
          response,
          { category: "webhook-order-create" }
        );
        results.push({
          fulfillmentOrderId,
          success: false,
          error: "Unexpected response structure",
        });
      }
    } catch (error) {
      console.error(
        `Error holding fulfillment order ${fulfillmentOrderId}:`,
        error.message,
        { category: "webhook-order-create" }
      );
      results.push({
        fulfillmentOrderId,
        success: false,
        error: error.message,
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const totalCount = results.length;

  return {
    success: successCount > 0,
    results,
    summary: `${successCount}/${totalCount} fulfillment orders successfully held`,
  };
}

async function scheduleFulfillmentHold(db, orderData, shop, delayMinutes = 2) {
  const scheduleItem = {
    type: "fulfillment_hold",
    orderData: {
      id: orderData.id,
      admin_graphql_api_id: orderData.admin_graphql_api_id,
    },
    shop,
    scheduledFor: new Date(Date.now() + delayMinutes * 60 * 1000),
    status: "scheduled",
    createdAt: new Date(),
    attempts: 0,
    maxAttempts: 3,
  };

  try {
    await db
      .collection("scheduled-tasks")
      .createIndex({ scheduledFor: 1, status: 1 }, { background: true });
    const result = await db
      .collection("scheduled-tasks")
      .insertOne(scheduleItem);
    console.info(
      `Scheduled fulfillment hold for order ${orderData.id} in ${delayMinutes} minutes with ID: ${result.insertedId}`,
      { category: "webhook-order-create" }
    );
    return result.insertedId;
  } catch (error) {
    console.error("Failed to schedule fulfillment hold:", error, {
      category: "webhook-order-create",
    });
    throw error;
  }
}

async function makeApiRequest(endpoint, data, ignoreErrors = false) {
  try {
    const response = await axios.post(
      `${process.env.HOST}/api/${endpoint}`,
      data,
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    return response.data;
  } catch (error) {
    const errorMessage =
      error.response?.data?.error || error.message || "Unknown error";
    if (ignoreErrors) {
      console.warn(
        `Ignored non-critical /api/${endpoint} fetch error:`,
        errorMessage,
        { category: "webhook-order-create" }
      );
      return { success: false, error: errorMessage };
    }
    console.error(
      `Error in makeApiRequest for /api/${endpoint}:`,
      errorMessage,
      { category: "webhook-order-create" }
    );
    throw error;
  }
}

async function getOrderAmountInUSD(orderData) {
  const amount = parseFloat(orderData.total_price);
  const currency = orderData.currency || "USD";
  if (currency === "USD") return amount;
  try {
    const res = await axios.get(`${process.env.HOST}/api/exchange-rate`);
    const data = res.data;
    const rates = Array.isArray(data) && data.length > 0 ? data[0].rates : [];
    const rateObj = rates.find((r) => r.currency_code === currency);
    if (!rateObj || !rateObj.rate_per_usd) return amount;
    return amount / rateObj.rate_per_usd;
  } catch (e) {
    console.warn("Currency conversion failed:", e.message, {
      category: "webhook-order-create",
    });
    return amount;
  }
}

async function getBinAndCardBrand(shop, orderId, session) {
  let bin = null;
  let cardBrand = null;

  try {
    const binResult = await getBinFromOrderId(shop, orderId, session);
    if (binResult && binResult.bin) {
      bin = binResult.bin;
      try {
        cardBrand = await getCardBrandFromBin(bin);
      } catch (cardBrandError) {
        console.warn(
          `Non-critical: Failed to get card brand for BIN ${bin}:`,
          cardBrandError.message,
          { category: "webhook-order-create" }
        );
        cardBrand = null;
      }
    } else {
      console.warn(`No BIN found for order ${orderId}`, {
        category: "webhook-order-create",
      });
    }
  } catch (binError) {
    console.warn(
      `Non-critical: Payment details not found for order ${orderId}:`,
      binError.message,
      { category: "webhook-order-create" }
    );
    bin = null;
    cardBrand = null;
  }

  return { bin, cardBrand };
}

function determineOrderAction(riskLevel, riskSettings, automation) {
  const score = riskLevel?.score || 0;
  const autoApproveLowRiskThreshold =
    riskSettings?.autoApproveLowRiskThreshold || 40;
  const autoCancelHighRiskThreshold =
    riskSettings?.autoCancelHighRiskThreshold || 70;

  // 1) Check automation-based cancellation first
  if (
    automation?.isHighRiskCancelled &&
    score >= (automation?.highRiskThreshold || autoCancelHighRiskThreshold)
  ) {
    return {
      action: "cancel",
      reason: `(automation) Risk score ${score} exceeds auto-cancel threshold ${automation?.highRiskThreshold || autoCancelHighRiskThreshold}`,
    };
  }

  // 2) Check automation-based approval if enabled
  if (
    automation?.isLowRiskApproved &&
    score <= (automation?.lowRiskThreshold || autoApproveLowRiskThreshold)
  ) {
    return {
      action: "capture",
      source: "automation",
      reason: `(automation) Risk score ${score} is at-or-below auto-approve threshold ${automation?.lowRiskThreshold || autoApproveLowRiskThreshold}`,
    };
  }

  // 3) Check risk-settings-based cancellation
  if (
    score >= autoCancelHighRiskThreshold &&
    riskSettings?.autoCancelHighRisk
  ) {
    return {
      action: "cancel",
      reason: `(risk-settings) Risk score ${score} exceeds auto-cancel threshold ${autoCancelHighRiskThreshold}`,
    };
  }
  
  // 4) (removed) risk-settings-based approval — handled by automation or default fallback

  // 5) DEFAULT: Auto-approve LOW-RISK scores only if automation auto-approve is OFF
  if (
    riskLevel?.risk === "low" &&
    automation?.isLowRiskApproved !== true
  ) {
    return {
      action: "capture",
      source: "default",
      isDefaultAutoApprove: true,
      reason: `(default) Risk assessor marked order as LOW risk (score ${score}) and automation auto-approve is disabled — auto-approving by default`,
    };
  }

  return {
    action: "hold",
    reason: `Risk score ${score} is between thresholds (${autoApproveLowRiskThreshold}-${autoCancelHighRiskThreshold}), requires manual review`,
  };
}

async function handleLowRiskOrder(
  db,
  orderData,
  shop,
  riskLevel,
  shopifyClient,
  orderAction = {}
) {
  console.info(
    `Auto-capturing low-risk order ${orderData.id} with score ${riskLevel.score}`,
    { category: "webhook-order-create" }
  );

  const existingOrder = await db.collection("orders").findOne({
    shop,
    id: orderData.id,
  });

  if (existingOrder) {
    console.info(
      `Order ${orderData.id} already exists in database. Skipping auto-capture.`,
      { category: "webhook-order-create" }
    );
    return { processed: true, isNewOrder: false };
  }

  const orderDoc = {
    ...orderData,
    shop,
    guard: {
      isVerificationRequired: false,
      status: "auto-approved",
      riskLevel,
      autoApproved: true,
      autoApprovedAt: new Date(),
      riskStatusTag: "FG_LowRisk",
      verificationStatusTag: "FG_Approved",
    },
    receivedAt: new Date(),
  };

  await db.collection("orders").insertOne(orderDoc);

  const captureData = {
    orderId: orderData.id,
    shop,
    orderAmount: orderData.total_price,
    notFlagged: true,
    autoApproved: true,
  };

  const captureResult = await makeApiRequest("capture", captureData, true);

  if (!captureResult.success) {
    console.warn(
      `Auto-capture failed for order ${orderData.id}: ${captureResult.error}`,
      { category: "webhook-order-create" }
    );
  } else {
    console.info(
      `Successfully auto-captured payment for order ${orderData.id}`,
      { category: "webhook-order-create" }
    );
  }

  // Skip tag addition for default auto-approves (when automation auto-approve is OFF)
  console.debug(
    `[handleLowRiskOrder] orderAction.source: ${orderAction?.source}, isDefaultAutoApprove: ${orderAction?.isDefaultAutoApprove}, shopifyClient: ${!!shopifyClient}`,
    { category: "webhook-order-create" }
  );

  // Only add tags when the capture was triggered by automation or risk-settings.
  // Skip tag addition for default auto-approves (source === 'default').
  if (orderAction?.source !== "default" && shopifyClient) {
    try {
      console.debug(
        `[handleLowRiskOrder] Adding tags to order ${orderData.id} (source: ${orderAction?.source})`,
        { category: "webhook-order-create" }
      );
      await addStatusTags(shopifyClient, orderData.admin_graphql_api_id, [
        "FG_LowRisk",
        "FG_Approved",
      ]);
    } catch (tagError) {
      console.warn(
        `Failed to add tags to auto-approved order ${orderData.id}: ${tagError.message}`,
        { category: "webhook-order-create" }
      );
    }
  }

  return { processed: true, isNewOrder: true, action: "capture" };
}

async function handleFlaggedOrder(
  db,
  orderData,
  shop,
  riskLevel,
  riskSettings,
  shopifyRiskAssessments,
  orderTxnDetails,
  shopifyClient,
  accessControlMatch = null
) {
  // Load existing order
  const existingOrder = await db
    .collection("orders")
    .findOne({ shop, id: orderData.id });

  // Load automation settings
  const automation = await db
    .collection("automationSettings")
    .findOne({ shop });

  let isNewOrder = false;

  // --------------------------
  // 1. INSERT ORDER IF NEW
  // --------------------------
  if (!existingOrder) {
    isNewOrder = true;

    // ---- Tier calculation ----
    let tier = null;
    try {
      const amountUSD = await getOrderAmountInUSD(orderData);
      if (riskLevel.risk === "medium" && amountUSD <= 299) tier = 1;
      else if (
        riskLevel.risk === "high" ||
        (riskLevel.risk === "medium" && amountUSD > 300)
      )
        tier = 2;
    } catch (e) {
      console.warn("Tiering failed:", e.message);
    }

    // ---- BIN / Card Brand ----
    let session = null,
      bin = null,
      cardBrand = null;
    try {
      session = await sessionHandler.loadSession(shop);
      const card = await getBinAndCardBrand(shop, orderData.id, session);
      bin = card.bin;
      cardBrand = card.cardBrand;
    } catch (err) {
      console.warn("BIN lookup failed:", err.message);
    }

    // ---- Order doc ----
    const orderDoc = {
      ...orderData,
      shop,
      guard: {
        isVerificationRequired: true,
        email: {
          lastSentAt: null,
          count: 0,
          maxPerPeriod: 1,
          minResendDelayMs: EMAIL_RESEND_DELAY_IN_DAYS * 86400000,
        },
        status: riskLevel?.reason?.includes("BIN/Card Brand lookup failed")
          ? "verification not available"
          : "pending",
        paymentStatus: { captured: false, cancelled: false },
        riskLevel,
        shopifyRisk: shopifyRiskAssessments,
        txnDetails: orderTxnDetails.map((txn) => ({
          ...txn,
          last4: txn.accountNumber ? txn.accountNumber.slice(-4) : null,
        })),

        cardBrand,
        bin,
        riskStatusTag:
          riskLevel.risk === "high" || riskLevel.risk === "high-medium"
            ? "FG_HighRisk"
            : riskLevel.risk === "medium"
            ? "FG_MediumRisk"
            : "FG_LowRisk",
        verificationStatusTag: riskLevel?.reason?.includes(
          "BIN/Card Brand lookup failed"
        )
          ? "FG_VerificationNotAvailable"
          : "FG_VerificationPending",
        ...(tier && { tier }),
        ...(accessControlMatch && { accessControlMatch }),
      },
      receivedAt: new Date(),
    };

    const insertResult = await retryDbOperation(() =>
      db
        .collection("orders")
        .updateOne(
          { shop, id: orderData.id },
          { $setOnInsert: orderDoc },
          { upsert: true }
        )
    );

    if (insertResult?.duplicateKeyError || insertResult?.matchedCount > 0) {
      isNewOrder = false;
    }

    // ---- Auto Reminder Setup ----
    try {
      const autoReminderEmails = automation?.autoReminderEmails ?? false;
      if (autoReminderEmails) {
        const reminderFrequency = Number(automation?.reminderFrequency ?? 2);
        const maximumReminders = Number(automation?.maximumReminders ?? 3);

        await db.collection("orders").updateOne(
          { shop, id: orderData.id },
          {
            $set: {
              "guard.reminders.intervalDays": reminderFrequency,
              "guard.reminders.maxReminders": maximumReminders,
              "guard.reminders.count": 0,
              "guard.reminders.lastSentAt": null,
            },
          }
        );

        await db.collection("scheduledTasks").insertOne({
          type: "email_reminder",
          shop,
          orderId: orderData.id,
          scheduledFor: new Date(Date.now() + reminderFrequency * 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
          attempts: 0,
        });
      }
    } catch (err) {
      console.error("Failed reminder setup:", err.message);
    }
  }

  // --------------------------
  // 2. AUTO CANCEL / APPROVE BASED ON SCORE
  // --------------------------
  const approveEnabled = automation?.isLowRiskApproved ?? false;
  const approveMax = automation?.lowRiskThreshold ?? 60;

  const cancelEnabled = automation?.isHighRiskCancelled ?? false;
  const cancelMin = automation?.highRiskThreshold ?? 70;

  const score = Number(riskLevel?.score || 0);

  if (cancelEnabled && score >= cancelMin) {
    console.log(`Auto-cancelling high risk order as Risk score is above auto-cancel threshold(${score}>${cancelMin})`);
    await makeApiRequest(
      "cancel",
      { orderId: orderData.id, shop, orderAmount: orderData.total_price, admin_graphql_api_id: orderData.admin_graphql_api_id },
      true
    );

    if (shopifyClient) {
      await addStatusTags(shopifyClient, orderData.admin_graphql_api_id, [
        "FG_AutoCancelled",
      ]);
    }

    return { processed: true, isNewOrder: false };
  }

  if (approveEnabled && score <= approveMax) {
    console.log(`Auto-approving low risk order as Risk score is below auto-approve threshold(${score}<${approveMax})`);
    await makeApiRequest(
      "capture",
      { orderId: orderData.id, shop, orderAmount: orderData.total_price },
      true
    );

    if (shopifyClient) {
      await addStatusTags(shopifyClient, orderData.admin_graphql_api_id, [
        "FG_AutoApproved",
      ]);
    }

    return { processed: true, isNewOrder: false };
  }

  // --------------------------
  // 3. IF FLAGGED → APPLY FULFILLMENT HOLD (ONLY FOR NEW ORDERS)
  // --------------------------
  let holdResult = null;
  if (isNewOrder && shopifyClient) {
    try {
      const fulfillmentOrders = await getFulfillmentOrders(
        shopifyClient,
        orderData.admin_graphql_api_id
      );

      if (fulfillmentOrders.length > 0) {
        const ids = fulfillmentOrders.map((fo) => fo.id);
        const holdReason =
          accessControlMatch?.listType === "blocklist"
            ? "HIGH_RISK_OF_FRAUD"
            : "OTHER";

        holdResult = await holdFulfillmentOrders(
          shopifyClient,
          ids,
          holdReason
        );

        if (holdResult.success) {
          await db.collection("orders").updateOne(
            { shop, id: orderData.id },
            {
              $set: {
                "guard.fulfillmentHold": {
                  applied: true,
                  appliedAt: new Date(),
                  fulfillmentOrderIds: ids,
                  results: holdResult.results,
                  reason: holdReason,
                },
              },
            }
          );
        } else {
          await scheduleFulfillmentHold(db, orderData, shop, 2);
        }
      } else {
        await scheduleFulfillmentHold(db, orderData, shop, 2);
      }
    } catch (err) {
      await scheduleFulfillmentHold(db, orderData, shop, 2);
    }
  }

  // --------------------------
  // 4. UPDATE HOLD STATS
  // --------------------------
  try {
    await updateOrdersOnHold(shop);
  } catch {}

  // --------------------------
  // 5. ONLY FLAGGED ORDERS GET TIMEOUT AUTO-RELEASE
  // --------------------------
  const isFlagged =
    whichOrdersToFlag(riskLevel, riskSettings) ||
    accessControlMatch?.shouldBlock;

  console.info(`[Timeout] isFlagged = ${isFlagged} for order ${orderData.id}`, {
    risk: riskLevel?.risk,
    score: riskLevel?.score,
    blocklist: accessControlMatch?.shouldBlock || false,
  });

  if (isFlagged) {
    try {
      const timeoutDays = automation?.timeoutDays ?? 3;
      const timeoutAction = automation?.timeoutAction ?? "approve";

      const scheduledDate = new Date(Date.now() + timeoutDays * 86400000);

      console.info(
        `[Timeout] Checking for existing timeout task for order ${orderData.id}`,
        {
          timeoutDays,
          timeoutAction,
          scheduledDate: scheduledDate.toISOString(),
        }
      );

      const existingTimeout = await db.collection("scheduled-tasks").findOne({
        shop,
        orderId: orderData.id,
        type: { $in: ["auto_approve", "auto_cancel"] },
        status: "scheduled",
      });

      if (existingTimeout) {
        console.info(
          `[Timeout] SKIPPED — Timeout task already exists for order ${orderData.id}`,
          {
            existingTaskId: existingTimeout._id,
            existingScheduledFor: existingTimeout.scheduledFor,
          }
        );
      } else {
        console.info(
          `[Timeout] INSERTING timeout task for order ${orderData.id}`,
          {
            willAuto: timeoutAction,
            runAt: scheduledDate.toISOString(),
          }
        );

        await db.collection("scheduled-tasks").insertOne({
          type: timeoutAction === "approve" ? "auto_approve" : "auto_cancel",
          status: "scheduled",
          shop,
          orderId: orderData.id,
          scheduledFor: scheduledDate,
          attempts: 0,
          maxAttempts: 3,
          orderData,
          createdAt: new Date(),
        });

        console.info(
          `[Timeout] SUCCESS — Timeout task created for order ${orderData.id}`
        );
      }
    } catch (err) {
      console.error(
        `[Timeout] ERROR scheduling timeout for ${orderData.id}:`,
        err.message
      );
    }
  }

  // --------------------------
  // 6. SEND VERIFICATION EMAIL
  // --------------------------
  if (whichOrdersToSendEmail(riskLevel, riskSettings)) {
    try {
      const storedOrder = await retryDbOperation(() =>
        db.collection("orders").findOne({ shop, id: orderData.id })
      );

      const isVerificationAvailable = !riskLevel?.reason?.includes(
        "BIN/Card Brand lookup failed"
      );

      if (storedOrder) {
        await makeApiRequest(
          "email",
          { order: storedOrder, isVerificationAvailable },
          true
        );

        await fetch(`${process.env.HOST}/api/checkAndSendReminder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shop, orderId: storedOrder.id }),
        });
      }
    } catch (err) {
      console.error("Email sending failed:", err.message);
    }
  }

  return { processed: true, isNewOrder };
}

async function handleHighRiskOrder(
  db,
  orderData,
  shop,
  riskLevel,
  riskSettings,
  shopifyApiRiskData,
  orderTxnDetails,
  shopifyClient,
  accessControlMatch
) {
  console.info(
    `Auto-canceling high-risk order ${orderData.id} with score ${riskLevel.score}`,
    { category: "webhook-order-create" }
  );

  const result = await handleFlaggedOrder(
    db,
    orderData,
    shop,
    riskLevel,
    riskSettings,
    shopifyApiRiskData,
    orderTxnDetails,
    shopifyClient,
    accessControlMatch
  );

  await makeApiRequest(
    "cancel",
    {
      orderId: orderData.id,
      shop,
      orderAmount: orderData.total_price,
      autoCanceled: true,
      reason: `Auto-canceled due to high risk score: ${riskLevel.score}`,
    },
    true
  );

  await db.collection("orders").updateOne(
    { shop, id: orderData.id },
    {
      $set: {
        "guard.status": "auto-canceled",
        "guard.autoCanceled": true,
        "guard.autoCanceledAt": new Date(),
      },
    }
  );

  if (shopifyClient && result.isNewOrder) {
    try {
      await addStatusTags(shopifyClient, orderData.admin_graphql_api_id, [
        "FG_HighRisk",
        "FG_AutoCancelled",
      ]);
    } catch (tagError) {
      console.warn(
        `Failed to add tags to auto-canceled order ${orderData.id}: ${tagError.message}`,
        { category: "webhook-order-create" }
      );
    }
  }

  return { ...result, action: "cancel" };
}

async function validateShopifyWebhook(req, rawBodyString, res) {
  const shop = req.headers["x-shopify-shop-domain"];
  const topic = req.headers["x-shopify-topic"];

  if (!shop) {
    if (!res.headersSent)
      res.status(400).json({ error: "Missing x-shopify-shop-domain header" });
    return false;
  }
  if (!topic) {
    if (!res.headersSent)
      res.status(400).json({ error: "Missing x-shopify-topic header" });
    return false;
  }

  try {
    const isValid = await shopify.webhooks.validate({
      rawBody: rawBodyString,
      rawRequest: req,
      rawResponse: res,
    });
    if (!isValid && !res.headersSent) {
      res
        .status(401)
        .json({ error: "Invalid webhook signature (returned false)" });
    }
    return isValid;
  } catch (error) {
    console.error("Shopify webhook validation error:", error.message, {
      category: "webhook-order-create",
    });
    if (!res.headersSent) {
      res
        .status(401)
        .json({ error: `Webhook validation failed: ${error.message}` });
    }
    return false;
  }
}

async function fetchRiskSettings(shop) {
  try {
    const response = await axios.get(
      `${process.env.HOST}/api/settings/risk-settings?shop=${shop}`
    );
    return response.data;
  } catch (error) {
    const errorText = error.response?.data || error.message;
    console.warn(
      `Non-critical: Failed to fetch risk settings for ${shop}: ${errorText}`,
      { category: "webhook-order-create" }
    );
    return {};
  }
}

async function checkAndMarkWebhookProcessed(db, idempotencyKey, orderId, shop) {
  if (!idempotencyKey) {
    console.warn(
      `Missing idempotency key for order ${orderId} on shop ${shop}. Proceeding without duplicate check.`,
      { category: "webhook-order-create" }
    );
    return { canProcess: true };
  }

  try {
    await db
      .collection("processed-webhooks")
      .createIndex({ key: 1, orderId: 1 }, { unique: true, background: true });
  } catch (indexError) {
    console.warn(
      `Non-critical: Failed to ensure 'key_1_orderId_1' index on processed-webhooks for ${shop}: ${indexError.message}.`,
      { category: "webhook-order-create" }
    );
  }

  const processedWebhook = await db
    .collection("processed-webhooks")
    .findOne({ key: idempotencyKey, orderId });
  if (processedWebhook) {
    console.info(
      `Webhook for order ${orderId} (key: ${idempotencyKey}) on shop ${shop} already processed at ${processedWebhook.processedAt}.`,
      { category: "webhook-order-create" }
    );
    return { canProcess: false, message: "Webhook already processed" };
  }

  try {
    await db
      .collection("processed-webhooks")
      .updateOne(
        { key: idempotencyKey, orderId },
        { $setOnInsert: { processedAt: new Date(), shop } },
        { upsert: true }
      );
    return { canProcess: true };
  } catch (err) {
    if (err.code === 11000) {
      console.info(
        `Concurrent processing detected for webhook order ${orderId} (key: ${idempotencyKey}) on shop ${shop}.`,
        { category: "webhook-order-create" }
      );
      return {
        canProcess: false,
        message: "Webhook processed concurrently by another instance",
      };
    }
    console.warn(
      `Failed to mark webhook as processed (key: ${idempotencyKey}, order ${orderId}, shop ${shop}): ${err.message}. Proceeding with caution.`,
      { category: "webhook-order-create" }
    );
    return {
      canProcess: true,
      warning: "Failed to record processed webhook, but proceeding.",
    };
  }
}

async function enqueueWebhook(db, webhookData) {
  const queueItem = {
    ...webhookData,
    status: "pending",
    createdAt: new Date(),
    attempts: 0,
    maxAttempts: 3,
  };

  try {
    await db
      .collection("webhook-queue")
      .createIndex({ createdAt: 1 }, { background: true });
    await db
      .collection("webhook-queue")
      .createIndex({ status: 1, createdAt: 1 }, { background: true });

    const result = await db.collection("webhook-queue").insertOne(queueItem);
    console.info(
      `Webhook queued for order ${webhookData.orderData.id} with ID: ${result.insertedId}.`,
      { category: "webhook-order-create" }
    );
    return result.insertedId;
  } catch (error) {
    console.error("Failed to enqueue webhook:", error, {
      category: "webhook-order-create",
    });
    throw error;
  }
}

async function triggerQueueProcessor(shop) {
  try {
    await axios.post(
      `${process.env.HOST}/api/process-queue`,
      { shop },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.warn("Failed to trigger queue processor:", error.message, {
      category: "webhook-order-create",
    });
  }
}

export async function processQueuedWebhook(db, queueItem) {
  const { orderData, shop, idempotencyKey, rawHeaders } = queueItem;

  try {
    await db.collection("webhook-queue").updateOne(
      { _id: queueItem._id },
      {
        $set: {
          status: "processing",
          processingStartedAt: new Date(),
          attempts: queueItem.attempts + 1,
        },
      }
    );

    let session;
    try {
      session = await sessionHandler.loadSession(shop);
      if (!session?.accessToken)
        throw new Error("Invalid session or missing access token");
    } catch (sessionError) {
      console.warn(
        `Session loading issue for ${shop}: ${sessionError.message}. Continuing with limited functionality.`,
        { category: "webhook-order-create" }
      );
      session = null;
    }

    let shopifyClient = null;
    if (session?.accessToken) {
      shopifyClient = new shopify.clients.Graphql({ session });
    }

    const accessControlCheck = await checkAccessControl(db, shop, orderData);

    if (accessControlCheck.shouldBypass) {
      console.info(
        `Order ${orderData.id} is in allowlist (${accessControlCheck.matchType}: ${accessControlCheck.matchValue}). Bypassing risk assessment and capturing payment.`,
        { category: "webhook-order-create" }
      );

      const existingOrderInDb = await db
        .collection("orders")
        .findOne({ shop, id: orderData.id });
      if (existingOrderInDb) {
        console.info(
          `Order ${orderData.id} (allowlist path) for shop ${shop} already exists in our database. Assuming handled.`,
          { category: "webhook-order-create" }
        );
      } else {
        const captureData = {
          orderId: orderData.id,
          shop,
          orderAmount: orderData.total_price,
          notFlagged: true,
          allowlisted: true,
        };
        const captureResult = await makeApiRequest(
          "capture",
          captureData,
          true
        );

        if (!captureResult.success) {
          console.warn(
            `Payment capture attempt for allowlisted order ${orderData.id} (shop ${shop}) was not successful: ${captureResult.error}.`,
            { category: "webhook-order-create" }
          );
        } else {
          console.info(
            `Payment capture successful for allowlisted order ${orderData.id} (shop ${shop}).`,
            { category: "webhook-order-create" }
          );
        }
      }

      if (shopifyClient) {
        try {
          const tagsToAdd = ["FG_WHITELIST"];
          const tagResult = await addStatusTags(
            shopifyClient,
            orderData.admin_graphql_api_id,
            tagsToAdd
          );
          if (tagResult) {
            console.info(
              `Successfully added tags ${tagsToAdd.join(
                ", "
              )} to allowlisted order ${orderData.id}.`,
              { category: "webhook-order-create" }
            );
          } else {
            console.warn(
              `Failed to add FG_WHITELIST tag to allowlisted order ${orderData.id}.`,
              { category: "webhook-order-create" }
            );
          }
        } catch (tagError) {
          console.warn(
            `Non-critical: Error adding FG_WHITELIST tag to order ${orderData.id}: ${tagError.message}`,
            { category: "webhook-order-create" }
          );
        }
      } else {
        console.warn(
          `Skipping FG_WHITELIST tag addition for order ${orderData.id} due to missing Shopify client.`,
          { category: "webhook-order-create" }
        );
      }

      await db.collection("webhook-queue").updateOne(
        { _id: queueItem._id },
        {
          $set: {
            status: "completed",
            completedAt: new Date(),
            allowlisted: true,
          },
        }
      );

      console.info(
        `Successfully processed allowlisted webhook for order ${orderData.id}.`,
        { category: "webhook-order-create" }
      );
      return true;
    }

    const [riskSettings, shopifyApiRiskData] = await Promise.all([
      fetchRiskSettings(shop),
      shopifyClient
        ? getOrderRisks(shopifyClient, orderData.admin_graphql_api_id)
        : Promise.resolve({}),
    ]);

    const orderTxnDetails = shopifyClient
      ? await getOrderTxnDetails(shopifyClient, orderData.admin_graphql_api_id)
      : [];

    console.info(
      `Order ${orderData.id} for shop ${shop} has transaction details:`,
      orderTxnDetails,
      { category: "webhook-order-create" }
    );

    let riskLevel;
    try {
      riskLevel = await getRiskLevel(
        orderData,
        shop,
        session?.accessToken,
        shopifyApiRiskData,
        orderTxnDetails
      );
    } catch (riskError) {
      console.warn(
        `Risk assessment failed for order ${orderData.id}, shop ${shop}: ${riskError.message}. Using fallback.`,
        { category: "webhook-order-create" }
      );
      riskLevel = {
        risk: "unknown",
        score: 0,
        error: `Risk assessment failed: ${riskError.message}`,
        fallback: true,
      };
    }

    if (accessControlCheck.shouldBlock) {
      console.info(
        `Order ${orderData.id} is in blocklist (${accessControlCheck.matchType}: ${accessControlCheck.matchValue}). Forcing order to be flagged.`,
        { category: "webhook-order-create" }
      );

      riskLevel = {
        ...riskLevel,
        reason: [
          ...(riskLevel.reason || []),
          `Blocklist match: ${accessControlCheck.matchType} (${accessControlCheck.matchValue})`,
        ],
        blocklisted: true,
      };
    }

    // Load automation settings from DB for prioritized decision-making
    let automation = null;
    try {
      automation = await db.collection("automationSettings").findOne({ shop });
    } catch (e) {
      console.warn(
        `Non-critical: Failed to load automation settings for ${shop}: ${e.message}`,
        { category: "webhook-order-create" }
      );
    }

    const orderAction = determineOrderAction(riskLevel, riskSettings, automation);

    console.info(
      `Order ${orderData.id} - Action: ${orderAction.action}, Reason: ${orderAction.reason}`,
      { category: "webhook-order-create" }
    );

    let result;

    if (orderAction.action === "capture" && !accessControlCheck.shouldBlock) {
      result = await handleLowRiskOrder(
        db,
        orderData,
        shop,
        riskLevel,
        shopifyClient,
        orderAction
      );
    } else if (orderAction.action === "cancel") {
      result = await handleHighRiskOrder(
        db,
        orderData,
        shop,
        riskLevel,
        riskSettings,
        shopifyApiRiskData,
        orderTxnDetails,
        shopifyClient,
        accessControlCheck.shouldBlock ? accessControlCheck : null
      );
    } else {
      if (
        whichOrdersToFlag(riskLevel, riskSettings) ||
        accessControlCheck.shouldBlock
      ) {
        console.info(
          `Order ${orderData.id} for shop ${shop} is being flagged. Risk: ${riskLevel.risk}, Score: ${riskLevel.score}.`,
          { category: "webhook-order-create" }
        );

        result = await handleFlaggedOrder(
          db,
          orderData,
          shop,
          riskLevel,
          riskSettings,
          shopifyApiRiskData,
          orderTxnDetails,
          shopifyClient,
          accessControlCheck.shouldBlock ? accessControlCheck : null
        );

        if (result.isNewOrder && shopifyClient) {
          const riskTagStatus = (() => {
            const score = riskLevel.score;
            if (score >= 70) return "FG_HighRisk";
            if (score >= 40) return "FG_MediumRisk";
            return "FG_LowRisk";
          })();
          const verificationStatusTag = riskLevel?.reason?.includes(
            "BIN/Card Brand lookup failed"
          )
            ? "FG_VerificationNotAvailable"
            : "FG_VerificationPending";

          const tagsToAdd = [verificationStatusTag, "FG_HOLD"];

          if (
            !accessControlCheck.shouldBlock ||
            riskTagStatus !== "FG_LowRisk"
          ) {
            tagsToAdd.push(riskTagStatus);
          }

          if (accessControlCheck.shouldBlock) {
            tagsToAdd.push("FG_BLOCKLIST");
          }

          const filteredTags = tagsToAdd.filter((tag) => tag && tag.trim());

          if (filteredTags.length > 0) {
            try {
              const tagResult = await addStatusTags(
                shopifyClient,
                orderData.admin_graphql_api_id,
                filteredTags
              );
              if (tagResult) {
                console.info(
                  `Successfully added tags ${filteredTags.join(
                    ", "
                  )} to order ${orderData.id}.`,
                  { category: "webhook-order-create" }
                );
              } else {
                console.warn(`Failed to add tags to order ${orderData.id}.`, {
                  category: "webhook-order-create",
                });
              }
            } catch (tagError) {
              console.warn(
                `Non-critical: Error adding tags to order ${orderData.id}: ${tagError.message}`,
                { category: "webhook-order-create" }
              );
            }
          }
        } else if (result.isNewOrder && !shopifyClient) {
          console.warn(
            `Skipping tag addition for order ${orderData.id} due to missing Shopify client.`,
            { category: "webhook-order-create" }
          );
        } else {
          console.info(
            `Skipping tag addition for order ${orderData.id} as it already exists in database.`,
            { category: "webhook-order-create" }
          );
        }
      } else {
        const existingOrderInDb = await db
          .collection("orders")
          .findOne({ shop, id: orderData.id });
        if (existingOrderInDb) {
          console.info(
            `Order ${orderData.id} (not flagged path) for shop ${shop} already exists in our database. Assuming handled.`,
            { category: "webhook-order-create" }
          );
        } else {
          console.info(
            `Order ${orderData.id} for shop ${shop} not flagged. Attempting payment capture.`,
            { category: "webhook-order-create" }
          );
          const captureData = {
            orderId: orderData.id,
            shop,
            orderAmount: orderData.total_price,
            notFlagged: true,
          };
          const captureResult = await makeApiRequest(
            "capture",
            captureData,
            true
          );

          if (!captureResult.success) {
            console.warn(
              `Payment capture attempt for order ${orderData.id} (shop ${shop}) was not successful: ${captureResult.error}.`,
              { category: "webhook-order-create" }
            );
          } else {
            console.info(
              `Payment capture attempt for order ${orderData.id} (shop ${shop}) processed. API response:`,
              captureResult,
              { category: "webhook-order-create" }
            );
          }
        }
      }
    }

    await db.collection("webhook-queue").updateOne(
      { _id: queueItem._id },
      {
        $set: {
          status: "completed",
          completedAt: new Date(),
        },
      }
    );

    console.info(
      `Successfully processed queued webhook for order ${orderData.id}.`,
      { category: "webhook-order-create" }
    );
    return true;
  } catch (error) {
    console.error(
      `Error processing queued webhook for order ${orderData.id}:`,
      error.message,
      { category: "webhook-order-create" }
    );

    const shouldRetry = queueItem.attempts < queueItem.maxAttempts;
    const updateData = shouldRetry
      ? {
          status: "pending",
          lastError: error.message,
          lastAttemptAt: new Date(),
          nextAttemptAfter: new Date(Date.now() + queueItem.attempts * 30000),
        }
      : {
          status: "failed",
          lastError: error.message,
          failedAt: new Date(),
        };

    await db
      .collection("webhook-queue")
      .updateOne({ _id: queueItem._id }, { $set: updateData });

    if (!shouldRetry) {
      console.error(
        `Webhook processing failed permanently for order ${orderData.id} after ${queueItem.attempts} attempts.`,
        { category: "webhook-order-create" }
      );
    }

    return false;
  }
}

const handler = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const shop = req.headers["x-shopify-shop-domain"];
  const idempotencyKey =
    req.headers["x-shopify-hmac-sha256"] || req.headers["x-shopify-order-id"];

  let rawBodyString;
  try {
    const rawBodyBuffer = await buffer(req);
    rawBodyString = rawBodyBuffer.toString("utf8");
  } catch (bufError) {
    console.error("Failed to buffer request body:", bufError, {
      category: "webhook-order-create",
    });
    return res.status(500).json({ error: "Failed to read request body" });
  }

  if (!(await validateShopifyWebhook(req, rawBodyString, res))) {
    return;
  }

  let orderData;
  try {
    orderData = JSON.parse(rawBodyString);
  } catch (parseError) {
    console.error("Failed to parse webhook JSON body:", parseError, {
      category: "webhook-order-create",
    });
    return res.status(400).json({ error: "Invalid JSON in webhook body" });
  }

  if (!shop || !orderData?.id || !orderData?.admin_graphql_api_id) {
    console.error(
      "Invalid webhook data: Missing shop, order ID, or admin_graphql_api_id.",
      { shop, orderId: orderData?.id, category: "webhook-order-create" }
    );
    return res
      .status(400)
      .json({ error: "Incomplete or invalid order data in webhook." });
  }

  let mongoClient;
  let db;
  try {
    mongoClient = await clientPromise;
    const storeName = shop.split(".")[0];
    db = mongoClient.db(storeName);
  } catch (dbConnectionError) {
    console.error(
      `MongoDB connection error for shop ${shop}:`,
      dbConnectionError,
      { category: "webhook-order-create" }
    );
    return res.status(500).json({ error: "Database connection failed" });
  }

  const processingStatus = await checkAndMarkWebhookProcessed(
    db,
    idempotencyKey,
    orderData.id,
    shop
  );
  if (!processingStatus.canProcess) {
    return res
      .status(200)
      .json({ success: true, message: processingStatus.message });
  }
  if (processingStatus.warning)
    console.warn(processingStatus.warning, {
      category: "webhook-order-create",
    });

  try {
    const webhookData = {
      orderData,
      shop,
      idempotencyKey,
      rawHeaders: req.headers,
    };

    await enqueueWebhook(db, webhookData);
    triggerQueueProcessor(shop);

    return res.status(200).json({
      success: true,
      message: "Webhook received and queued for processing",
    });
  } catch (error) {
    console.error(
      `Failed to queue webhook for order ${orderData.id}, shop ${shop}:`,
      error,
      { category: "webhook-order-create" }
    );
    return res
      .status(500)
      .json({ error: "Failed to queue webhook for processing" });
  }
};

export default withMiddleware("verifyHmac")(handler);
