/**
 * Places API Service - Google Maps Places Service Library
 * 
 * Uses Google Maps JavaScript API Places Service (browser-compatible)
 * 
 * Key Features:
 * - Works from browser without CORS issues
 * - Cost: $32 per 1,000 requests (same as REST API)
 * - Results: ~60 businesses per query
 * - No backend/Firebase Functions needed
 */

import { db } from '../firebase';
import { collection, doc, getDoc, setDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';

// Check if Google Maps API is loaded
const isGoogleMapsLoaded = () => {
  return typeof google !== 'undefined' && google.maps && google.maps.places;
};

/**
 * Wait for Google Maps API to load
 * @returns {Promise<void>}
 */
const waitForGoogleMaps = async () => {
  let attempts = 0;
  while (!isGoogleMapsLoaded() && attempts < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }

  if (!isGoogleMapsLoaded()) {
    throw new Error('Google Maps API failed to load. Check your API key in index.html');
  }

  console.log('✅ Google Maps API loaded successfully');
};

/**
 * Call Google Maps Places Service for text search with multi-query strategy
 * @param {string} keyword - E.g., "kurti"
 * @param {string} category - E.g., "Retailer", "Wholesaler", or "All"
 * @param {string} location - E.g., "Ahmedabad"
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Results object with array of businesses
 */
const callPlacesService = async (keyword, category, location, searchScope = 'wide', specificArea = '', onProgress = null) => {
  try {
    if (!keyword || !location) {
      throw new Error('Invalid search parameters');
    }

    console.log('🔍 Calling Google Maps Places Service with multi-query strategy');

    // Ensure Google Maps is loaded
    await waitForGoogleMaps();

    // Create a hidden map element (required by PlacesService)
    const mapDiv = document.createElement('div');
    mapDiv.id = 'places-search-map';
    mapDiv.style.display = 'none';
    document.body.appendChild(mapDiv);

    const map = new google.maps.Map(mapDiv, {
      center: { lat: 20, lng: 0 },
      zoom: 2
    });

    // Create Places Service
    const service = new google.maps.places.PlacesService(map);

    // Build the location string based on search scope
    let searchLocation = location;
    if ((searchScope === 'specific' || searchScope === 'neighborhood') && specificArea.trim()) {
      // For specific area searches, use "area, city" format
      searchLocation = `${specificArea}, ${location}`;
    }

    // Build queries to search - create 5-6 variations for maximum coverage
    let queries = [];

    if (category === 'All') {
      // Search multiple business types with different query variations
      const businessTypes = ['Retailer', 'Wholesaler', 'Manufacturer', 'Distributor', 'Dealer', 'Shop'];
      
      businessTypes.forEach(type => {
        // Variation 1: "keyword type in location"
        queries.push(`${keyword} ${type} in ${searchLocation}`);
        
        // Variation 2: "type of keyword in location" (only for first few to avoid explosion)
        if (queries.length < (businessTypes.length * 2)) {
          queries.push(`${type} of ${keyword} in ${searchLocation}`);
        }
      });
    } else if (category === 'Custom') {
      // Multiple query variations for custom category
      queries = [
        `${keyword} in ${searchLocation}`,
        `${keyword} shop in ${searchLocation}`,
        `${keyword} store in ${searchLocation}`,
        `${keyword} seller in ${searchLocation}`,
        `${keyword} dealer in ${searchLocation}`,
        `buy ${keyword} in ${searchLocation}`
      ];
    } else {
      // Multiple query variations for specific category
      queries = [
        `${keyword} ${category} in ${searchLocation}`,
        `${category} of ${keyword} in ${searchLocation}`,
        `${keyword} ${category.toLowerCase()} in ${searchLocation}`,
        `${category} selling ${keyword} in ${searchLocation}`,
        `${keyword} - ${category} in ${searchLocation}`,
        `${keyword} ${category} near ${searchLocation}`
      ];
    }

    // Limit queries to avoid too many API calls
    queries = queries.slice(0, 6);
    
    console.log(`🔍 Searching ${queries.length} query variations for "${keyword}" in "${searchLocation}"`);
    console.log(`   Queries: ${queries.join(' | ')}`);

    let allResults = [];
    let uniquePlaceIds = new Set();
    let totalApiCalls = 0;

    // Execute each query
    for (let queryIndex = 0; queryIndex < queries.length; queryIndex++) {
      const query = queries[queryIndex];
      console.log(`\n📄 Query ${queryIndex + 1}/${queries.length}: "${query}"`);

      if (onProgress) {
        onProgress({
          query: query,
          status: 'searching',
          message: `[${queryIndex + 1}/${queries.length}] Searching: ${query}...`
        });
      }

      // Perform text search with pagination for this query
      const queryResults = await new Promise((resolve, reject) => {
        let resultsForQuery = [];
        let pageCount = 0;
        let pagination = null;
        const maxPages = 5; // 5 pages = ~100 results per query

        const formatPlace = (place) => ({
          displayName: { text: place.name },
          formattedAddress: place.formatted_address,
          lat: place.geometry?.location?.lat(),
          lng: place.geometry?.location?.lng(),
          rating: place.rating || null,
          userRatingCount: place.user_ratings_total || 0,
          types: place.types || [],
          placeId: place.place_id,
          nationalPhoneNumber: place.formatted_phone_number || null,
          websiteUri: place.website || null,
          businessStatus: place.business_status || 'OPERATIONAL',
          openingHours: place.opening_hours || null
        });

        const performPageSearch = () => {
          service.textSearch({ query }, (results, status, paginationInfo) => {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
              pageCount++;
              console.log(`  📄 Page ${pageCount}: ${results.length} results`);

              // Add unique results (avoid duplicates across queries)
              results.forEach(place => {
                if (!uniquePlaceIds.has(place.place_id)) {
                  uniquePlaceIds.add(place.place_id);
                  resultsForQuery.push(formatPlace(place));
                }
              });

              totalApiCalls++;

              // Check if we should fetch next page
              if (paginationInfo?.hasNextPage && pageCount < maxPages) {
                console.log(`  📄 Page ${pageCount + 1}...`);
                // Delay before fetching next page (API rate limiting)
                setTimeout(() => {
                  paginationInfo.nextPage();
                }, 200);
              } else {
                // Done with this query
                console.log(`  ✅ Query ${queryIndex + 1} complete: ${resultsForQuery.length} unique results`);
                resolve(resultsForQuery);
              }
            } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
              console.log(`  ⚠️ No results for this query`);
              resolve(resultsForQuery);
            } else {
              console.error(`  ❌ Places Service error: ${status}`);
              reject(new Error(`Places Service error: ${status}`));
            }
          });
        };

        // Start first search for this query
        performPageSearch();
      });

      allResults = allResults.concat(queryResults);

      // Delay between queries (avoid rate limiting)
      if (queryIndex < queries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Clean up map element
    mapDiv.remove();

    console.log(`\n✅ All queries complete. Total unique results: ${allResults.length}`);

    return {
      success: true,
      resultsCount: allResults.length,
      places: allResults,
      timestamp: new Date().toISOString(),
      cost: `$${(allResults.length * (32 / 1000)).toFixed(2)}`,
      source: 'google-places-service-multi-query',
      queriesExecuted: queries.length,
      apiCalls: totalApiCalls,
      searchArea: searchLocation,
      scope: searchScope
    };
  } catch (error) {
    console.error('❌ Places Service error:', error.message);
    throw error;
  }
};

/**
 * Generate cache key from search parameters
 * @param {string} keyword - Search keyword
 * @param {string} location - Search location
 * @returns {string} - Cache key
 */
const generateCacheKey = (keyword, location) => {
  // Create a deterministic key from keyword and location
  const normalized = `${keyword.toLowerCase().trim()}|${location.toLowerCase().trim()}`;
  // Simple hash (in production, use a proper hash function)
  return btoa(normalized).replace(/[^a-zA-Z0-9]/g, '');
};

/**
 * Check if cached results are still fresh
 * @param {number|Object} createdAt - Timestamp when results were created (can be number or Firestore Timestamp)
 * @param {number} ttlDays - Time to live in days (default: 7)
 * @returns {boolean} - True if cache is fresh
 */
const isCacheFresh = (createdAt, ttlDays = 7) => {
  try {
    if (!createdAt) {
      return false; // No timestamp, treat as expired
    }
    
    // Handle Firestore Timestamp objects
    const timestamp = typeof createdAt === 'number' 
      ? createdAt 
      : (createdAt.toMillis?.() || createdAt.getTime?.() || 0);
    
    if (timestamp === 0) {
      return false; // Invalid timestamp
    }
    
    const now = Date.now();
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    const isValid = (now - timestamp) < ttlMs;
    
    if (!isValid) {
      console.log(`⏱️ Cache expired: ${Math.round((now - timestamp) / (1000 * 60 * 60 * 24))} days old (TTL: ${ttlDays} days)`);
    }
    
    return isValid;
  } catch (error) {
    console.warn('Error checking cache freshness:', error);
    return false; // Treat as expired if there's an error
  }
};

/**
 * Get cached results from Firestore
 * @param {string} cacheKey - Cache key
 * @returns {Object|null} Cached results object or null if not found
 */
const getCachedResults = async (cacheKey) => {
  try {
    const cacheRef = doc(db, 'searchCache', cacheKey);
    const cacheDoc = await getDoc(cacheRef);

    if (cacheDoc.exists()) {
      const cacheData = cacheDoc.data();

      if (!cacheData || typeof cacheData !== 'object') {
        console.warn('❌ Invalid cache data structure');
        return null;
      }

      const createdAt = cacheData.createdAt?.toMillis?.() || cacheData.createdAt;
      if (createdAt && isCacheFresh(createdAt)) {
        console.log(`📦 Cache HIT: Using cached results for ${cacheKey}`);

        // Update hit count
        await setDoc(
          doc(db, 'searchCache', cacheKey),
          { hitCount: (cacheData.hitCount || 0) + 1, lastAccessAt: serverTimestamp() },
          { merge: true }
        ).catch(err => {
          console.warn('Could not update cache hit count:', err);
        });

        return cacheData;
      } else {
        console.log(`⏱️ Cache EXPIRED: Results are older than 7 days`);
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error('Error reading cache:', error);
    return null;
  }
};

/**
 * Store results in Firestore cache
 * @param {string} cacheKey - Cache key
 * @param {Object} results - Results to cache
 */
const cacheResults = async (cacheKey, results) => {
  try {
    const cacheRef = doc(db, 'searchCache', cacheKey);
    await setDoc(cacheRef, {
      ...results,
      createdAt: serverTimestamp(),
      hitCount: 0,
      lastAccessAt: serverTimestamp()
    });
    console.log(`💾 Results cached: ${cacheKey}`);
  } catch (error) {
    console.error('Error caching results:', error);
  }
};

/**
 * Convert API results to the same format expected by frontend
 * This maintains compatibility with existing code
 * 
 * @param {Array} results - Results from Google Places API
 * @returns {Array} - Array of leads in the expected format
 */
const formatAPIResults = (results) => {
  if (!Array.isArray(results)) {
    console.warn('formatAPIResults: results is not an array');
    return [];
  }

  return results.map((place, index) => {
    try {
      return {
        id: place.placeId || `place_${Date.now()}_${index}`,
        displayName: place.displayName || { text: 'Unknown' },
        formattedAddress: place.formattedAddress || 'Address not available',
        nationalPhoneNumber: place.nationalPhoneNumber || null,
        websiteUri: place.websiteUri || null,
        businessStatus: place.businessStatus || 'OPERATIONAL',
        types: place.types || ['establishment'],
        rating: place.rating || null,
        userRatingCount: place.userRatingCount || 0,
        source: 'google-places-api'
      };
    } catch (error) {
      console.warn(`Error formatting result at index ${index}:`, error);
      return null;
    }
  }).filter(Boolean);
};

/**
 * Main search function - official Google Places API
 * 
 * @param {string} keyword - Business keyword to search
 * @param {string} category - Business category (kept for compatibility)
 * @param {string} location - Location to search in
 * @param {string} apiKey - Unused (kept for compatibility)
 * @param {string} searchScope - Search scope ('wide', 'neighborhood', 'specific')
 * @param {string} specificArea - Specific area for focused search
 * @param {Function} onProgress - Progress callback
 * @param {Function} onApiCall - API call callback
 * @returns Object with results, apiCalls, and metadata
 */
export const searchBusinesses = async (
  keyword,
  category = 'All',
  location,
  apiKey = null,
  searchScope = 'wide',
  specificArea = '',
  onProgress = null,
  onApiCall = null
) => {
  if (!keyword || !location) {
    throw new Error('Keyword and location are required');
  }

  console.log(`🚀 Starting search: "${keyword}" in "${location}"`);

  // Build search query
  let searchQuery = keyword;
  
  if (searchScope === 'specific' && specificArea.trim()) {
    searchQuery = `${keyword} in ${specificArea}, ${location}`;
  } else if (searchScope === 'neighborhood' && specificArea.trim()) {
    searchQuery = `${keyword} in ${specificArea}, ${location}`;
  } else {
    searchQuery = `${keyword} in ${location}`;
  }

  // Add category if not "All"
  if (category !== 'All' && category !== 'Custom') {
    searchQuery = `${category} ${searchQuery}`;
  }

  console.log(`📝 Search query: "${searchQuery}"`);

  try {
    // Generate cache key
    const cacheKey = generateCacheKey(keyword, location);
    console.log(`🔑 Cache key: ${cacheKey}`);

    // Check cache first
    let cacheData = await getCachedResults(cacheKey);
    
    if (cacheData && cacheData.places) {
      // Return cached results
      const formattedResults = formatAPIResults(cacheData.places);
      
      if (onProgress) {
        onProgress({
          query: searchQuery,
          total: formattedResults.length,
          fromCache: true
        });
      }

      return {
        results: formattedResults,
        places: formattedResults,
        apiCalls: 0,
        query: searchQuery,
        cached: true,
        totalResults: formattedResults.length
      };
    }

    // Cache miss - call Google Maps Places Service
    console.log(`🌐 Cache miss - calling Google Maps Places Service`);
    
    if (onProgress) {
      onProgress({
        query: searchQuery,
        status: 'searching',
        message: 'Searching for businesses...'
      });
    }

    // Fetch with multi-query strategy (searches different business types & query variations)
    const apiResponse = await callPlacesService(keyword, category, location, searchScope, specificArea, onProgress);
    
    if (onApiCall) {
      onApiCall();
    }

    console.log(`✅ Got ${apiResponse.resultsCount || 0} results`);

    // Format results
    const formattedResults = formatAPIResults(apiResponse.places || []);

    // Cache the results
    await cacheResults(cacheKey, {
      query: searchQuery,
      places: apiResponse.places,
      resultsCount: apiResponse.resultsCount,
      timestamp: new Date().toISOString()
    });

    // Update progress
    if (onProgress) {
      onProgress({
        query: searchQuery,
        total: formattedResults.length,
        status: 'complete',
        cost: apiResponse.cost
      });
    }

    return {
      results: formattedResults,
      places: formattedResults,
      apiCalls: 1,
      query: searchQuery,
      cached: false,
      totalResults: formattedResults.length,
      cost: apiResponse.cost
    };

  } catch (error) {
    console.error('❌ Search error:', error);
    
    if (onProgress) {
      onProgress({
        error: true,
        message: error.message
      });
    }

    throw error;
  }
};

/**
 * Filter results by phone number requirement
 * @param {Array} leads - Array of leads
 * @param {boolean} requirePhone - Whether to filter for phone numbers
 * @returns {Array} - Filtered leads
 */
export const filterByPhoneNumber = (leads, requirePhone = false) => {
  if (!requirePhone || !leads || !Array.isArray(leads)) {
    return leads || [];
  }

  return leads.filter(lead => {
    // Safely check if phone number exists and is not empty
    const phone = lead?.nationalPhoneNumber;
    return phone && typeof phone === 'string' && phone.trim() !== '';
  });
};

/**
 * Filter results by address requirement
 * @param {Array} leads - Array of leads
 * @param {boolean} requireAddress - Whether to filter for addresses
 * @returns {Array} - Filtered leads
 */
export const filterByAddress = (leads, requireAddress = false) => {
  if (!requireAddress || !leads || !Array.isArray(leads)) {
    return leads || [];
  }

  return leads.filter(lead => {
    // Safely check if address exists and is not empty
    const address = lead?.formattedAddress;
    return address && typeof address === 'string' && address.trim() !== '';
  });
};

/**
 * Deduplicate results by phone or name
 * @param {Array} leads - Array of leads
 * @returns {Array} - Deduplicated leads
 */
export const deduplicateResults = (leads) => {
  const seen = new Set();
  const deduplicated = [];

  for (const lead of leads) {
    // Use phone as primary dedup key, fallback to display name
    // Extract text from displayName object or use empty string as fallback
    const phone = (lead.nationalPhoneNumber || '').toString().trim();
    const name = (lead.displayName?.text || '').toString().toLowerCase().trim();
    const key = phone || name;
    
    if (key && !seen.has(key)) {
      seen.add(key);
      deduplicated.push(lead);
    }
  }

  return deduplicated;
};

/**
 * Clear cache for a specific query (useful for refresh)
 * @param {string} keyword - Business keyword
 * @param {string} location - Location
 */
export const clearCache = async (keyword, location) => {
  try {
    const cacheKey = generateCacheKey(keyword, location);
    const cacheRef = doc(db, 'searchCache', cacheKey);
    
    // In Firestore, we use delete to remove a document
    // For now, we'll just update it to mark as expired
    await setDoc(cacheRef, {
      expiresAt: new Date(0) // Set to epoch time (expired)
    }, { merge: true });
    
    console.log(`🗑️ Cache cleared for: ${cacheKey}`);
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
};

/**
 * Get cache statistics
 * @returns Cache stats object with total hits and size information
 */
export const getCacheStats = async () => {
  try {
    const cacheQuery = query(collection(db, 'searchCache'));
    const snapshot = await getDocs(cacheQuery);
    
    let totalHits = 0;
    let totalCached = 0;
    let cacheSize = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      totalHits += data.hitCount || 0;
      totalCached += 1;
      cacheSize += JSON.stringify(data).length;
    });

    return {
      totalCached,
      totalHits,
      cacheSizeBytes: cacheSize,
      cacheSizeMB: (cacheSize / 1024 / 1024).toFixed(2)
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return null;
  }
};

export default {
  searchBusinesses,
  filterByPhoneNumber,
  filterByAddress,
  deduplicateResults,
  clearCache,
  getCacheStats
};
