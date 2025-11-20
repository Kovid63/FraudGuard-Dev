// pages/api/access/verify-ip.js
import clientPromise from '../../../lib/mongo';

// Known crawler IP ranges (CIDR notation) - IPv4 and IPv6
const CRAWLER_RANGES = [
    // Googlebot IPv4
    { name: 'Googlebot', cidr: '66.249.0.0/16', version: 4 },
    // Googlebot IPv6
    { name: 'Googlebot', cidr: '2001:4860:4801::/48', version: 6 },
    { name: 'Googlebot', cidr: '2001:4860:4802::/48', version: 6 },
    
    // Bingbot IPv4
    { name: 'Bingbot', cidr: '13.66.139.0/24', version: 4 },
    { name: 'Bingbot', cidr: '40.77.167.0/24', version: 4 },
    { name: 'Bingbot', cidr: '40.77.169.0/24', version: 4 },
    { name: 'Bingbot', cidr: '40.77.170.0/24', version: 4 },
    { name: 'Bingbot', cidr: '40.77.171.0/24', version: 4 },
    // Bingbot IPv6
    { name: 'Bingbot', cidr: '2001:4898::/32', version: 6 },
    
    // Meta/Facebook crawler IPv4
    { name: 'Meta', cidr: '31.13.24.0/21', version: 4 },
    { name: 'Meta', cidr: '31.13.64.0/18', version: 4 },
    { name: 'Meta', cidr: '45.64.40.0/22', version: 4 },
    { name: 'Meta', cidr: '66.220.144.0/20', version: 4 },
    { name: 'Meta', cidr: '69.63.176.0/20', version: 4 },
    { name: 'Meta', cidr: '69.171.224.0/19', version: 4 },
    { name: 'Meta', cidr: '74.119.76.0/22', version: 4 },
    { name: 'Meta', cidr: '103.4.96.0/22', version: 4 },
    { name: 'Meta', cidr: '129.134.0.0/17', version: 4 },
    { name: 'Meta', cidr: '157.240.0.0/16', version: 4 },
    // Meta/Facebook IPv6
    { name: 'Meta', cidr: '2a03:2880::/32', version: 6 },
    { name: 'Meta', cidr: '2a03:2881::/32', version: 6 },
    { name: 'Meta', cidr: '2620:0:1c00::/40', version: 6 },
    
    // TikTok Ads crawler IPv4
    { name: 'TikTok', cidr: '47.246.0.0/16', version: 4 },
    { name: 'TikTok', cidr: '161.117.0.0/16', version: 4 },
    { name: 'TikTok', cidr: '161.189.0.0/16', version: 4 },
    { name: 'TikTok', cidr: '198.2.128.0/18', version: 4 },
];

// Detect IP version
function getIPVersion(ip) {
    if (ip.includes(':')) return 6;
    if (ip.includes('.')) return 4;
    return null;
}

// Convert IPv4 to integer for CIDR matching
function ipv4ToInt(ip) {
    return ip.split('.').reduce((int, oct) => (int << 8) + parseInt(oct, 10), 0) >>> 0;
}

// Convert IPv6 to BigInt array (8 groups of 16 bits)
function ipv6ToInts(ip) {
    // Expand :: notation
    let parts = ip.split(':');
    const emptyIndex = parts.indexOf('');
    
    if (emptyIndex !== -1) {
        const missing = 8 - parts.filter(p => p !== '').length;
        const zeros = Array(missing + 1).fill('0');
        parts = [
            ...parts.slice(0, emptyIndex),
            ...zeros,
            ...parts.slice(emptyIndex + 1)
        ].filter(p => p !== '');
    }
    
    // Pad to 8 groups
    while (parts.length < 8) parts.push('0');
    
    // Convert to array of integers
    return parts.map(p => BigInt(parseInt(p || '0', 16)));
}

// Check if IPv4 is in CIDR range
function isIPv4InCIDR(ip, cidr) {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
}

// Check if IPv6 is in CIDR range
function isIPv6InCIDR(ip, cidr) {
    const [range, bits] = cidr.split('/');
    const prefixLen = parseInt(bits);
    
    const ipParts = ipv6ToInts(ip);
    const rangeParts = ipv6ToInts(range);
    
    let bitsToCheck = prefixLen;
    
    for (let i = 0; i < 8; i++) {
        if (bitsToCheck <= 0) break;
        
        const bitsInThisGroup = Math.min(16, bitsToCheck);
        const mask = BigInt((0xFFFF << (16 - bitsInThisGroup)) & 0xFFFF);
        
        if ((ipParts[i] & mask) !== (rangeParts[i] & mask)) {
            return false;
        }
        
        bitsToCheck -= 16;
    }
    
    return true;
}

