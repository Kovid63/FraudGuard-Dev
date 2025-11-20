// lib/shopify.js
import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';

console.info('HOST:', process.env.HOST);
console.info('Parsed hostName:', process.env.HOST?.replace(/^https?:\/\//, ''));

export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SHOPIFY_API_SCOPES.split(','),  // Make sure to split by comma
  hostName: process.env.HOST.replace(/^https?:\/\//, ''),
  apiVersion: ApiVersion.July25,
  isEmbeddedApp: true,
  logger: {
    info: (...args) => console.info(...args),
    warn: (...args) => console.warn(...args),
    error: (...args) => console.error(...args),
  },
});

