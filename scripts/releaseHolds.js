// pages/api/release-holds.js
import clientPromise from "../../lib/mongo.js";
import { makeApiRequest } from "../../lib/shopify.js";

async function releaseHolds() {
  try {
    const client = await clientPromise;
    const db = client.db("fraudguard-dev"); // adjust if you have dynamic DBs

    const settings = await db.collection("automationSettings").find({}).toArray();

    for (const shopSettings of settings) {
      const { shop, timeoutDays, timeoutAction } = shopSettings;
      if (!timeoutDays || !timeoutAction) continue;

      const heldOrders = await db.collection("orders").find({
        shop,
        "guard.fulfillmentHold.applied": true,
      }).toArray();

      for (const order of heldOrders) {
        const holdStart = order.guard?.fulfillmentHold?.appliedAt;
        if (!holdStart) continue;

        const diffDays = (new Date() - new Date(holdStart)) / (1000 * 60 * 60 * 24);
        if (diffDays >= timeoutDays) {
          if (timeoutAction.toLowerCase().includes("approve")) {
            console.info(`Auto-approving order ${order.id} after ${diffDays.toFixed(1)} days`);
            await makeApiRequest("capture", { orderId: order.id, shop, orderAmount: order.total_price }, true);
          } else if (timeoutAction.toLowerCase().includes("cancel")) {
            console.info(`Auto-cancelling order ${order.id} after ${diffDays.toFixed(1)} days`);
            await makeApiRequest("cancel", { orderId: order.id, shop, orderAmount: order.total_price }, true);
          }

          await db.collection("orders").updateOne(
            { shop, id: order.id },
            { $set: { "guard.fulfillmentHold.resolvedAt": new Date(), "guard.fulfillmentHold.applied": false } }
          );
        }
      }
    }

    console.log("Hold release script completed ✅");
    return { success: true };
  } catch (err) {
    console.error("Error in releaseHolds:", err);
    return { success: false, error: err.message };
  }
}

export default async function handler(req, res) {
  const result = await releaseHolds();
  res.status(result.success ? 200 : 500).json(result);
}
