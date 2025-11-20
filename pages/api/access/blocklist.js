// pages/api/access/blocklist.js
import clientPromise from '../../../lib/mongo';
import { ObjectId } from 'mongodb';

export default async function handler(req, res) {
    try {
        const { shop } = req.query;

        if (!shop) {
            return res.status(400).json({ error: 'Missing shop parameter' });
        }

        const client = await clientPromise;
        const db = client.db(shop.split('.')[0]);
        const collection = db.collection('access_control');

        // CREATE - Add new blocklist rule
        if (req.method === 'POST') {
            const { type, value, notes } = req.body;

            if (!type || !value) {
                return res.status(400).json({ error: 'Type and value are required' });
            }

            // Check if rule already exists
            const existingRule = await collection.findOne({
                shop,
                listType: 'blocklist',
                type,
                value
            });

            if (existingRule) {
                return res.status(409).json({ 
                    error: 'Rule already exists',
                    message: 'A blocklist rule with this type and value already exists'
                });
            }

            const newRule = {
                shop,
                listType: 'blocklist',
                type,
                value,
                notes: notes || null,
                added: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const result = await collection.insertOne(newRule);

            return res.status(201).json({
                success: true,
                message: 'Blocklist rule added successfully',
                id: result.insertedId.toString(),
                rule: {
                    ...newRule,
                    id: result.insertedId.toString()
                }
            });
        }

        // READ - Get all blocklist rules
        if (req.method === 'GET') {
            const rules = await collection
                .find({ 
                    shop,
                    listType: 'blocklist' 
                })
                .sort({ createdAt: -1 })
                .toArray();

            const formattedRules = rules.map(rule => ({
                id: rule._id.toString(),
                type: rule.type,
                value: rule.value,
                notes: rule.notes,
                added: rule.added,
                createdAt: rule.createdAt,
                updatedAt: rule.updatedAt
            }));

            return res.status(200).json({
                success: true,
                count: formattedRules.length,
                rules: formattedRules
            });
        }

        // UPDATE - Update a blocklist rule
        if (req.method === 'PUT') {
            const { id, type, value, notes } = req.body;

            if (!id) {
                return res.status(400).json({ error: 'Rule ID is required' });
            }

            if (!type || !value) {
                return res.status(400).json({ error: 'Type and value are required' });
            }

            // Check if another rule with same type/value exists (excluding current rule)
            const existingRule = await collection.findOne({
                _id: { $ne: new ObjectId(id) },
                shop,
                listType: 'blocklist',
                type,
                value
            });

            if (existingRule) {
                return res.status(409).json({ 
                    error: 'Rule already exists',
                    message: 'Another blocklist rule with this type and value already exists'
                });
            }

            const result = await collection.updateOne(
                { 
                    _id: new ObjectId(id),
                    shop,
                    listType: 'blocklist'
                },
                {
                    $set: {
                        type,
                        value,
                        notes: notes || null,
                        updatedAt: new Date()
                    }
                }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({ 
                    error: 'Rule not found',
                    message: 'Blocklist rule not found or does not belong to this shop'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Blocklist rule updated successfully',
                modifiedCount: result.modifiedCount
            });
        }

        // DELETE - Delete a blocklist rule
        if (req.method === 'DELETE') {
            const { id } = req.body;

            if (!id) {
                return res.status(400).json({ error: 'Rule ID is required' });
            }

            const result = await collection.deleteOne({
                _id: new ObjectId(id),
                shop,
                listType: 'blocklist'
            });

            if (result.deletedCount === 0) {
                return res.status(404).json({ 
                    error: 'Rule not found',
                    message: 'Blocklist rule not found or does not belong to this shop'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Blocklist rule deleted successfully',
                deletedCount: result.deletedCount
            });
        }

        // Method not allowed
        return res.status(405).json({ error: 'Method Not Allowed' });

    } catch (error) {
        console.error('Error in blocklist API:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to process blocklist request',
            details: error.message
        });
    }
}