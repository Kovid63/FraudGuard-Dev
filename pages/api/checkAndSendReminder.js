// pages/api/checkAndSendReminder.js
import clientPromise from "../../lib/mongo";
import  makeApiRequest  from "../../lib/apiRequest"; // ✅ Added import to send real emails

export default async function handler(req, res) {
  try {
    const { shop, orderId } = req.body;
    if (!shop || !orderId)
      return res.status(400).json({ error: "Missing shop or orderId" });

    const client = await clientPromise;
    const db = client.db("fraudguard-dev");

    // 1️⃣ Fetch the order
const order = await db.collection("orders").findOne({
  shop,
  id: Number(orderId),
});
    if (!order) return res.status(404).json({ error: "Order not found" });

    const reminders = order?.guard?.reminders || {};
    const lastSent = reminders.lastSentAt ? new Date(reminders.lastSentAt) : null;
    const count = reminders.count || 0;
    const max = reminders.maxReminders || 3;
    const intervalDays = reminders.intervalDays || 2;

    const nextDue =
      lastSent ? new Date(lastSent.getTime() + intervalDays * 24 * 60 * 60 * 1000) : null;
    const now = new Date();

    // 2️⃣ Skip if max reminders reached
    if (count >= max) {
      console.info(`[ReminderCheck] Max reminders reached for ${orderId}`);
      return res.status(200).json({ message: "Max reminders reached" });
    }

    // 3️⃣ Check if it's time for next reminder
    if (!lastSent || now >= nextDue) {
      console.info(`[ReminderCheck] Sending reminder email for ${orderId}`);

      // ✅ Actually send the email via your existing API
      await makeApiRequest(
        "email",
        { order, isVerificationAvailable: true, isReminder: true },
        true
      );

      // 4️⃣ Update reminder tracking in DB
      await db.collection("orders").updateOne(
        { shop, id: orderId },
        {
          $inc: { "guard.reminders.count": 1 },
          $set: { "guard.reminders.lastSentAt": new Date() },
        }
      );

      console.info(`[ReminderCheck] ✅ Reminder email sent for ${orderId}`);
      return res.status(200).json({ message: "Reminder sent" });
    }

    // 5️⃣ Not yet time
    console.info(`[ReminderCheck] No reminder needed yet for ${orderId}`);
    return res.status(200).json({ message: "Not yet time" });

  } catch (err) {
    console.error("checkAndSendReminder failed:", err);
    res.status(500).json({ error: err.message });
  }
}
