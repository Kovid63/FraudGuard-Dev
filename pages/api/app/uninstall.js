// /api/app/uninstall.js

import sessionHandler from '../utils/sessionHandler';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { shop, host } = req.body;

  if (!shop) {
    return res.status(400).json({ error: 'Shop parameter is required' });
  }

  try {
    // Get the access token for this shop (implement based on your auth system)
    const accessToken = await getAccessTokenForShop(shop);
    
    if (!accessToken) {
      throw new Error('No access token found for shop');
    }

    // Use official Shopify API to uninstall the app
    const revokeUrl = `https://${shop}/admin/api_permissions/current.json`;
    
    const response = await fetch(revokeUrl, {
      method: 'DELETE',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (response.status === 200) {
      
      return res.json({ 
        success: true, 
        message: 'App uninstalled successfully',
        status: response.status
      });
    } else {
      throw new Error(`Uninstall failed with status: ${response.status}`);
    }

  } catch (error) {
    console.error('Uninstall error:', error);
    return res.status(500).json({ 
      error: 'Failed to uninstall app',
      message: error.message,
      success: false
    });
  }
}

// Helper function to get access token 
async function getAccessTokenForShop(shop) {
  
  try {
    const session = await sessionHandler.loadSession(shop);
    return session.accessToken;
  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
}
