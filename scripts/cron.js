import cron from "node-cron";
import releaseHolds from "./releaseHolds.js";

// Schedule: every hour at minute 0
cron.schedule("0 * * * *", () => {
  console.log("Running scheduled hold release...");
  releaseHolds();
});
