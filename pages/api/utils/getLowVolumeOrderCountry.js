async function checkLowVolumeCountry(shopifyClient, orderData, cacheKey = 'country_stats') {
  try {
    // Get country from order (prioritize shipping address, fallback to billing)
    const orderCountryCode = orderData.shipping_address?.country_code || 
                           orderData.billing_address?.country_code;
    
    if (!orderCountryCode) {
      console.warn('No country code found in order data');
      return { isLowVolumeCountry: false, countryPercentage: 0 };
    }

    // Check if we have cached country statistics (you might want to implement caching)
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

async function fetchCountryStatistics(shopifyClient) {
  const query = `
    query getOrderCountryStats($first: Int!, $after: String) {
      orders(first: $first, after: $after) {
        edges {
          node {
            id
            shippingAddress {
              countryCodeV2
            }
            billingAddress {
              countryCodeV2
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  let allOrders = [];
  let hasNextPage = true;
  let cursor = null;
  const batchSize = 250; // Max allowed by Shopify

  try {
    while (hasNextPage) {
      const response = await shopifyClient.request(query, {
        variables: {
          first: batchSize,
          after: cursor
        }
      });

      if (response?.data?.orders?.edges) {
        allOrders = allOrders.concat(response.data.orders.edges);
        hasNextPage = response.data.orders.pageInfo.hasNextPage;
        cursor = response.data.orders.pageInfo.endCursor;
        
        console.log(`Fetched ${allOrders.length} orders so far...`);
        
        // Add a small delay to avoid rate limiting
        if (hasNextPage) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } else {
        break;
      }
    }

    // Process orders and count by country
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

// Simple in-memory cache implementation
const countryStatsCache = new Map();

async function getCachedCountryStats(cacheKey) {
  return countryStatsCache.get(cacheKey);
}

async function cacheCountryStats(cacheKey, stats) {
  countryStatsCache.set(cacheKey, stats);
  return true;
}

function shouldRefreshCache(countryStats, maxAgeHours = 6) {
  if (!countryStats.lastUpdated) return true;
  
  const lastUpdated = new Date(countryStats.lastUpdated);
  const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
  
  return (Date.now() - lastUpdated.getTime()) > maxAge;
}

// Usage in your existing code:
// async function processOrder(orderData, session) {
//   const shopifyClient = new shopify.clients.Graphql({ session });
  
//   const [riskSettings, shopifyApiRiskData, countryAnalysis] = await Promise.all([
//     getOrderRisks(shopifyClient, orderData.admin_graphql_api_id),
//     // your other existing calls
//     checkLowVolumeCountry(shopifyClient, orderData)
//   ]);

//   if (countryAnalysis.isLowVolumeCountry) {
//     console.log(`🚨 Order from low-volume country detected: ${countryAnalysis.countryCode} (${countryAnalysis.countryPercentage}%)`);
//     // Add your risk handling logic here
//   }

//   return {
//     risks: shopifyApiRiskData,
//     countryRisk: countryAnalysis,
//     // other data
//   };
// }