// pages/api/version.js
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get version directly from Vercel's environment variables at runtime
  const version = process.env.VERCEL_DEPLOYMENT_ID || `build-${Date.now()}`;
  const shortVersion = version.slice(0, 7);
  const buildTime = process.env.VERCEL_GIT_COMMIT_REF || Date.now().toString();

  const versionInfo = {
    version,
    shortVersion,
    buildTime,
    deploymentUrl: process.env.VERCEL_URL,
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'main',
    timestamp: Date.now(),
    environment: process.env.NODE_ENV
  };

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  return res.status(200).json(versionInfo);
}