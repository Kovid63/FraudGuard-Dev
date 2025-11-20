import clientPromise from "../../../lib/mongo";

export default async function handler(req, res) {
  console.log("Received:", req.body);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const client = await clientPromise;

    const { shop, timeoutDays, timeoutAction } = req.body;

    if (!shop) {
      return res.status(400).json({ error: "Shop is required" });
    }

    // Convert shop domain → DB name
    const dbName = shop.split(".")[0];
    const db = client.db(dbName);

    // Validate timeoutAction
    if (!["approve", "cancel"].includes(timeoutAction)) {
      return res.status(400).json({
        error: "timeoutAction must be either 'approve' or 'cancel'",
      });
    }

    // Update only timeout fields
    await db.collection("automationSettings").updateOne(
      { shop },
      {
        $set: {
          timeoutDays: Number(timeoutDays),
          timeoutAction: timeoutAction, // "approve" or "cancel"
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    console.log("Timeout settings updated:", {
      shop,
      timeoutDays,
      timeoutAction,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Timeout settings save failed:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
