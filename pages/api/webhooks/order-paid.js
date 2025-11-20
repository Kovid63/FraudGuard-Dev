// pages/api/webhooks/order-paid.js

import { buffer } from 'micro';
import { shopify } from '../../../lib/shopify';
import clientPromise from '../../../lib/mongo';
import withMiddleware from '../utils/middleware/withMiddleware';
import { removeStatusTags } from '../utils/removeStatusTags';
import sessionHandler from '../utils/sessionHandler';
import { updateOrdersOnHold } from "../utils/updateRiskStats";
const axios = require('axios');

export const config = {
  api: {
    bodyParser: false,
  },
};

async function releaseFulfillmentOrders(shopifyClient, fulfillmentOrderIds, holdIds = null) {
  if (!fulfillmentOrderIds || fulfillmentOrderIds.length === 0) {
    console.warn('No fulfillment order IDs provided for release operation', { category: 'webhook-orders-paid' });
    return { success: false, error: 'No fulfillment order IDs provided' };
  }

  // Updated mutation structure based on Shopify documentation
  const mutation = `
    mutation FulfillmentOrderReleaseHold($id: ID!, $holdIds: [ID!], $externalId: String) {
      fulfillmentOrderReleaseHold(id: $id, holdIds: $holdIds, externalId: $externalId) {
        fulfillmentOrder {
          id
          status
          requestStatus
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
        // If holdIds are provided, use them; otherwise release all holds
        ...(holdIds && holdIds.length > 0 && { holdIds }),
        externalId: 'fraud-guard-paid-release'
      };
      
      const response = await shopifyClient.request(mutation, { variables });
      
      if (response?.data?.fulfillmentOrderReleaseHold?.userErrors?.length > 0) {
        const errors = response.data.fulfillmentOrderReleaseHold.userErrors;
        console.warn(`Release hold operation had user errors for fulfillment order ${fulfillmentOrderId}:`, errors, { category: 'webhook-orders-paid' });
        results.push({ 
          fulfillmentOrderId, 
          success: false, 
          errors: errors.map(e => e.message).join(', ') 
        });
      } else if (response?.data?.fulfillmentOrderReleaseHold?.fulfillmentOrder) {
        console.info(`Successfully released hold on fulfillment order ${fulfillmentOrderId}`, { category: 'webhook-orders-paid' });
        results.push({ 
          fulfillmentOrderId, 
          success: true, 
          status: response.data.fulfillmentOrderReleaseHold.fulfillmentOrder.status,
          requestStatus: response.data.fulfillmentOrderReleaseHold.fulfillmentOrder.requestStatus
        });
      } else {
        console.warn(`Unexpected response structure for release hold operation on ${fulfillmentOrderId}:`, response, { category: 'webhook-orders-paid' });
        results.push({ 
          fulfillmentOrderId, 
          success: false, 
          error: 'Unexpected response structure' 
        });
      }
    } catch (error) {
      console.error(`Error releasing hold on fulfillment order ${fulfillmentOrderId}:`, error.message, { category: 'webhook-orders-paid' });
      results.push({ 
        fulfillmentOrderId, 
        success: false, 
        error: error.message 
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  return {
    success: successCount > 0,
    results,
    summary: `${successCount}/${totalCount} fulfillment orders successfully released from hold`
  };
}

async function retryDbOperation(operation, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code === 11000 || (error.message && error.message.includes('duplicate key'))) {
        console.warn(`Duplicate key error during DB operation (attempt ${attempt}/${maxRetries}). Indicating pre-existing data or race condition.`, { category: 'webhook-orders-paid' });
        return { duplicateKeyError: true, error, success: false };
      }
      console.error(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error.message, { category: 'webhook-orders-paid' });
      if (attempt >= maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
}

async function validateShopifyWebhook(req, rawBodyString, res) {
  const shop = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];

  if (!shop) {
    if (!res.headersSent) res.status(400).json({ error: 'Missing x-shopify-shop-domain header' });
    return false;
  }
  if (!topic) {
    if (!res.headersSent) res.status(400).json({ error: 'Missing x-shopify-topic header' });
    return false;
  }

  try {
    const isValid = await shopify.webhooks.validate({ rawBody: rawBodyString, rawRequest: req, rawResponse: res });
    if (!isValid && !res.headersSent) {
      res.status(401).json({ error: 'Invalid webhook signature (returned false)' });
    }
    return isValid;
  } catch (error) {
    console.error('Shopify webhook validation error:', error.message, { category: 'webhook-orders-paid' });
    if (!res.headersSent) {
      res.status(401).json({ error: `Webhook validation failed: ${error.message}` });
    }
    return false;
  }
}

async function checkAndMarkWebhookProcessed(db, idempotencyKey, orderId, shop) {
  if (!idempotencyKey) {
    console.warn(`Missing idempotency key for order paid ${orderId} on shop ${shop}. Proceeding without duplicate check.`, { category: 'webhook-orders-paid' });
    return { canProcess: true };
  }

  try {
    await db.collection('processed-webhooks').createIndex(
      { key: 1, orderId: 1, type: 1 },
      { unique: true, background: true }
    );
  } catch (indexError) {
    console.warn(`Non-critical: Failed to ensure 'key_1_orderId_1_type_1' index on processed-webhooks for ${shop}: ${indexError.message}.`, { category: 'webhook-orders-paid' });
  }

  const processedWebhook = await db.collection('processed-webhooks').findOne({ 
    key: idempotencyKey, 
    orderId, 
    type: 'order_paid' 
  });
  
  if (processedWebhook) {
    console.info(`Order paid webhook for order ${orderId} (key: ${idempotencyKey}) on shop ${shop} already processed at ${processedWebhook.processedAt}.`, { category: 'webhook-orders-paid' });
    return { canProcess: false, message: 'Webhook already processed' };
  }

  try {
    await db.collection('processed-webhooks').updateOne(
      { key: idempotencyKey, orderId, type: 'order_paid' },
      { $setOnInsert: { processedAt: new Date(), shop, type: 'order_paid' } },
      { upsert: true }
    );
    return { canProcess: true };
  } catch (err) {
    if (err.code === 11000) {
      console.warn(`Concurrent processing detected for order paid webhook ${orderId} (key: ${idempotencyKey}) on shop ${shop}.`, { category: 'webhook-orders-paid' });
      return { canProcess: false, message: 'Webhook processed concurrently by another instance' };
    }
    console.warn(`Failed to mark paid webhook as processed (key: ${idempotencyKey}, order ${orderId}, shop ${shop}): ${err.message}. Proceeding with caution.`, { category: 'webhook-orders-paid' });
    return { canProcess: true, warning: 'Failed to record processed webhook, but proceeding.' };
  }
}

async function enqueuePaidWebhook(db, webhookData) {
  const queueItem = {
    ...webhookData,
    type: 'order_paid',
    status: 'pending',
    createdAt: new Date(),
    attempts: 0,
    maxAttempts: 3,
    shop: webhookData.shop,  // Ensure shop is at the top level
    orderId: webhookData.orderPaidData?.id  // Add orderId for easier reference
  };

  try {
    await db.collection('webhook-queue').createIndex({ createdAt: 1 }, { background: true });
    await db.collection('webhook-queue').createIndex({ status: 1, createdAt: 1 }, { background: true });
    await db.collection('webhook-queue').createIndex({ type: 1, status: 1 }, { background: true });
    
    const result = await db.collection('webhook-queue').insertOne(queueItem);
    console.info(`Order paid webhook queued for order ${webhookData.orderPaidData?.id} with ID: ${result.insertedId}`, { 
      category: 'webhook-orders-paid',
      orderId: webhookData.orderPaidData?.id,
      shop: webhookData.shop
    });
    return result.insertedId;
  } catch (error) {
    console.error('Failed to enqueue order paid webhook:', error, { 
      category: 'webhook-orders-paid',
      orderId: webhookData.orderPaidData?.id,
      shop: webhookData.shop
    });
    throw error;
  }
}

async function triggerQueueProcessor(shop) {
  try {
    await axios.post(`${process.env.HOST}/api/process-queue`, { shop }, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.warn('Failed to trigger queue processor:', error.message, { category: 'webhook-orders-paid' });
  }
}

export async function processQueuedPaidWebhook(db, queueItem) {
  const { orderPaidData, shop, idempotencyKey } = queueItem;
  
  try {
    await db.collection('webhook-queue').updateOne(
      { _id: queueItem._id },
      { 
        $set: { 
          status: 'processing', 
          processingStartedAt: new Date(),
          attempts: queueItem.attempts + 1
        } 
      }
    );

    // Check if order exists in our database
    const existingOrder = await db.collection('orders').findOne(
      { shop: shop, id: orderPaidData.id },
      { 
        projection: { 
          'guard.status': 1, 
          'guard.riskStatusTag': 1, 
          'guard.fulfillmentHold': 1,
          'guard.verificationStatusTag': 1,
          'admin_graphql_api_id': 1 
        } 
      }
    );

    if (!existingOrder) {
      console.info(`Order ${orderPaidData.id} does not exist in our database, skipping.`, { category: 'webhook-orders-paid' });
      return;
    }

    const previousStatus = existingOrder?.guard?.status || 'unknown';
    const riskStatusTag = existingOrder?.guard?.riskStatusTag || '';
    const verificationStatusTag = existingOrder?.guard?.verificationStatusTag || '';
    const fulfillmentHold = existingOrder?.guard?.fulfillmentHold;

    const session = await sessionHandler.loadSession(shop);
    const shopifyClient = new shopify.clients.Graphql({ session });

    // Release fulfillment hold if it exists
    if (fulfillmentHold?.applied && fulfillmentHold?.fulfillmentOrderIds?.length > 0) {
      try {
        console.info({ category: 'webhook-orders-paid', message: 'Releasing fulfillment hold for paid order', orderId: orderPaidData.id });
        
        // Extract hold IDs if available from the stored results
        let holdIds = null;
        if (fulfillmentHold.results && Array.isArray(fulfillmentHold.results)) {
          holdIds = fulfillmentHold.results
            .filter(result => result.success && result.holdId)
            .map(result => result.holdId);
        }
        
        const releaseResult = await releaseFulfillmentOrders(
          shopifyClient, 
          fulfillmentHold.fulfillmentOrderIds, 
          holdIds?.length > 0 ? holdIds : null
        );
        
        if (releaseResult.success) {
          console.info({ category: 'webhook-orders-paid', message: 'Successfully released fulfillment hold', orderId: orderPaidData.id, summary: releaseResult.summary });
          
          // Update database to reflect hold release
          await db.collection('orders').updateOne(
            { shop: shop, id: orderPaidData.id },
            { 
              $set: { 
                'guard.fulfillmentHold.released': true,
                'guard.fulfillmentHold.releasedAt': new Date(),
                'guard.fulfillmentHold.releaseResults': releaseResult.results
              }
            }
          );
        } else {
          console.warn({ category: 'webhook-orders-paid', message: 'Failed to release some or all fulfillment holds', orderId: orderPaidData.id, results: releaseResult.results });
        }
      } catch (holdReleaseError) {
        console.error({ category: 'webhook-orders-paid', message: 'Error releasing fulfillment hold', orderId: orderPaidData.id, error: holdReleaseError.message });
        // Continue with the process even if hold release fails
      }
    } else {
      console.info({ category: 'webhook-orders-paid', message: 'No fulfillment hold found for order', orderId: orderPaidData.id });
    }

    // Remove status tags (including FG_HOLD tag)
    const tagsToRemove = [];
    
    // Always remove FG_HOLD tag when payment is captured
    tagsToRemove.push('FG_HOLD');

    // Filter out empty/null tags and remove duplicates
    const filteredTagsToRemove = [...new Set(tagsToRemove.filter(tag => tag && tag.trim()))];

    if (filteredTagsToRemove.length > 0 && existingOrder?.admin_graphql_api_id) {
      try {
        await removeStatusTags(shopifyClient, existingOrder.admin_graphql_api_id, filteredTagsToRemove);
        console.info({ category: 'webhook-orders-paid', message: 'Status tags removed for order', orderId: orderPaidData.id, tags: filteredTagsToRemove });
      } catch (tagRemovalError) {
        console.warn({ category: 'webhook-orders-paid', message: 'Failed to remove some tags', orderId: orderPaidData.id, error: tagRemovalError.message, tags: filteredTagsToRemove });
        // Continue with the process even if tag removal fails
      }
    } else if (filteredTagsToRemove.length > 0) {
      console.warn({ category: 'webhook-orders-paid', message: 'Cannot remove tags: missing admin_graphql_api_id', orderId: orderPaidData.id, tags: filteredTagsToRemove });
    }

    if (previousStatus === 'captured payment') {
      console.info(`Order ${orderPaidData.id} is already marked as paid, skipping.`, { category: 'webhook-orders-paid' });
      return;
    }
    
    // Update the order status to paid
    const updateOperation = () => db.collection('orders').updateOne(
      { shop: shop, id: orderPaidData.id },
      {
        $set: {
          'guard.status': 'captured payment',
          'guard.paymentStatus.captured': true,
          'guard.paymentStatus.cancelled': false,
          'guard.riskStatusTag': 'none',
          'guard.remark': `${previousStatus}`,
          'guard.paidAt': new Date(),
          'paidData': orderPaidData
        }
      }
    );

    const updateResult = await retryDbOperation(updateOperation);

    if (updateResult?.duplicateKeyError) {
      console.info(`Order paid update for ${orderPaidData.id} resulted in duplicate key error, but this is non-critical for updates.`, { category: 'webhook-orders-paid' });
    } else if (updateResult?.modifiedCount > 0) {
      console.info(`Order ${orderPaidData.id} successfully updated to paid status.`, { category: 'webhook-orders-paid' });
    } else if (updateResult?.matchedCount > 0) {
      console.info(`Order ${orderPaidData.id} was matched but no modifications were needed (possibly already marked as paid).`, { category: 'webhook-orders-paid' });
    } else {
      console.warn(`Order ${orderPaidData.id} was not found in database for paid update. This might be expected if the order was never flagged.`, { category: 'webhook-orders-paid' });
    }

    await updateOrdersOnHold(shop, true);

    // Mark webhook as completed
    await db.collection('webhook-queue').updateOne(
      { _id: queueItem._id },
      { 
        $set: { 
          status: 'completed', 
          completedAt: new Date()
        } 
      }
    );

    console.info(`Successfully processed queued paid webhook for order ${orderPaidData.id}`, { category: 'webhook-orders-paid' });
    return true;

  } catch (error) {
    console.error(`Error processing queued paid webhook for order ${orderPaidData.id}:`, error.message, { category: 'webhook-orders-paid' });
    
    const shouldRetry = queueItem.attempts < queueItem.maxAttempts;
    const updateData = shouldRetry 
      ? { 
          status: 'pending', 
          lastError: error.message, 
          lastAttemptAt: new Date(),
          nextAttemptAfter: new Date(Date.now() + (queueItem.attempts * 30000))
        }
      : { 
          status: 'failed', 
          lastError: error.message, 
          failedAt: new Date()
        };

    await db.collection('webhook-queue').updateOne(
      { _id: queueItem._id },
      { $set: updateData }
    );

    if (!shouldRetry) {
      console.error(`Paid webhook processing failed permanently for order ${orderPaidData.id} after ${queueItem.attempts} attempts`, { category: 'webhook-orders-paid' });
    }
    
    return false;
  }
}

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const shop = req.headers['x-shopify-shop-domain'];
  const idempotencyKey = req.headers['x-shopify-hmac-sha256'] || req.headers['x-shopify-order-id'];

  let rawBodyString;
  try {
    const rawBodyBuffer = await buffer(req);
    rawBodyString = rawBodyBuffer.toString('utf8');
  } catch (bufError) {
    console.error('Failed to buffer request body:', bufError, { category: 'webhook-orders-paid' });
    return res.status(500).json({ error: 'Failed to read request body' });
  }

  if (!await validateShopifyWebhook(req, rawBodyString, res)) {
    return;
  }

  let orderPaidData;
  try {
    orderPaidData = JSON.parse(rawBodyString);
  } catch (parseError) {
    console.error('Failed to parse webhook JSON body:', parseError, { category: 'webhook-orders-paid' });
    return res.status(400).json({ error: 'Invalid JSON in webhook body' });
  }

  if (!shop || !orderPaidData?.id) {
    console.error('Invalid webhook data: Missing shop or order ID.', { shop, orderId: orderPaidData?.id, category: 'webhook-orders-paid' });
    return res.status(400).json({ error: 'Incomplete or invalid order paid data in webhook.' });
  }

  let mongoClient;
  let db;
  try {
    mongoClient = await clientPromise;
    const storeName = shop.split('.')[0];
    db = mongoClient.db(storeName);
  } catch (dbConnectionError) {
    console.error(`MongoDB connection error for shop ${shop}:`, dbConnectionError, { category: 'webhook-orders-paid' });
    return res.status(500).json({ error: 'Database connection failed' });
  }

  const processingStatus = await checkAndMarkWebhookProcessed(db, idempotencyKey, orderPaidData.id, shop);
  if (!processingStatus.canProcess) {
    return res.status(200).json({ success: true, message: processingStatus.message });
  }
  if (processingStatus.warning) console.warn(processingStatus.warning, { category: 'webhook-orders-paid' });

  try {
    const webhookData = {
      orderPaidData,
      shop,
      idempotencyKey,
      rawHeaders: req.headers
    };

    await enqueuePaidWebhook(db, webhookData);
    
    // Trigger queue processor (fire and forget)
    triggerQueueProcessor(shop);

    return res.status(200).json({ 
      success: true, 
      message: 'Order paid webhook received and queued for processing' 
    });

  } catch (error) {
    console.error(`Failed to queue paid webhook for order ${orderPaidData.id}, shop ${shop}:`, error, { category: 'webhook-orders-paid' });
    return res.status(500).json({ error: 'Failed to queue paid webhook for processing' });
  }
}

export default withMiddleware("verifyHmac")(handler);
