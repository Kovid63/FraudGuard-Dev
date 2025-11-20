import clientPromise from "./mongo.js";
import  makeApiRequest  from "../lib/apiRequest.js";

export default async function processScheduledTasks() {
  const client = await clientPromise;
  const db = client.db("fraudguard-dev");

  const now = new Date();

  // Find scheduled tasks that are due
  const tasksCursor = db.collection("scheduledTasks").find({
    scheduledFor: { $lte: now },
    attempts: { $lt: 3 },
  });

  const tasks = await tasksCursor.toArray();

  for (const task of tasks) {
    try {
      console.info(`Processing scheduled task for order ${task.orderId} (${task.action})`);

      if (task.action === "approve") {
        await makeApiRequest("capture", {
          orderId: task.orderId,
          shop: task.shop,
          orderAmount: task.orderAmount,
        });
      } else if (task.action === "cancel") {
        await makeApiRequest("cancel", {
          orderId: task.orderId,
          shop: task.shop,
          orderAmount: task.orderAmount,
        });
      }

      // Mark task as done
      await db.collection("scheduledTasks").updateOne(
        { _id: task._id },
        { $set: { completedAt: new Date(), attempts: task.attempts + 1 } }
      );

      console.info(`Task for order ${task.orderId} completed ✅`);
    } catch (err) {
      console.error(`Failed task for order ${task.orderId}:`, err.message);

      // Increment attempts
      await db.collection("scheduledTasks").updateOne(
        { _id: task._id },
        { $inc: { attempts: 1 } }
      );
    }
  }
}