// Check if IP is in CIDR range (handles both IPv4 and IPv6)
function isIpInCIDR(ip, cidr, version) {
    try {
        if (version === 4) {
            return isIPv4InCIDR(ip, cidr);
        } else if (version === 6) {
            return isIPv6InCIDR(ip, cidr);
        }
        return false;
    } catch (error) {
        console.error('Error checking CIDR:', error);
        return false;
    }
}

// Normalize IPv6 address (remove IPv4-mapped prefix if present)
function normalizeIP(ip) {
    // Remove IPv4-mapped IPv6 prefix (::ffff:x.x.x.x)
    if (ip.startsWith('::ffff:')) {
        const ipv4 = ip.substring(7);
        if (getIPVersion(ipv4) === 4) {
            return ipv4;
        }
    }
    return ip;
}

// Convert IPv4 to IPv6 format (IPv4-mapped IPv6)
function ipv4ToIPv6(ipv4) {
    return `::ffff:${ipv4}`;
}

// Extract IPv4 from IPv6 if it's IPv4-mapped
function extractIPv4FromIPv6(ipv6) {
    if (ipv6.startsWith('::ffff:')) {
        const ipv4 = ipv6.substring(7);
        if (getIPVersion(ipv4) === 4) {
            return ipv4;
        }
    }
    return null;
}

// Get all IP addresses from request headers
function getAllClientIPs(req) {
    const ips = new Set();
    
    // Check x-forwarded-for (can contain multiple IPs)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        forwarded.split(',').forEach(ip => {
            const trimmed = ip.trim();
            if (trimmed) ips.add(normalizeIP(trimmed));
        });
    }
    
    // Check x-real-ip
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
        ips.add(normalizeIP(realIp));
    }
    
    // Check CF-Connecting-IP (Cloudflare)
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) {
        ips.add(normalizeIP(cfIp));
    }
    
    // Check True-Client-IP (Akamai and Cloudflare)
    const trueClientIp = req.headers['true-client-ip'];
    if (trueClientIp) {
        ips.add(normalizeIP(trueClientIp));
    }
    
    // Check socket IP
    const socketIP = req.socket?.remoteAddress || req.connection?.remoteAddress;
    if (socketIP) {
        ips.add(normalizeIP(socketIP));
    }
    
    console.log('All detected IPs:', Array.from(ips));
    return Array.from(ips);
}

// Get primary client IP (first from x-forwarded-for or x-real-ip)
function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const cfIp = req.headers['cf-connecting-ip'];
    const trueClientIp = req.headers['true-client-ip'];

    console.log('Headers:', {
        'x-forwarded-for': forwarded,
        'x-real-ip': realIp,
        'cf-connecting-ip': cfIp,
        'true-client-ip': trueClientIp
    });
    
    // Prioritize CloudFlare and other CDN headers
    if (cfIp) return normalizeIP(cfIp);
    if (trueClientIp) return normalizeIP(trueClientIp);
    if (forwarded) return normalizeIP(forwarded.split(',')[0].trim());
    if (realIp) return normalizeIP(realIp);
    
    const socketIP = req.socket?.remoteAddress || req.connection?.remoteAddress;
    console.log('Socket IP:', socketIP);

    if (socketIP) {
        return normalizeIP(socketIP);
    }
    
    return null;
}

// Get all IP variants to check against blocklist
function getIPVariants(ips) {
    const variants = new Set();
    
    for (const ip of ips) {
        const normalizedIP = normalizeIP(ip);
        const ipVersion = getIPVersion(normalizedIP);
        
        variants.add(normalizedIP);
        
        if (ipVersion === 4) {
            // If IPv4, also add IPv4-mapped IPv6 format
            variants.add(ipv4ToIPv6(normalizedIP));
        } else if (ipVersion === 6) {
            // If IPv6, check if it's IPv4-mapped and extract IPv4
            const ipv4 = extractIPv4FromIPv6(normalizedIP);
            if (ipv4) {
                variants.add(ipv4);
            }
        }
    }
    
    return Array.from(variants);
}

