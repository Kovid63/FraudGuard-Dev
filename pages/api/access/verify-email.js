// pages/api/access/verify-email.js
import clientPromise from '../../../lib/mongo';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

export default async function handler(req, res) {
    // Enable CORS for theme extension requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            error: 'Method Not Allowed',
            message: 'Only POST requests are allowed'
        });
    }

    try {
        const { email, shop } = req.body;

        // Validate required fields
        if (!email) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Email is required'
            });
        }

        if (!shop) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Shop parameter is required'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid email format'
            });
        }

        // Connect to MongoDB
        const client = await clientPromise;
        const db = client.db(shop.split('.')[0]);
        const collection = db.collection('access_control');

        // Check if email exists in allowlist
        const allowlistRule = await collection.findOne({
            shop,
            listType: 'allowlist',
            type: 'Email',
            value: email
        });

        if (allowlistRule) {
            // Generate JWT bypass token (valid for 24 hours)
            const bypassToken = jwt.sign(
                {
                    shop: shop,
                    verified: true,
                    timestamp: Date.now()
                },
                JWT_SECRET,
                { expiresIn: '24h' }
            );

            // Set the cookie in the response headers
            const cookieOptions = [
                `bypassToken=${bypassToken}`,
                'Max-Age=86400', // 24 hours
                'Path=/',
                'SameSite=None',
                'Secure', // Required for SameSite=None
                // 'HttpOnly', // Uncomment if you don't need JS access to the cookie
            ].join('; ');

            res.setHeader('Set-Cookie', cookieOptions);

            console.log('Email verified successfully for shop:', shop);

            // Email found in allowlist - return success with JWT token
            return res.status(200).json({
                success: true,
                verified: true,
                message: 'Email verified successfully',
                accessGranted: true,
                bypassToken: bypassToken, // Still include in response for client-side storage if needed
                expiresIn: 86400
            });
            
        } else {
            // Email not found in allowlist
            return res.status(403).json({
                success: false,
                verified: false,
                message: 'Email not recognized. Please contact store support for assistance.',
                accessGranted: false
            });
        }

    } catch (error) {
        console.error('Error in verify-email API:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to verify email',
            details: error.message
        });
    }
}