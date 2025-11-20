// pages/api/process-queue.js
import clientPromise from '../../lib/mongo';
import { processQueuedWebhook } from './webhooks/order-create';
import { processQueuedCancelWebhook } from './webhooks/order-cancel';
import { processQueuedSubscriptionWebhook } from './webhooks/app-subscription-update';
import { processQueuedPaidWebhook } from './webhooks/order-paid';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { shop } = req.body;

  if (!shop) {
    return res.status(400).json({ error: 'Shop parameter required' });
  }

  try {
    const mongoClient = await clientPromise;
    const storeName = shop.split('.')[0];
    const db = mongoClient.db(storeName);
    
    // Find items to process from queue (both pending and processing status)
    // Use maxAttempts from each item, fallback to 3 if not set
    const queueItems = await db.collection('webhook-queue').find({
      $and: [
        {
          $or: [
            { status: 'pending' },
            { status: 'processing' }
          ]
        },
        {
          $expr: {
            $lte: ["$attempts", { $ifNull: ["$maxAttempts", 3] }]
          }
        },
        {
          $or: [
            { nextAttemptAfter: { $exists: false } },
            { nextAttemptAfter: { $lte: new Date() } }
          ]
        }
      ]
    }).sort({ createdAt: 1 }).limit(10).toArray();

    if (queueItems.length === 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'No items to process',
        processed: 0
      });
    }

    const results = [];
    
    for (const item of queueItems) {
      try {
        // Update status to processing before attempting to process
        await db.collection('webhook-queue').updateOne(
          { _id: item._id },
          { 
            $set: { status: 'processing' },
            $inc: { attempts: 1 }
          }
        );

        let result;
        
        // Process different webhook types
        if (item.type === 'order_cancel') {
          result = await processQueuedCancelWebhook(db, item);
          results.push({ 
            orderId: item.orderCancelData?.id || 'unknown', 
            type: 'order_cancel',
            success: result,
            _id: item._id 
          });
        } else if (item.type === 'subscription-update') {
          result = await processQueuedSubscriptionWebhook(db, item);
          results.push({ 
            shop: item.shop || 'unknown', 
            type: 'subscription-update',
            success: result,
            _id: item._id 
          });
        } else if (item.type === 'order_paid') {
          result = await processQueuedPaidWebhook(db, item);
          results.push({ 
            orderId: item.orderPaidData?.id || 'unknown', 
            type: 'order_paid',
            success: result,
            _id: item._id 
          });
        } else {
          // Default to order creation processing (backward compatibility)
          result = await processQueuedWebhook(db, item);
          results.push({ 
            orderId: item.orderData?.id || 'unknown', 
            type: 'order_create',
            success: result,
            _id: item._id 
          });
        }

        // Update status based on result
        if (result) {
          await db.collection('webhook-queue').updateOne(
            { _id: item._id },
            { 
              $set: { 
                status: 'completed',
                completedAt: new Date()
              }
            }
          );
        } else {
          // Check if we've exceeded max attempts
          const currentAttempts = (item.attempts || 0) + 1;
          const itemMaxAttempts = item.maxAttempts || 3;
          
          if (currentAttempts >= itemMaxAttempts) {
            await db.collection('webhook-queue').updateOne(
              { _id: item._id },
              { 
                $set: { 
                  status: 'failed',
                  failedAt: new Date()
                }
              }
            );
          } else {
            // Set next attempt time (exponential backoff)
            const backoffDelay = Math.pow(2, currentAttempts) * 1000; // 2s, 4s, 8s...
            const nextAttemptAfter = new Date(Date.now() + backoffDelay);
            
            await db.collection('webhook-queue').updateOne(
              { _id: item._id },
              { 
                $set: { 
                  status: 'pending',
                  nextAttemptAfter: nextAttemptAfter
                }
              }
            );
          }
        }

      } catch (error) {
        console.error(`Failed to process queue item ${item._id}:`, error.message, { category: 'api-process-queue' });
        
        // Handle failed processing - check attempts and update status accordingly
        const currentAttempts = (item.attempts || 0) + 1;
        const itemMaxAttempts = item.maxAttempts || 3;
        
        if (currentAttempts >= itemMaxAttempts) {
          await db.collection('webhook-queue').updateOne(
            { _id: item._id },
            { 
              $set: { 
                status: 'failed',
                failedAt: new Date(),
                lastError: error.message
              }
            }
          );
        } else {
          // Set next attempt time (exponential backoff)
          const backoffDelay = Math.pow(2, currentAttempts) * 1000;
          const nextAttemptAfter = new Date(Date.now() + backoffDelay);
          
          await db.collection('webhook-queue').updateOne(
            { _id: item._id },
            { 
              $set: { 
                status: 'pending',
                nextAttemptAfter: nextAttemptAfter,
                lastError: error.message
              }
            }
          );
        }

        results.push({ 
          orderId: item.orderData?.id || item.orderCancelData?.id || item.orderPaidData?.id || 'unknown', 
          type: item.type || 'order_create',
          success: false, 
          error: error.message,
          _id: item._id 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    
    // Check if there are more items to process (both pending and processing)
    const hasMoreItems = await db.collection('webhook-queue').countDocuments({
      $and: [
        {
          $or: [
            { status: 'pending' },
            { status: 'processing' }
          ]
        },
        {
          $expr: {
            $lte: ["$attempts", { $ifNull: ["$maxAttempts", 3] }]
          }
        },
        {
          $or: [
            { nextAttemptAfter: { $exists: false } },
            { nextAttemptAfter: { $lte: new Date() } }
          ]
        }
      ]
    });

    // If there are more items, trigger another batch after a short delay
    if (hasMoreItems > 0) {
      setTimeout(() => {
        fetch(`${process.env.HOST}/api/process-queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop }),
        }).catch(err => console.warn('Failed to trigger next batch:', err.message, { category: 'api-process-queue' }));
      }, 1000);
    }

    console.info(`Queue processing completed. Total items: ${queueItems.length}, Successful: ${successCount}, Failed: ${queueItems.length - successCount}, Has more: ${hasMoreItems > 0}`, { category: 'api-process-queue' });

    return res.status(200).json({
      success: true,
      processed: queueItems.length,
      successful: successCount,
      failed: queueItems.length - successCount,
      hasMore: hasMoreItems > 0,
      results
    });

  } catch (error) {
    console.error('Queue processing error:', error, { category: 'api-process-queue' });
    return res.status(500).json({ 
      error: 'Queue processing failed', 
      message: error.message 
    });
  }
}