// Check if IP is a known crawler
function isCrawler(ip, userAgent) {
    // Check user agent first
    if (userAgent) {
        const ua = userAgent.toLowerCase();
        if (ua.includes('googlebot') || 
            ua.includes('bingbot') || 
            ua.includes('facebookexternalhit') || 
            ua.includes('tiktok')) {
            return true;
        }
    }

    // Normalize IP
    const normalizedIP = normalizeIP(ip);
    const ipVersion = getIPVersion(normalizedIP);
    
    if (!ipVersion) {
        console.error('Invalid IP format:', ip);
        return false;
    }

    // Check IP ranges
    for (const range of CRAWLER_RANGES) {
        if (range.version === ipVersion && isIpInCIDR(normalizedIP, range.cidr, ipVersion)) {
            console.log(`Crawler detected: ${range.name} - IP: ${normalizedIP} (IPv${ipVersion})`);
            return true;
        }
    }

    return false;
}

// Get country from IP using ip-api.com (supports both IPv4 and IPv6)
async function getCountryFromIP(ip) {
    try {
        const normalizedIP = normalizeIP(ip);
        const response = await fetch(`http://ip-api.com/json/${normalizedIP}?fields=status,country,countryCode,query`);
        const data = await response.json();
        
        if (data.status === 'success') {
            return {
                country: data.country,
                countryCode: data.countryCode,
                ip: data.query,
                ipVersion: getIPVersion(normalizedIP)
            };
        }
        return null;
    } catch (error) {
        console.error('Error fetching country from IP:', error);
        return null;
    }
}

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
        const { shop, userAgent } = req.body;

        if (!shop) {
            return res.status(400).json({ 
                error: 'Bad Request',
                message: 'Shop parameter is required' 
            });
        }

        // Get all client IPs from various headers
        const allClientIPs = getAllClientIPs(req);
        
        if (allClientIPs.length === 0) {
            return res.status(400).json({ 
                error: 'Bad Request',
                message: 'Unable to determine client IP address' 
            });
        }

        // Use the first (primary) IP for display and geo-lookup
        const clientIP = allClientIPs[0];
        const ipVersion = getIPVersion(clientIP);
        
        console.log(`Verifying primary IP: ${clientIP} (IPv${ipVersion}) for shop: ${shop}`);
        console.log(`All client IPs: ${allClientIPs.join(', ')}`);

        // Check if crawler - always allow
        if (isCrawler(clientIP, userAgent)) {
            return res.status(200).json({
                success: true,
                allowed: true,
                reason: 'crawler',
                message: 'Known crawler detected - access allowed',
                ip: clientIP,
                ipVersion
            });
        }

        // Get country from IP
        const geoData = await getCountryFromIP(clientIP);
        
        if (!geoData) {
            // If we can't determine country, allow by default (fail open)
            return res.status(200).json({
                success: true,
                allowed: true,
                reason: 'geo_lookup_failed',
                message: 'Unable to determine location - access allowed by default',
                ip: clientIP,
                ipVersion
            });
        }

        console.log('Geo data:', geoData);

        // Connect to MongoDB
        const client = await clientPromise;
        const db = client.db(shop.split('.')[0]);
        const collection = db.collection('access_control');

        // Get all IP variants to check (includes both IPv4 and IPv6 formats from ALL detected IPs)
        const ipVariants = getIPVariants(allClientIPs);
        console.log('Checking IP variants:', ipVariants);

        // Check blocklist for IP address (check all variants)
        const ipBlockRule = await collection.findOne({
            shop,
            listType: 'blocklist',
            type: 'IP Address',
            value: { $in: ipVariants }
        });

        if (ipBlockRule) {
            return res.status(200).json({
                success: true,
                allowed: false,
                blocked: true,
                reason: 'ip_blocked',
                message: 'Your IP address has been restricted',
                ip: clientIP,
                ipVersion,
                allIPs: allClientIPs,
                ipVariants,
                blockedValue: ipBlockRule.value,
                country: geoData.country,
                requiresVerification: true
            });
        }

        // Check blocklist for country
        const countryBlockRule = await collection.findOne({
            shop,
            listType: 'blocklist',
            type: 'Country',
            value: geoData.country
        });

        if (countryBlockRule) {
            return res.status(200).json({
                success: true,
                allowed: false,
                blocked: true,
                reason: 'country_blocked',
                message: 'Access from your location is currently restricted',
                ip: clientIP,
                ipVersion,
                allIPs: allClientIPs,
                ipVariants,
                country: geoData.country,
                requiresVerification: true
            });
        }

        // Not blocked - allow access
        return res.status(200).json({
            success: true,
            allowed: true,
            reason: 'not_blocked',
            message: 'Access allowed',
            ip: clientIP,
            ipVersion,
            allIPs: allClientIPs,
            ipVariants,
            country: geoData.country
        });

    } catch (error) {
        console.error('Error in verify-ip API:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to verify IP',
            details: error.message
        });
    }
}