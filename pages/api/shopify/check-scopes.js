// /api/shopify/check-scopes.js

import sessionHandler from "../utils/sessionHandler";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, shop } = req.body;
    
    const session = await sessionHandler.loadSession(shop);
    const accessToken = session.accessToken;

    if (!shop || !accessToken) {
      return res.status(401).json({ error: 'Missing authentication' });
    }

    const response = await fetch(`https://${shop}/admin/api/2025-04/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      return res.status(400).json({ error: 'GraphQL errors', details: data.errors });
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Error checking scopes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}