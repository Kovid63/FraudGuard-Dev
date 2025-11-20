import clientPromise from '../../../lib/mongo';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { shop, filter } = req.query;

  if (!shop) {
    return res.status(400).json({ error: 'Shop parameter is required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db(shop.split('.')[0]);
    const collection = db.collection('orders');

    // Build query with optional date filter
    const query = { shop, 'guard.status': 'cancelled payment' };
    
    if (filter === 'this_month') {
      const now = new Date();
      const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      
      query.created_at = {
        $gte: startDate.toISOString(),
        $lt: endDate.toISOString()
      };
    } else if (filter === 'last_7_days') {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 7);
      
      query.created_at = {
        $gte: startDate.toISOString(),
        $lt: endDate.toISOString()
      };
    }

    const orders = await collection.find(query, {
      projection: { total_price: 1, created_at: 1, 'guard.status': 1 }
    }).sort({ created_at: 1 }).toArray();

    // Calculate total sum of all orders
    const totalSum = orders.reduce((sum, order) => {
      return sum + parseFloat(order.total_price || 0);
    }, 0);

    return res.status(200).json({ 
      count: orders.length,
      riskPrevented: { value: totalSum.toFixed(2), label: 'Total' }
    });

  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}