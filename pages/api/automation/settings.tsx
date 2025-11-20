import clientPromise from "../../../lib/mongo"; // adjust path if needed

export default async function handler(req, res) {
    
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const client = await clientPromise;
    const db = client.db("fraudguard-dev");

    const {
      isLowRiskApproved,
      lowRiskThreshold,
      isHighRiskCancelled,
      highRiskThreshold,
      shop
    } = req.body;

    console.log("Automation settings updated:", {
  isLowRiskApproved,
  lowRiskThreshold,
  isHighRiskCancelled,
  highRiskThreshold,
  shop
});


    // You must send "shop" OR derive it from session
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

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Automation settings save failed:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
