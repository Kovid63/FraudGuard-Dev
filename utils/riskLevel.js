// pages/api/utils/riskLevel.js
import { CARD_ATTEMPTS, FAILED_PAYMENT_ATTEMPTS, SCORE_THRESHOLD_HIGH_RISK, SCORE_THRESHOLD_MEDIUM_RISK } from "../../../config/constants";
import clientPromise from "../../../lib/mongo";
import { getBinFromOrderId } from "../validation";
import sessionHandler from "./sessionHandler";
import { shopify } from '../../../lib/shopify';

const SCORING_WEIGHTS = {
    IP_MISMATCH: 15,
    FAILED_PAYMENTS: 20,
    MULTIPLE_CARDS: 20,
    DISTANCE: 15,
    PROXY_USE: 15,
    PAST_FRAUD: 15
};

const SCORING_LIMITS = {
    MAX_POSITIVE_DEDUCTION: -25,
    HIGH_RISK_FLOOR: 55,
    HIGH_RISK_THRESHOLD: 70,
    MAX_SCORE: 99
};

const countryStatsCache = new Map();
const aovCpaStatsCache = new Map();

function hasMultipleFailedPaymentAttempts(transactionsData) {
    if (!transactionsData?.transactions) return false;

    let failCount = 0;
    for (const transaction of transactionsData.transactions) {
        if (transaction.status === "failure") {
            failCount++;
            if (failCount >= FAILED_PAYMENT_ATTEMPTS) return true;
        }
    }
    return false;
}

function hasUsedMultipleCreditCards(transactionsData) {
    if (!transactionsData?.transactions) return false;

    const uniqueCards = new Set();
    for (const transaction of transactionsData.transactions) {
        if (transaction.payment_details?.credit_card_number) {
            uniqueCards.add(transaction.payment_details.credit_card_number);
            if (uniqueCards.size >= CARD_ATTEMPTS) return true;
        }
    }
    return false;
}

function isPaymentMethodPaypal(transactionsData) {
    if (!transactionsData?.transactions) return false;

    for (const transaction of transactionsData.transactions) {
        if (transaction.payment_details?.payment_method_name === "paypal") return true;
    }
    return false;
}

function addressesMatch(addr1, addr2) {
    const keysToCompare = [
        "first_name", "last_name", "address1", "address2", "city",
        "zip", "province", "country", "company", "country_code", "province_code"
    ];

    return keysToCompare.every(key => {
        const v1 = (addr1[key] ?? "").toString().trim().toLowerCase();
        const v2 = (addr2[key] ?? "").toString().trim().toLowerCase();
        return v1 === v2;
    });
}

