// pages/api/access/verify-token.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
        const { token, shop } = req.body;

        if (!token) {
            return res.status(400).json({ 
                success: false,
                valid: false,
                message: 'Token is required' 
            });
        }

        if (!shop) {
            return res.status(400).json({ 
                success: false,
                valid: false,
                message: 'Shop parameter is required' 
            });
        }

        // Verify JWT token
        try {
            const decoded = jwt.verify(token, JWT_SECRET);

            // Check if token is for the correct shop
            if (decoded.shop !== shop) {
                return res.status(403).json({
                    success: false,
                    valid: false,
                    message: 'Token is not valid for this shop'
                });
            }

            // Check token age (additional client-side validation)
            const tokenAge = Date.now() - decoded.timestamp;
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

            if (tokenAge > maxAge) {
                return res.status(401).json({
                    success: false,
                    valid: false,
                    expired: true,
                    message: 'Token has expired (24 hour limit)'
                });
            }

            // Token is valid
            const remainingTime = Math.floor((maxAge - tokenAge) / 1000);
            
            return res.status(200).json({
                success: true,
                valid: true,
                message: 'Token is valid',
                verified: decoded.verified,
                expiresAt: decoded.exp,
                remainingSeconds: remainingTime
            });

        } catch (jwtError) {
            // Token is invalid or expired
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    valid: false,
                    expired: true,
                    message: 'Token has expired'
                });
            }

            return res.status(401).json({
                success: false,
                valid: false,
                message: 'Invalid token'
            });
        }

    } catch (error) {
        console.error('Error in verify-token API:', error);
        return res.status(500).json({
            success: false,
            valid: false,
            error: 'Internal Server Error',
            message: 'Failed to verify token'
        });
    }
}