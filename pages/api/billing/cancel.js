// pages/api/billing/cancel.js
import { cancelSubscription, getCurrentSubscriptions } from '../../../lib/billingMiddleware';
import { shopify } from '../../../lib/shopify';
import sessionHandler from '../utils/sessionHandler';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const sessionId = await shopify.session.getCurrentId({
      rawRequest: req,
      rawResponse: res,
    });

    if (!sessionId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = await sessionHandler.loadSession(sessionId);
    
    if (!session) {
      return res.status(401).json({ error: 'Session not found' });
    }

    const subscriptions = await getCurrentSubscriptions(session);
    
    if (!subscriptions || subscriptions.length === 0) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // Cancel all active subscriptions
    const cancelledSubscriptions = [];
    const failedCancellations = [];

    for (const subscription of subscriptions) {
      try {
        const cancelledSubscription = await cancelSubscription(session, subscription.id);
        cancelledSubscriptions.push(cancelledSubscription);
      } catch (error) {
        console.error(`Error cancelling subscription ${subscription.id}:`, error);
        failedCancellations.push({
          id: subscription.id,
          error: error.message
        });
      }
    }

    // Return response based on results
    if (cancelledSubscriptions.length === 0) {
      return res.status(500).json({ 
        success: false,
        error: 'Failed to cancel any subscriptions',
        failedCancellations
      });
    }

    if (failedCancellations.length > 0) {
      return res.status(207).json({ // 207 Multi-Status
        success: true,
        message: `Successfully cancelled ${cancelledSubscriptions.length} subscription(s), ${failedCancellations.length} failed`,
        cancelledSubscriptions,
        failedCancellations
      });
    }

    res.json({ 
      success: true, 
      message: `All ${cancelledSubscriptions.length} subscription(s) cancelled successfully`,
      cancelledSubscriptions
    });

  } catch (error) {
    console.error('Error cancelling subscriptions:', error, { category: 'api-billing-cancel' });
    res.status(500).json({ error: 'Failed to cancel subscriptions' });
  }
}