export async function getCardBrandFromBin(bin) {
    const apis = [
        { url: `https://data.handyapi.com/bin/${bin}`, parser: (data) => data?.Scheme || data?.Brand },
        { url: `https://lookup.binlist.net/${bin}`, parser: (data) => data?.scheme || data?.brand },
        { url: `https://api.bincheck.io/bin/${bin}`, parser: (data) => data?.scheme || data?.brand },
        { url: `https://bins.payout.com/api/v1/bin/${bin}`, parser: (data) => data?.scheme || data?.brand }
    ];

    for (const api of apis) {
        try {
            console.info(`Attempting BIN lookup with API: ${api.url}`);
            const response = await fetch(api.url, {
                headers: { 'Accept': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();
                const brand = api.parser(data);
                if (brand) {
                    console.info(`Successfully got card brand from API: ${brand}`);
                    return brand;
                }
            } else {
                console.warn(`BIN API failed (${api.url}):`, response.status);
            }
        } catch (error) {
            console.warn(`BIN API error (${api.url}):`, error.message);
        }
    }

    console.warn('All BIN APIs failed to return card brand');
    return null;
}

function validateEmailRisk(email) {
    const trustedProviders = new Set([
        'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
        'icloud.com', 'protonmail.com', 'aol.com', 'live.com',
        'msn.com', 'yandex.com', 'mail.com', 'zoho.com',
        'fastmail.com', 'tutanota.com', 'gmx.com', 'web.de',
        'mail.ru', 'qq.com', '163.com', '126.com'
    ]);

    const disposableProviders = new Set([
        'mailinator.com', '10minutemail.com', 'guerrillamail.com',
        'tempmail.org', 'throwaway.email', 'maildrop.cc',
        'yopmail.com', 'temp-mail.org', 'getairmail.com',
        'fakeinbox.com', 'dispostable.com', 'emailondeck.com',
        'mohmal.com', 'sharklasers.com', 'guerrillamailblock.com'
    ]);

    const suspiciousTlds = new Set([
        '.tk', '.ml', '.ga', '.cf', '.click', '.download',
        '.loan', '.win', '.bid', '.racing', '.cricket',
        '.review', '.faith', '.science', '.accountant',
        '.stream', '.date', '.party', '.trade', '.webcam'
    ]);

    const typoPatterns = new Map([
        ['paypal.com', ['paypall.com', 'payp4l.com', 'paypaI.com', 'paipal.com']],
        ['google.com', ['googIe.com', 'g00gle.com', 'gooogle.com']],
        ['microsoft.com', ['mircosoft.com', 'microsooft.com']],
        ['amazon.com', ['amazom.com', 'amaz0n.com', 'amazone.com']],
        ['apple.com', ['appIe.com', 'appl3.com', 'appple.com']]
    ]);

    const result = {
        isValid: true,
        riskLevel: 'low',
        issues: [],
        domain: null,
        localPart: null
    };

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        result.isValid = false;
        result.riskLevel = 'high';
        result.issues.push('Invalid email format');
        return result;
    }

    const [localPart, domain] = email.toLowerCase().split('@');
    result.localPart = localPart;
    result.domain = domain;

    if (checkMalformedEmail(email, result)) {
        return result;
    }

    checkSuspiciousLocalPart(localPart, result);

    checkDomainRisks(domain, trustedProviders, disposableProviders, suspiciousTlds, typoPatterns, result);

    if (result.isValid && !trustedProviders.has(domain)) {
        result.isValid = false;
        result.riskLevel = 'high';
        if (!result.issues.includes('Non-trusted domain (only popular email providers allowed)')) {
            result.issues.push('Non-trusted domain (only popular email providers allowed)');
        }
    }

    return result;

    function checkMalformedEmail(email, result) {
        const malformedPatterns = [
            /@@/,
            /\.\./,
            /^\./,
            /\.$/,
            /@\./,
            /\.@/,
            /\s/,
            /^@/,
            /@$/
        ];

        for (const pattern of malformedPatterns) {
            if (pattern.test(email)) {
                result.isValid = false;
                result.riskLevel = 'high';
                result.issues.push('Malformed email format');
                return true;
            }
        }
        return false;
    }

    function checkSuspiciousLocalPart(localPart, result) {
        const hasLongConsecutiveNumbers = /\d{5,}/.test(localPart);
        if (hasLongConsecutiveNumbers) {
            result.isValid = false;
            result.riskLevel = 'high';
            result.issues.push('Suspicious long number sequence in local part');
            return true;
        }

        const veryRandomPattern = /^[a-z]{8,}$/;

        if (veryRandomPattern.test(localPart) && localPart.length > 10) {
            const vowels = (localPart.match(/[aeiou]/g) || []).length;
            const vowelRatio = vowels / localPart.length;

            const hasDoubleLetters = /(.)\1/.test(localPart);
            const hasTripleLetters = /(.)\1{2,}/.test(localPart);
            const alternatingPattern = /^([a-z])([a-z])\1\2/.test(localPart);

            if (vowelRatio < 0.15 && (hasTripleLetters || alternatingPattern)) {
                result.isValid = false;
                result.riskLevel = 'high';
                result.issues.push('Suspicious random-looking local part');
                return true;
            }
        }

        const randomMixPattern = /^[a-z]\d[a-z]\d[a-z]\d[a-z]\d/;
        const shortRandomPattern = /^[a-z0-9]{6,8}$/;

        if (randomMixPattern.test(localPart)) {
            result.isValid = false;
            result.riskLevel = 'high';
            result.issues.push('Suspicious alternating letter-digit pattern');
            return true;
        }

        if (shortRandomPattern.test(localPart) && localPart.length <= 8) {
            const vowels = (localPart.match(/[aeiou]/g) || []).length;
            const vowelRatio = vowels / localPart.length;
            const hasNumbers = /\d/.test(localPart);

            if (vowelRatio === 0 || (vowelRatio < 0.1 && hasNumbers)) {
                result.isValid = false;
                result.riskLevel = 'high';
                result.issues.push('Suspicious random-looking local part');
                return true;
            }
        }

        return false;
    }

    function checkDomainRisks(domain, trustedProviders, disposableProviders, suspiciousTlds, typoPatterns, result) {
        if (disposableProviders.has(domain)) {
            result.isValid = false;
            result.riskLevel = 'high';
            result.issues.push('Disposable/temporary email provider');
            return;
        }

        for (const tld of suspiciousTlds) {
            if (domain.endsWith(tld)) {
                result.isValid = false;
                result.riskLevel = 'high';
                result.issues.push('Suspicious top-level domain');
                return;
            }
        }

        for (const [legitimate, typos] of typoPatterns) {
            if (typos.includes(domain)) {
                result.isValid = false;
                result.riskLevel = 'high';
                result.issues.push(`Possible typo of ${legitimate}`);
                return;
            }
        }

        if (trustedProviders.has(domain)) {
            if (result.riskLevel === 'high') {
                result.isValid = false;
            }
            return;
        }

        checkSuspiciousDomainPatterns(domain, result);

        result.isValid = false;
        result.riskLevel = 'high';

        if (result.issues.length === 0) {
            result.issues.push('Non-trusted domain (only popular email providers allowed)');
        }
    }

    function checkSuspiciousDomainPatterns(domain, result) {
        const suspiciousPatterns = [
            /\d{2,}/,
            /-{2,}/,
            /^[0-9.-]+$/,
            /.{25,}/,
            /support|help|service|customer|billing|account|admin/i
        ];

        const domainWithoutTld = domain.split('.')[0];

        for (const pattern of suspiciousPatterns) {
            if (pattern.test(domainWithoutTld)) {
                result.riskLevel = 'high';

                if (/support|help|service|customer|billing|account|admin/i.test(domainWithoutTld)) {
                    result.issues.push('Domain contains service-related keywords (possible impersonation)');
                } else {
                    result.issues.push('Suspicious domain pattern detected');
                }
                return true;
            }
        }

        return false;
    }
}

function shouldRefreshCache(cachedData, maxAgeHours = 6) {
    if (!cachedData?.lastUpdated) return true;
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    return (Date.now() - new Date(cachedData.lastUpdated).getTime()) > maxAge;
}

async function getCachedCountryStats(cacheKey) {
    return countryStatsCache.get(cacheKey);
}

async function cacheCountryStats(cacheKey, stats) {
    countryStatsCache.set(cacheKey, stats);
    return true;
}

async function getCachedAOVCPAStats(cacheKey) {
    return aovCpaStatsCache.get(cacheKey);
}

async function cacheAOVCPAStats(cacheKey, stats) {
    aovCpaStatsCache.set(cacheKey, stats);
    return true;
}

function shouldRefreshAOVCPACache(aovCpaStats, maxAgeHours = 24) {
    return shouldRefreshCache(aovCpaStats, maxAgeHours);
}

async function fetchCountryStatistics(shopifyClient) {
    const query = `
        query getOrderCountryStats($first: Int!, $after: String) {
            orders(first: $first, after: $after) {
                edges {
                    node {
                        id
                        shippingAddress { countryCodeV2 }
                        billingAddress { countryCodeV2 }
                    }
                }
                pageInfo { hasNextPage endCursor }
            }
        }
    `;

    let allOrders = [];
    let hasNextPage = true;
    let cursor = null;
    const batchSize = 250;

    try {
        while (hasNextPage) {
            const response = await shopifyClient.request(query, {
                variables: { first: batchSize, after: cursor }
            });

            if (response?.data?.orders?.edges) {
                allOrders = allOrders.concat(response.data.orders.edges);
                hasNextPage = response.data.orders.pageInfo.hasNextPage;
                cursor = response.data.orders.pageInfo.endCursor;

                console.log(`Fetched ${allOrders.length} orders so far...`);

                if (hasNextPage) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } else {
                break;
            }
        }

        const countryStats = {};
        let totalOrders = 0;

        allOrders.forEach(({ node: order }) => {
            const countryCode = order.shippingAddress?.countryCodeV2 ||
                order.billingAddress?.countryCodeV2;
            if (countryCode) {
                countryStats[countryCode] = (countryStats[countryCode] || 0) + 1;
                totalOrders++;
            }
        });

        console.log(`Analyzed ${totalOrders} orders from ${Object.keys(countryStats).length} countries`);

        return {
            countries: countryStats,
            totalOrders,
            lastUpdated: new Date().toISOString(),
            ordersFetched: allOrders.length
        };
    } catch (error) {
        console.error('Error fetching country statistics:', error.message);
        throw error;
    }
}

async function fetchAOVCPAStatistics(shopifyClient) {
    const query = `
        query getOrdersForAOVCPA($first: Int!, $after: String) {
            orders(first: $first, after: $after) {
                edges {
                    node {
                        id
                        createdAt
                        totalPriceSet {
                            shopMoney {
                                amount
                                currencyCode
                            }
                        }
                        customer {
                            id
                            createdAt
                        }
                    }
                }
                pageInfo { hasNextPage endCursor }
            }
        }
    `;

    let allOrders = [];
    let hasNextPage = true;
    let cursor = null;
    const batchSize = 250;

    try {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        while (hasNextPage) {
            const response = await shopifyClient.request(query, {
                variables: { first: batchSize, after: cursor }
            });

            if (response?.data?.orders?.edges) {
                const orders = response.data.orders.edges.filter(({ node }) => {
                    const orderDate = new Date(node.createdAt);
                    return orderDate >= oneYearAgo;
                });

                allOrders = allOrders.concat(orders);
                hasNextPage = response.data.orders.pageInfo.hasNextPage;
                cursor = response.data.orders.pageInfo.endCursor;

                console.log(`Fetched ${allOrders.length} orders for AOV/CPA analysis...`);

                if (hasNextPage) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } else {
                break;
            }
        }

        const orderValues = allOrders
            .map(({ node }) => parseFloat(node.totalPriceSet?.shopMoney?.amount || '0'))
            .filter(value => value > 0);

        const totalRevenue = orderValues.reduce((sum, value) => sum + value, 0);
        const averageOrderValue = orderValues.length > 0 ? totalRevenue / orderValues.length : 0;

        const customerFirstPurchases = new Map();
        allOrders
            .sort((a, b) => new Date(a.node.createdAt) - new Date(b.node.createdAt))
            .forEach(({ node }) => {
                const customerId = node.customer?.id;
                const orderValue = parseFloat(node.totalPriceSet?.shopMoney?.amount || '0');

                if (customerId && orderValue > 0 && !customerFirstPurchases.has(customerId)) {
                    customerFirstPurchases.set(customerId, orderValue);
                }
            });

        const firstPurchaseValues = Array.from(customerFirstPurchases.values());
        const totalFirstPurchaseRevenue = firstPurchaseValues.reduce((sum, value) => sum + value, 0);
        const averageCPA = firstPurchaseValues.length > 0
            ? totalFirstPurchaseRevenue / firstPurchaseValues.length
            : averageOrderValue;

        console.log(`AOV/CPA Analysis: AOV $${averageOrderValue.toFixed(2)}, CPA $${averageCPA.toFixed(2)} from ${allOrders.length} orders`);

        return {
            averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
            averageCPA: parseFloat(averageCPA.toFixed(2)),
            totalOrders: allOrders.length,
            totalFirstTimeCustomers: firstPurchaseValues.length,
            totalRevenue: parseFloat(totalRevenue.toFixed(2)),
            lastUpdated: new Date().toISOString(),
            dataRange: '12_months'
        };
    } catch (error) {
        console.error('Error fetching AOV/CPA statistics:', error.message);
        throw error;
    }
}

async function checkLowVolumeCountry(shopifyClient, orderData, cacheKey = 'country_stats') {
    try {
        const orderCountryCode = orderData.shipping_address?.country_code ||
            orderData.billing_address?.country_code;

        if (!orderCountryCode) {
            console.warn('No country code found in order data');
            return { isLowVolumeCountry: false, countryPercentage: 0 };
        }

        let countryStats = await getCachedCountryStats(cacheKey);

        if (!countryStats || shouldRefreshCache(countryStats)) {
            console.log('Fetching country statistics from Shopify...');
            countryStats = await fetchCountryStatistics(shopifyClient);
            await cacheCountryStats(cacheKey, countryStats);
        }

        const totalOrders = countryStats.totalOrders;
        const countryOrderCount = countryStats.countries[orderCountryCode] || 0;
        const countryPercentage = totalOrders > 0 ? (countryOrderCount / totalOrders) * 100 : 0;
        const isLowVolumeCountry = countryPercentage < 5;

        console.log(`Country ${orderCountryCode}: ${countryOrderCount}/${totalOrders} orders (${countryPercentage.toFixed(2)}%)`);

        return {
            isLowVolumeCountry,
            countryPercentage: parseFloat(countryPercentage.toFixed(2)),
            countryCode: orderCountryCode,
            orderCount: countryOrderCount,
            totalOrders
        };
    } catch (error) {
        console.error('Error checking low volume country:', error.message, { category: 'country-analysis' });
        return { isLowVolumeCountry: false, countryPercentage: 0, error: error.message };
    }
}

async function checkIfFirstTimeCustomer(shopifyClient, orderData) {
    const customerId = orderData.customer?.id;
    const customerEmail = orderData.customer?.email || orderData.email;

    if (!customerId && !customerEmail) {
        console.warn('No customer ID or email found in order data');
        return { isFirstTime: false, reason: 'No customer identification' };
    }

    try {
        if (customerId) {
            const customerOrdersQuery = `
                query getCustomerOrders($customerId: ID!, $first: Int!) {
                    customer(id: $customerId) {
                        id
                        email
                        orders(first: $first) {
                            edges {
                                node {
                                    id
                                    createdAt
                                }
                            }
                        }
                    }
                }
            `;

            const response = await shopifyClient.request(customerOrdersQuery, {
                variables: {
                    customerId: `gid://shopify/Customer/${customerId}`,
                    first: 10
                }
            });

            if (response?.data?.customer?.orders?.edges) {
                const orders = response.data.customer.orders.edges;
                const previousOrders = orders.filter(({ node }) =>
                    node.id !== orderData.admin_graphql_api_id
                );

                return {
                    isFirstTime: previousOrders.length === 0,
                    totalPreviousOrders: previousOrders.length,
                    customerId,
                    customerEmail: response.data.customer.email
                };
            }
        }

        if (customerEmail) {
            const emailOrdersQuery = `
                query getOrdersByEmail($query: String!, $first: Int!) {
                    orders(first: $first, query: $query) {
                        edges {
                            node {
                                id
                                createdAt
                                email
                            }
                        }
                    }
                }
            `;

            const response = await shopifyClient.request(emailOrdersQuery, {
                variables: {
                    query: `email:${customerEmail}`,
                    first: 10
                }
            });

            if (response?.data?.orders?.edges) {
                const orders = response.data.orders.edges;
                const previousOrders = orders.filter(({ node }) =>
                    node.id !== orderData.admin_graphql_api_id
                );

                return {
                    isFirstTime: previousOrders.length === 0,
                    totalPreviousOrders: previousOrders.length,
                    customerEmail,
                    searchMethod: 'email'
                };
            }
        }

        return { isFirstTime: true, reason: 'No previous orders found' };
    } catch (error) {
        console.error('Error checking first-time customer status:', error.message);
        return { isFirstTime: false, error: error.message };
    }
}

async function checkFirstTimeHighAOV(shopifyClient, orderData, cacheKey = 'aov_cpa_stats') {
    try {
        const isFirstTimeCustomer = await checkIfFirstTimeCustomer(shopifyClient, orderData);

        if (!isFirstTimeCustomer.isFirstTime) {
            return {
                isFirstTimeHighAOV: false,
                reason: 'Not a first-time customer',
                isFirstTime: false
            };
        }

        const currentOrderValue = parseFloat(orderData.current_total_price || orderData.total_price || '0');

        if (currentOrderValue === 0) {
            console.warn('Order value is 0, cannot analyze AOV risk');
            return { isFirstTimeHighAOV: false, reason: 'Zero order value' };
        }

        let aovCpaStats = await getCachedAOVCPAStats(cacheKey);

        if (!aovCpaStats || shouldRefreshAOVCPACache(aovCpaStats)) {
            console.log('Fetching AOV and CPA statistics from Shopify...');
            aovCpaStats = await fetchAOVCPAStatistics(shopifyClient);
            await cacheAOVCPAStats(cacheKey, aovCpaStats);
        }

        const averageCPA = aovCpaStats.averageCPA;
        const thresholdAmount = averageCPA * 3;
        const isHighAOV = currentOrderValue >= thresholdAmount;

        console.log(`First-time customer AOV analysis: Order $${currentOrderValue} vs 3x CPA threshold $${thresholdAmount.toFixed(2)}`);

        return {
            isFirstTimeHighAOV: isFirstTimeCustomer.isFirstTime && isHighAOV,
            isFirstTime: isFirstTimeCustomer.isFirstTime,
            currentOrderValue,
            averageCPA,
            thresholdAmount: parseFloat(thresholdAmount.toFixed(2)),
            multiplier: parseFloat((currentOrderValue / averageCPA).toFixed(2)),
            customerId: orderData.customer?.id,
            customerEmail: orderData.customer?.email || orderData.email
        };
    } catch (error) {
        console.error('Error checking first-time high AOV:', error.message, { category: 'aov-analysis' });
        return { isFirstTimeHighAOV: false, error: error.message };
    }
}

function calculateFinalScore(baseScore, trustDeductions) {
    const cappedDeductions = Math.max(trustDeductions, SCORING_LIMITS.MAX_POSITIVE_DEDUCTION);

    let finalScore = baseScore + cappedDeductions;

    if (baseScore >= SCORING_LIMITS.HIGH_RISK_THRESHOLD) {
        finalScore = Math.max(finalScore, SCORING_LIMITS.HIGH_RISK_FLOOR);
    }

    // If score is 0 then set it to 1
    if (finalScore === 0) {
        finalScore = 1;
    }

    return Math.max(0, Math.min(finalScore, SCORING_LIMITS.MAX_SCORE));
}

export const getRiskLevel = async (order, shop, accessToken, shopifyRiskAssessments, orderTxnDetails) => {
    let baseScore = 0;
    let trustDeductions = 0;
    let reason = [];
    let trust = [];

    // Declare all variables at the top
    let client;
    let db;
    let session;
    let bin;
    let cardBrand;

    // Connect to database and load session first
    try {
        client = await clientPromise;
        db = client.db(shop.split('.')[0]);
        session = await sessionHandler.loadSession(shop);
        if (!session) {
            throw new Error('No session loaded for shop');
        }
    } catch (error) {
        console.error('Error in initial setup (MongoDB or session):', error);
        return {
            score: 0,
            baseScore: 0,
            trustDeductions: 0,
            reason: ['Error connecting to database or loading session'],
            trust: [],
            risk: 'unknown',
            recommendation: 'Unable to assess risk due to technical error. Manual review recommended.',
            error: error.message
        };
    }

    const shopifyClient = new shopify.clients.Graphql({ session });

    // BIN and Card Brand check
    try {
        bin = await getBinFromOrderId(shop, order.id, session);
        cardBrand = await getCardBrandFromBin(bin.bin);
        console.info("BIN for order:", bin, "Card Brand:", cardBrand);
    } catch (error) {
        console.error('Error with BIN/Card Brand lookup:', error.message);
        reason.push(`BIN/Card Brand lookup failed: ${error.message}`);
    }

    let hasBeenUsedBefore = false;
    if (db && orderTxnDetails && orderTxnDetails.length > 0 && cardBrand) {
        const accountNumbersToCheck = orderTxnDetails
            .filter(txn => !!txn.accountNumber && txn.status === 'SUCCESS')
            .map(txn => txn.accountNumber);

        if (accountNumbersToCheck.length > 0) {
            try {
                const wasFlaggedBefore = await db.collection('orders').findOne({
                    shop,
                    'guard.txnDetails.accountNumber': { $in: accountNumbersToCheck },
                    'guard.cardBrand': cardBrand
                });

                hasBeenUsedBefore = !!wasFlaggedBefore;

                if (hasBeenUsedBefore) {
                    const cardNumber = accountNumbersToCheck[0] || '';
                    console.warn(`Account number reused with same card brand (${cardBrand}) for shop ${shop}`);
                    baseScore += 30;
                    reason.push(`Similar card details used in a past fraudulent order ${cardNumber} - ${cardBrand}`);
                }
            } catch (error) {
                console.error('Error checking for past fraud:', error.message);
                reason.push('Error checking for past fraud');
            }
        }
    }


    // Country Risk Analysis
    try {
        const countryRiskAnalysis = await checkLowVolumeCountry(shopifyClient, order, `country_stats_${shop}`);
        if (countryRiskAnalysis?.isLowVolumeCountry) {
            baseScore += 6;
            reason.push(`Order from ${countryRiskAnalysis.countryCode} - only ${countryRiskAnalysis.countryPercentage}% of total orders`);
            console.log(`Low volume country risk: ${countryRiskAnalysis.countryCode} (${countryRiskAnalysis.countryPercentage}%)`);
        } else if (countryRiskAnalysis?.countryPercentage > 20) {
            trust.push(`Order from a popular country (${countryRiskAnalysis.countryCode}: ${countryRiskAnalysis.countryPercentage}%)`);
        }
    } catch (error) {
        console.error('Error during country risk analysis:', error.message);
        reason.push('Error during country risk analysis');
    }

    // AOV Risk Analysis
    try {
        const aovRiskAnalysis = await checkFirstTimeHighAOV(shopifyClient, order, `aov_cpa_stats_${shop}`);
        if (aovRiskAnalysis?.isFirstTimeHighAOV) {
            baseScore += 9;
            reason.push(`First-time customer with ${aovRiskAnalysis.multiplier}x average CPA ($${aovRiskAnalysis.currentOrderValue} vs $${aovRiskAnalysis.thresholdAmount} threshold)`);
            console.log(`High AOV first-time customer risk: ${aovRiskAnalysis.multiplier}x CPA`);
        }
    } catch (error) {
        console.error('Error during AOV risk analysis:', error.message);
        reason.push('Error during AOV risk analysis');
    }

    // Email Validation
    try {
        const emailValidation = validateEmailRisk(order?.email || '');
        console.info("Email validation results:", emailValidation);
        if (!emailValidation.isValid) {
            console.log("Invalid email detected");
            baseScore += 6;
            reason.push('Suspicious or non-standard email domain');
        } else {
            trust.push('Email is valid (not suspicious or unknown domain)');
        }
    } catch (error) {
        console.error('Error during email validation:', error.message);
        reason.push('Error during email validation');
    }

    // Transaction Data
    try {
        const orderId = order?.id.toString().split('/').pop();
        const transactionResponse = await fetch(`https://${shop}/admin/api/2025-04/orders/${orderId}/transactions.json`, {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
            }
        });
        const transactionData = await transactionResponse.json();

        if (hasMultipleFailedPaymentAttempts(transactionData)) {
            baseScore += 20;
            reason.push(`${FAILED_PAYMENT_ATTEMPTS} or more failed payment attempts`);
        }

        if (hasUsedMultipleCreditCards(transactionData)) {
            baseScore += 35;
            reason.push(`${CARD_ATTEMPTS} or more credit card attempts`);
        }

        if (transactionData?.transactions?.length === 1 &&
            transactionData?.transactions[0]?.status === 'success') {
            trustDeductions -= 3;
            trust.push('Only 1 payment attempt');
        }

        if (transactionData?.transactions?.length === 1 &&
            transactionData?.transactions[0]?.kind === 'authorization') {
            trustDeductions -= 5;
            trust.push('Only 1 credit card used');
        }

    } catch (error) {
        console.error('Error fetching or analyzing transaction data:', error.message);
        reason.push('Error fetching or analyzing transaction data');
    }

    // Shopify Risk Assessments
    try {
        const facts = shopifyRiskAssessments?.assessments?.[0]?.facts || [];

        let distance = null;
        let distanceDescription = null;

        for (const fact of facts) {
            const desc = fact.description || "";
            const match = desc.match(/(\d+)\s*(km|miles)/i);

            if (match) {
                const value = parseInt(match[1], 10);
                const unit = match[2].toLowerCase();
                const distanceInKm = unit === "miles" ? value * 1.60934 : value;

                if (distanceInKm > 1000) {
                    distance = distanceInKm;
                    distanceDescription = desc;
                    break;
                }
            }
        }

        if (distance !== null) {
            baseScore += 15;
            reason.push(distanceDescription);
        } else {
            trustDeductions -= 3;
            trust.push('Shipping close to IP location');
        }

        const billingStreetFact = facts.find(
            (fact) => fact.sentiment === "NEGATIVE" &&
                fact.description?.toLowerCase().includes("Billing street address doesn't match credit card's registered address")
        );

        if (billingStreetFact) {
            baseScore += 20;
            reason.push(billingStreetFact.description);
        }

        const proxyFact = facts.find(
            (fact) => fact.sentiment === "NEGATIVE" &&
                fact.description?.toLowerCase().includes("proxy")
        );

        if (proxyFact) {
            baseScore += 20;
            reason.push(proxyFact.description);
        } else {
            trustDeductions -= 5;
            trust.push('Not a high-risk connection (no web proxy/VPN/TOR)');
        }

        const fraudCharacteristicsFact = facts.find(
            (fact) => fact.sentiment === "NEGATIVE" &&
                fact.description?.toLowerCase().includes("fraudulent")
        );

        if (fraudCharacteristicsFact) {
            baseScore += 20;
            reason.push(fraudCharacteristicsFact.description);
        }

        if (shopifyRiskAssessments?.assessments?.[0]?.riskLevel === 'HIGH') {
            baseScore += 10;
            reason.push('High risk - Shopify');
        }

        if (shopifyRiskAssessments?.assessments?.[0]?.riskLevel === 'MEDIUM') {
            baseScore += 8;
            reason.push('Medium risk - Shopify');
        }

    } catch (error) {
        console.error('Error analyzing Shopify risk assessments:', error.message);
        reason.push('Error analyzing Shopify risk assessments');
    }

    // Address Match
    try {
        if (!addressesMatch(order?.shipping_address || {}, order?.billing_address || {})) {
            baseScore += 12;
            reason.push('Shipping address differs from billing address');
        } else {
            trust.push('Shipping address matches billing address');
        }
    } catch (error) {
        console.error('Error with address match check:', error.message);
        reason.push('Error with address match check');
    }

    // Payment Method Check
    try {
        const orderId = order?.id.toString().split('/').pop();
        const transactionResponse = await fetch(`https://${shop}/admin/api/2025-04/orders/${orderId}/transactions.json`, {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
            }
        });

        const transactionData = await transactionResponse.json();
        if (isPaymentMethodPaypal(transactionData)) {
            trust.push('Payment method is PayPal');
        }
    } catch (error) {
        console.error('Error with payment method check:', error.message);
    }

    const finalScore = calculateFinalScore(baseScore, trustDeductions);

    let risk = 'low';
    let recommendation = '';

    if (finalScore >= 85) {
        risk = 'high';
        recommendation = 'URGENT - Cancel this order immediately. Based on multiple high-risk signals, verification is not recommended.';
    } else if (finalScore >= 70) {
        risk = 'high-medium';
        recommendation = 'Verification required. If the customer fails to verify, we recommend cancellation. If the customer successfully verifies, approve the order.';
    } else if (finalScore >= 55) {
        risk = 'medium';
        recommendation = 'Verification recommended. If verification fails or is not completed, cancel the order. If verified, approve.';
    } else if (finalScore >= 40) {
        risk = 'low-medium';
        recommendation = 'If no multiple credit cards use are detected and some positive trust signals exist - you may approve the order. Optionally, wait for verification to be more certain.';
    } else {
        risk = 'low';
        recommendation = 'No signs of fraud detected. If there is no past record of fraudulent behavior, we recommend approval.';
    }

    if (shopifyRiskAssessments?.assessments?.[0]?.riskLevel === 'HIGH') {
        risk = 'high';
        // recommendation = 'URGENT - Cancel this order immediately. Based on multiple high-risk signals, verification is not recommended.';
    }
    if (shopifyRiskAssessments?.assessments?.[0]?.riskLevel === 'MEDIUM' &&
        ['low', 'low-medium'].includes(risk)) {
        risk = 'medium';
        // recommendation = 'Verification recommended. If verification fails or is not completed, cancel the order. If verified, approve.';
    }

    console.log(`Risk Assessment Summary:
        Base Score: ${baseScore}
        Trust Deductions: ${trustDeductions} (capped at ${SCORING_LIMITS.MAX_POSITIVE_DEDUCTION})
        Final Score: ${finalScore < 1 ? 1 : finalScore}
        Risk Level: ${risk}
        High Risk Floor Applied: ${baseScore >= SCORING_LIMITS.HIGH_RISK_THRESHOLD ? 'Yes' : 'No'}
    `);

    return {
        score: finalScore < 1 ? 1 : finalScore,
        baseScore,
        trustDeductions,
        reason,
        trust,
        risk,
        recommendation
    };
};

async function processOrderWithAOVCheck(orderData, session) {
    const shopifyClient = new shopify.clients.Graphql({ session });

    const [countryAnalysis, aovAnalysis] = await Promise.all([
        checkLowVolumeCountry(shopifyClient, orderData),
        checkFirstTimeHighAOV(shopifyClient, orderData)
    ]);

    if (aovAnalysis.isFirstTimeHighAOV) {
        console.log(`High AOV first-time customer: ${aovAnalysis.currentOrderValue} (${aovAnalysis.multiplier}x average CPA)`);
    }

    return {
        countryRisk: countryAnalysis,
        aovRisk: aovAnalysis
    };
}

export {
    checkFirstTimeHighAOV,
    checkIfFirstTimeCustomer,
    fetchAOVCPAStatistics,
    getCachedAOVCPAStats,
    cacheAOVCPAStats,
    shouldRefreshAOVCPACache,
    checkLowVolumeCountry,
    fetchCountryStatistics,
    getCachedCountryStats,
    cacheCountryStats,
    validateEmailRisk,
    calculateFinalScore,
    processOrderWithAOVCheck
};
