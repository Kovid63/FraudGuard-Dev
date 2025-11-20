// pages/api/process-scheduled-tasks.js
import clientPromise from "../../lib/mongo";
import { shopify } from "../../lib/shopify";
import sessionHandler from "./utils/sessionHandler";
import { addStatusTags } from "./utils/addStatusTags";

import axios from "axios";

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
        { category: "timeout-cron" }
      );
      return { success: false, error: errorMessage };
    }
    console.error(
      `Error in makeApiRequest for /api/${endpoint}:`,
      errorMessage,
      { category: "timeout-cron" }
    );
    throw error;
  }
}

async function getFulfillmentOrders(
  shopifyClient,
  orderIdGid,
  maxRetries = 3,
  delayMs = 1000
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
        return fulfillmentOrders;
      }

      return [];
    } catch (error) {
      const gqlErrors = error.response?.errors
        ? JSON.stringify(error.response.errors, null, 2)
        : "";
      console.warn(
        `Error fetching fulfillment orders (attempt ${attempt}/${maxRetries}):`,
        error.message,
        gqlErrors,
        { category: "scheduled-tasks" }
      );

      if (attempt === maxRetries) {
        throw error;
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
    return { success: false, error: "No fulfillment order IDs provided" };
  }

  // Based on Shopify documentation, use the correct mutation structure
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
          reason: reason, // Use enum values like 'OTHER', 'INVENTORY_OUT_OF_STOCK', etc.
          reasonNotes: "Order flagged by Fraud Guard risk assessment system",
        },
      };

      const response = await shopifyClient.request(mutation, { variables });

      if (response?.data?.fulfillmentOrderHold?.userErrors?.length > 0) {
        const errors = response.data.fulfillmentOrderHold.userErrors;
        results.push({
          fulfillmentOrderId,
          success: false,
          errors: errors.map((e) => e.message).join(", "),
        });
      } else if (response?.data?.fulfillmentOrderHold?.fulfillmentOrder) {
        results.push({
          fulfillmentOrderId,
          success: true,
          status: response.data.fulfillmentOrderHold.fulfillmentOrder.status,
          holdId: response.data.fulfillmentOrderHold.fulfillmentHold?.id,
        });
      } else {
        results.push({
          fulfillmentOrderId,
          success: false,
          error: "Unexpected response structure",
        });
      }
    } catch (error) {
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

async function processTimeoutTask(db, task) {
  const { orderId, shop, orderData } = task;

  try {
    console.info(
      `[TimeoutCron] Starting timeout task for order ${orderId} → ${task.type}`,
      { category: "scheduled-tasks" }
    );

    // Load session
    const session = await sessionHandler.loadSession(shop);
    if (!session?.accessToken) {
      throw new Error("Missing Shopify session");
    }

    const shopifyClient = new shopify.clients.Graphql({ session });

    // Determine API action (capture or cancel)
    const isApprove = task.type === "auto_approve";
    const apiAction = isApprove ? "capture" : "cancel";

    // Run platform API (same as used normally)
    const result = await makeApiRequest(
      apiAction,
      {
        orderId,
        shop,
        orderAmount: orderData?.total_price,
        fromTimeout: true,
      },
      true
    );

    if (!result.success) {
      throw new Error(`API failed: ${result.error}`);
    }

    // Apply tag to Shopify
    const tagToAdd = isApprove ? "FG_TimeoutApproved" : "FG_TimeoutCancelled";

    try {
      await addStatusTags(shopifyClient, orderData.admin_graphql_api_id, [
        tagToAdd,
      ]);

      console.info(`[TimeoutCron] Added tag ${tagToAdd} to order ${orderId}`, {
        category: "scheduled-tasks",
      });
    } catch (tagError) {
      console.warn(
        `[TimeoutCron] Tagging failed for ${orderId}: ${tagError.message}`,
        { category: "scheduled-tasks" }
      );
    }

    return { success: true };
  } catch (err) {
    console.error(
      `[TimeoutCron] Error processing timeout task for ${orderId}: ${err.message}`,
      { category: "scheduled-tasks" }
    );
    throw err;
  }
}


async function processFulfillmentHoldTask(db, task) {
  const { orderData, shop } = task;

  try {
    // Load session for the shop
    const session = await sessionHandler.loadSession(shop);
    if (!session?.accessToken) {
      throw new Error("Invalid session or missing access token");
    }

    // Create Shopify GraphQL client
    const shopifyClient = new shopify.clients.Graphql({ session });

    // Get fulfillment orders
    const fulfillmentOrders = await getFulfillmentOrders(
      shopifyClient,
      orderData.admin_graphql_api_id
    );

    if (fulfillmentOrders && fulfillmentOrders.length > 0) {
      const fulfillmentOrderIds = fulfillmentOrders.map((fo) => fo.id);
      const holdResult = await holdFulfillmentOrders(
        shopifyClient,
        fulfillmentOrderIds
      );

      if (holdResult.success) {
        console.info(
          `Successfully applied scheduled hold to fulfillment orders for order ${orderData.id}:`,
          holdResult.summary,
          { category: "scheduled-tasks" }
        );

        // Update the order in the database to track the hold status
        await db.collection("orders").updateOne(
          { shop, id: orderData.id },
          {
            $set: {
              "guard.fulfillmentHold": {
                applied: true,
                appliedAt: new Date(),
                appliedViaScheduledTask: true,
                fulfillmentOrderIds,
                results: holdResult.results,
              },
            },
          }
        );

        return { success: true, result: holdResult };
      } else {
        throw new Error(`Failed to apply hold: ${JSON.stringify(holdResult)}`);
      }
    } else {
      throw new Error("No fulfillment orders found");
    }
  } catch (error) {
    console.error(
      `Error processing fulfillment hold task for order ${orderData.id}:`,
      error.message,
      { category: "scheduled-tasks" }
    );
    throw error;
  }
}

async function processScheduledTasks() {
  const mongoClient = await clientPromise;
  const adminDb = mongoClient.db("admin");

  // Get list of all database names (shop databases)
  const { databases } = await mongoClient.db().admin().listDatabases();
  const shopDatabases = databases
    .map((db) => db.name)
    .filter(
      (name) => name !== "admin" && name !== "local" && name !== "config"
    );

  let totalProcessed = 0;
  let totalErrors = 0;

  for (const dbName of shopDatabases) {
    try {
      const db = mongoClient.db(dbName);

      // Find tasks that are due for processing
      const dueTasks = await db
        .collection("scheduled-tasks")
        .find({
          status: "scheduled",
          scheduledFor: { $lte: new Date() },
        })
        .toArray();

      for (const task of dueTasks) {
        try {
          // Mark task as processing
          await db.collection("scheduled-tasks").updateOne(
            { _id: task._id },
            {
              $set: {
                status: "processing",
                processingStartedAt: new Date(),
                attempts: task.attempts + 1,
              },
            }
          );

          let result;
          if (task.type === "fulfillment_hold") {
            result = await processFulfillmentHoldTask(db, task);
          } else if (["auto_approve", "auto_cancel"].includes(task.type)) {
            result = await processTimeoutTask(db, task);
          } else {
            throw new Error(`Unknown task type: ${task.type}`);
          }

          // Mark task as completed
          await db.collection("scheduled-tasks").updateOne(
            { _id: task._id },
            {
              $set: {
                status: "completed",
                completedAt: new Date(),
                result: result,
              },
            }
          );

          totalProcessed++;
          console.info(
            `Successfully processed scheduled task ${task._id} for order ${task.orderData?.id}`,
            { category: "scheduled-tasks" }
          );
        } catch (taskError) {
          console.error(
            `Error processing scheduled task ${task._id}:`,
            taskError.message,
            { category: "scheduled-tasks" }
          );
          totalErrors++;

          const shouldRetry = task.attempts < task.maxAttempts;
          const updateData = shouldRetry
            ? {
                status: "scheduled",
                lastError: taskError.message,
                lastAttemptAt: new Date(),
                scheduledFor: new Date(Date.now() + task.attempts * 60000), // Retry in 1 minute * attempts
              }
            : {
                status: "failed",
                lastError: taskError.message,
                failedAt: new Date(),
              };

          await db
            .collection("scheduled-tasks")
            .updateOne({ _id: task._id }, { $set: updateData });

          if (!shouldRetry) {
            console.error(
              `Scheduled task ${task._id} failed permanently after ${task.attempts} attempts`,
              { category: "scheduled-tasks" }
            );
          }
        }
      }
    } catch (dbError) {
      console.error(
        `Error processing scheduled tasks for database ${dbName}:`,
        dbError.message,
        { category: "scheduled-tasks" }
      );
      totalErrors++;
    }
  }

  return { totalProcessed, totalErrors };
}

export default async function handler(req, res) {
  try {
    const result = await processScheduledTasks();

    console.info(
      `Scheduled tasks processing completed. Processed: ${result.totalProcessed}, Errors: ${result.totalErrors}`,
      { category: "scheduled-tasks" }
    );

    return res.status(200).json({
      success: true,
      message: "Scheduled tasks processed",
      result,
    });
  } catch (error) {
    console.error("Error in scheduled tasks processor:", error.message, {
      category: "scheduled-tasks",
    });
    return res.status(500).json({
      success: false,
      error: "Failed to process scheduled tasks",
    });
  }
}
