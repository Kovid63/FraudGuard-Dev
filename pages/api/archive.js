import clientPromise from '../../lib/mongo';
import { updateOrdersOnHold } from "./utils/updateRiskStats";


export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method Not Allowed' });
        }
        
        const { shop, orderId } = req.body;

        if (!shop) {
            return res.status(400).json({ error: 'Missing shop parameter' });
        }

        const client = await clientPromise;
        const db = client.db(shop.split('.')[0]);
        const collection = db.collection('orders');

        const orderToUpdate = orderId;

        const result = await collection.updateOne(
            { id: orderToUpdate },
            {
                $set: {
                    'guard.status': 'archived',
                    'guard.paymentStatus.captured': false,
                    'guard.paymentStatus.cancelled': false,
                }
            }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: 'No orders found to update.' });
        }

        // Update orders on hold if necessary
        await updateOrdersOnHold(shop, true, { message: 'archive', orderId });

        return res.status(200).json({ 
            success: true, 
            message: `${result.modifiedCount} orders updated successfully.` 
        });
        
    } catch (error) {
        console.error('Error updating order:', error);
        return res.status(500).json({ 
            error: 'Internal Server Error',
            message: 'Failed to update order'
        });
    }
}