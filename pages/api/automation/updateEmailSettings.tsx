// /pages/api/automation/updateEmailSettings.js
import clientPromise from "../../../lib/mongo";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    console.warn("[Automation API] Invalid method:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { shop, reminderFrequency, maximumReminders, autoReminderEmails } =
      req.body;

    console.log("[Automation API] 📨 Incoming email settings update:", {
      shop,
      reminderFrequency,
      maximumReminders,
      autoReminderEmails,
    });

    if (!shop) {
      console.warn("[Automation API] ⚠️ Missing shop in request body.");
      return res.status(400).json({ error: "Missing shop identifier" });
    }

    const client = await clientPromise;
    const db = client.db("fraudguard-dev");

    const result = await db.collection("automationSettings").updateOne(
      { shop },
      {
        $set: {
          reminderFrequency: Number(reminderFrequency) || 2,
          maximumReminders: Number(maximumReminders) || 3,
          autoReminderEmails: !!autoReminderEmails,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    console.log("[Automation API] ✅ Email settings saved successfully:", result);

    res.status(200).json({
      success: true,
      updated: result.modifiedCount || result.upsertedCount,
    });
  } catch (err) {
    console.error("[Automation API] ❌ Failed to update email settings:", err);
    res.status(500).json({ error: err.message });
  }
}
