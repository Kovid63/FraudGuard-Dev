// pages/api/orders/capture.js

import sessionHandler from "./utils/sessionHandler";
import clientPromise from '../../lib/mongo';
import { updateOrdersOnHold } from "./utils/updateRiskStats";
import { shopify } from "../../lib/shopify";
import { removeStatusTags } from "./utils/removeStatusTags";

async function releaseFulfillmentOrders(shopifyClient, fulfillmentOrderIds, holdIds = null) {
  if (!fulfillmentOrderIds || fulfillmentOrderIds.length === 0) {
    console.warn('No fulfillment order IDs provided for release operation', { category: 'api-capture' });
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
        externalId: 'fraud-guard-capture-release'
      };
      
      const response = await shopifyClient.request(mutation, { variables });
      
      if (response?.data?.fulfillmentOrderReleaseHold?.userErrors?.length > 0) {
        const errors = response.data.fulfillmentOrderReleaseHold.userErrors;
        console.warn(`Release hold operation had user errors for fulfillment order ${fulfillmentOrderId}:`, errors, { category: 'api-capture' });
        results.push({ 
          fulfillmentOrderId, 
          success: false, 
          errors: errors.map(e => e.message).join(', ') 
        });
      } else if (response?.data?.fulfillmentOrderReleaseHold?.fulfillmentOrder) {
        console.info(`Successfully released hold on fulfillment order ${fulfillmentOrderId}`, { category: 'api-capture' });
        results.push({ 
          fulfillmentOrderId, 
          success: true, 
          status: response.data.fulfillmentOrderReleaseHold.fulfillmentOrder.status,
          requestStatus: response.data.fulfillmentOrderReleaseHold.fulfillmentOrder.requestStatus
        });
      } else {
        console.warn(`Unexpected response structure for release hold operation on ${fulfillmentOrderId}:`, response, { category: 'api-capture' });
        results.push({ 
          fulfillmentOrderId, 
          success: false, 
          error: 'Unexpected response structure' 
        });
      }
    } catch (error) {
      console.error(`Error releasing hold on fulfillment order ${fulfillmentOrderId}:`, error.message, { category: 'api-capture' });
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

export default async function handler(req, res) {
  const client = await clientPromise;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { orderId, shop, orderAmount, notFlagged, isManuallyApproved, admin_graphql_api_id, fromTimeout } = req.body;

  try {
    const session = await sessionHandler.loadSession(shop);
    const shopifyClient = new shopify.clients.Graphql({ session });

    console.info({ category: 'api-capture', message: 'Request received for order capture' });

    // Step 1: Get transactions for the order
    const txRes = await fetch(
      `https://${session.shop}/admin/api/2025-04/orders/${orderId}/transactions.json`,
      {
        headers: {
          'X-Shopify-Access-Token': session.accessToken,
          'Content-Type': 'application/json',
        },
      }
    );
    const txData = await txRes.json();

    console.debug({ category: 'api-capture', message: 'Fetched transactions for order', txData });

    const authorizationTx = txData.transactions.find(
      (tx) => tx.kind === 'authorization' && tx.status === 'success'
    );

    if (!authorizationTx) {
      console.error({ category: 'api-capture', message: 'No successful authorization transaction found for order', orderId });
      return res.status(400).json({ error: 'No successful authorization transaction found' });
    }

    // Step 2: Capture the authorized transaction
    const captureRes = await fetch(
      `https://${session.shop}/admin/api/2025-04/orders/${orderId}/transactions.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': session.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transaction: {
            kind: 'capture',
            parent_id: authorizationTx.id,
          },
        }),
      }
    );

    const captureData = await captureRes.json();
    if (!captureRes.ok) {
      const errorMessage = captureData?.errors?.base?.[0] || 'Capture failed';
      console.error({ category: 'api-capture', message: 'Capture failed for order', orderId, error: errorMessage });
      return res.status(captureRes.status).json({ error: errorMessage });
    }

    console.info({ category: 'api-capture', message: 'Capture successful for order', orderId });

    if (notFlagged) {
      console.info({ category: 'api-capture', message: 'Order not flagged, returning success', orderId });
      return res.status(200).json({ success: true, transaction: captureData.transaction });
    }

    const storeName = shop.split('.')[0];
    const db = client.db(storeName);

    const orderDetails = await db.collection("orders").findOne({ id: orderId });

    if (fromTimeout && orderDetails.guard.status !== "pending") {
      return res.status(400).json({
        error: "Order status is not pending, cannot auto capture.",
      });
    }

    // Get order details including hold information and risk status tag
    const existingOrder = await db.collection('orders').findOne(
      { shop: shop, id: orderId },
      { 
        projection: { 
          'guard.riskStatusTag': 1,
          'guard.fulfillmentHold': 1,
          'guard.verificationStatusTag': 1
        } 
      }
    );

    const riskStatusTag = existingOrder?.guard?.riskStatusTag || '';
    const verificationStatusTag = existingOrder?.guard?.verificationStatusTag || '';
    const fulfillmentHold = existingOrder?.guard?.fulfillmentHold;

    // Step 3: Release fulfillment hold if it exists
    if (fulfillmentHold?.applied && fulfillmentHold?.fulfillmentOrderIds?.length > 0) {
      try {
        console.info({ category: 'api-capture', message: 'Releasing fulfillment hold for captured order', orderId });
        
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
          console.info({ category: 'api-capture', message: 'Successfully released fulfillment hold', orderId, summary: releaseResult.summary });
          
          // Update database to reflect hold release
          await db.collection('orders').updateOne(
            { shop: shop, id: orderId },
            { 
              $set: { 
                'guard.fulfillmentHold.released': true,
                'guard.fulfillmentHold.releasedAt': new Date(),
                'guard.fulfillmentHold.releaseResults': releaseResult.results
              }
            }
          );
        } else {
          console.warn({ category: 'api-capture', message: 'Failed to release some or all fulfillment holds', orderId, results: releaseResult.results });
        }
      } catch (holdReleaseError) {
        console.error({ category: 'api-capture', message: 'Error releasing fulfillment hold', orderId, error: holdReleaseError.message });
        // Continue with the process even if hold release fails
      }
    } else {
      console.info({ category: 'api-capture', message: 'No fulfillment hold found for order', orderId });
    }

    // Step 4: Update order status in database
    const result = await db.collection('orders').updateOne(
      { 'shop': shop, 'id': orderId }, // Filter by shop and orderId
      {
        $set: {
          'guard.status': 'captured payment',
          'guard.paymentStatus.captured': true,
          'guard.paymentStatus.cancelled': false,
          ...(isManuallyApproved && { 'guard.riskStatusTag': 'none' }),
        }
      } // Update specific fields within guard
    );

    if (result.modifiedCount === 0) {
      console.error({ category: 'api-capture', message: 'Failed to update order inside database', orderId });
      return res.status(404).json({ message: 'Failed to update order inside database.' });
    }

    console.info({ category: 'api-capture', message: 'Order updated in database', orderId });

    // Step 5: Remove tags (including FG_HOLD tag)
    const tagsToRemove = [];
    
    if (isManuallyApproved && riskStatusTag) {
      tagsToRemove.push(riskStatusTag);
    }
    
    // Always remove FG_HOLD tag when capturing payment
    tagsToRemove.push('FG_HOLD');

    // Filter out empty/null tags and remove duplicates
    const filteredTagsToRemove = [...new Set(tagsToRemove.filter(tag => tag && tag.trim()))];

    if (filteredTagsToRemove.length > 0 && admin_graphql_api_id) {
      try {
        await removeStatusTags(shopifyClient, admin_graphql_api_id, filteredTagsToRemove);
        console.info({ category: 'api-capture', message: 'Status tags removed for order', orderId, tags: filteredTagsToRemove });
      } catch (tagRemovalError) {
        console.warn({ category: 'api-capture', message: 'Failed to remove some tags', orderId, error: tagRemovalError.message, tags: filteredTagsToRemove });
        // Continue with the process even if tag removal fails
      }
    } else if (filteredTagsToRemove.length > 0) {
      console.warn({ category: 'api-capture', message: 'Cannot remove tags: missing admin_graphql_api_id', orderId, tags: filteredTagsToRemove });
    }

    await updateOrdersOnHold(shop, true, { location: "/capture" });
    console.info({ category: 'api-capture', message: 'Orders on hold updated for shop', shop });

    res.status(200).json({ 
      success: true, 
      transaction: captureData.transaction,
      holdReleased: fulfillmentHold?.applied || false,
      tagsRemoved: filteredTagsToRemove
    });
    console.info({ category: 'api-capture', message: 'Order capture process completed successfully', orderId });
  } catch (err) {
    console.error({ category: 'api-capture', message: 'Internal server error during order capture', orderId, error: err.message });
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
