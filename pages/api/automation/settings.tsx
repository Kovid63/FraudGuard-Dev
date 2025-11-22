import clientPromise from "../../../lib/mongo";

export default async function handler(req, res) {
  try {
    const client = await clientPromise;
    const db = client.db("fraudguard-dev");

    if (req.method === "GET") {
      const shop = req.query.shop;

      if (!shop) {
        return res.status(400).json({ error: "Shop is required" });
      }

      const settings = await db
        .collection("automationSettings")
        .findOne({ shop });

      return res.status(200).json(settings || {});
    }

    // ------------------ POST (SAVE) ------------------
    if (req.method === "POST") {
      const {
        isLowRiskApproved,
        lowRiskThreshold,
        isHighRiskCancelled,
        highRiskThreshold,
        shop,
      } = req.body;

      if (!shop) {
        return res.status(400).json({ error: "Shop is required" });
      }

      await db.collection("automationSettings").updateOne(
        { shop },
        {
          $set: {
            isLowRiskApproved,
            lowRiskThreshold,
            isHighRiskCancelled,
            highRiskThreshold,
          },
        },
        { upsert: true }
      );

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("Automation settings failed:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}