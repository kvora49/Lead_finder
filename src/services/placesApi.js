/**
 * Google Places API Service
 * Handles communication with Google Places API (New) for searching businesses
 */

/**
 * Performs a single search query with pagination
 * 
 * @param {string} textQuery - The complete search query text
 * @param {string} apiKey - Google Places API key
 * @param {Function} onProgress - Optional callback to report progress
 * @returns {Promise<Array>} - Array of places from this search
 */
const performSingleSearch = async (textQuery, apiKey, onProgress = null) => {
  const endpoint = 'https://places.googleapis.com/v1/places:searchText';
  
  let allPlaces = [];
  let nextPageToken = null;
  let pageCount = 0;
  const maxPages = 10;

  do {
    pageCount++;
    
    const requestBody = {
      textQuery: textQuery,
      maxResultCount: 20,
      ...(nextPageToken && { pageToken: nextPageToken })
    };

    if (onProgress) {
      onProgress({ query: textQuery, page: pageCount, total: allPlaces.length });
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.businessStatus,nextPageToken'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    console.log(`📄 Query "${textQuery.substring(0, 30)}..." - Page ${pageCount}: ${data.places?.length || 0} places. NextPageToken: ${data.nextPageToken ? 'YES ✅' : 'NO ❌'}`);
    
    if (data.places && data.places.length > 0) {
      allPlaces = allPlaces.concat(data.places);
    }
    
    nextPageToken = data.nextPageToken || null;
    
    if (!nextPageToken) {
      console.log(`🏁 Query completed: ${pageCount} page(s), ${allPlaces.length} results`);
    }

    if (nextPageToken && pageCount < maxPages) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

  } while (nextPageToken && pageCount < maxPages);

  return allPlaces;
};

/**
 * Searches for businesses using Google Places API (New) with pagination support
 * Uses multiple search strategies to maximize results
 * 
 * @param {string} keyword - The search keyword (e.g., "Kurti", "Electronics")
 * @param {string} category - The business category (e.g., "Wholesaler", "Retailer", "Custom")
 * @param {string} location - The location to search in (e.g., "Mumbai", "New York")
 * @param {string} apiKey - Google Places API key
 * @param {string} searchScope - Search area scope: 'wide', 'neighborhood', or 'specific'
 * @param {string} specificArea - Specific area/building/street name (optional)
 * @param {Function} onProgress - Optional callback to report progress (current, total)
 * @returns {Promise<Object>} - Returns the API response with all places data
 */
export const searchBusinesses = async (keyword, category, location, apiKey, searchScope = 'wide', specificArea = '', onProgress = null) => {
  // Google Places API (New) endpoint for text search
  const endpoint = 'https://places.googleapis.com/v1/places:searchText';
  
  // Construct the search query dynamically based on category and scope
  let textQuery;
  
  // Build base query with category
  if (category === 'Custom' || category === 'All') {
    textQuery = `${keyword}`;
  } else {
    textQuery = `${keyword} ${category}`;
  }
  
  // Add location based on search scope
  if (searchScope === 'specific' && specificArea.trim()) {
    // Specific location: narrow down to a building/street/area
    textQuery += ` in ${specificArea}, ${location}`;
  } else if (searchScope === 'neighborhood' && specificArea.trim()) {
    // Neighborhood search with specific area: search in that exact neighborhood
    textQuery += ` in ${specificArea}, ${location}`;
  } else if (searchScope === 'neighborhood') {
    // Neighborhood search without specific area
    textQuery += ` near ${location}`;
  } else {
    // Wide search: whole city
    textQuery += ` in ${location}`;
  }

  // Perform multiple searches to maximize results (Google limits each query to ~60 results)
  let allPlaces = [];
  
  try {
    console.log(`🔍 Starting comprehensive multi-query search for: ${textQuery}`);
    
    // Search 1: Main query with exact match
    console.log(`🔍 Query 1: Main search "${textQuery}"`);
    const search1Results = await performSingleSearch(textQuery, apiKey, onProgress);
    allPlaces = allPlaces.concat(search1Results);
    console.log(`✅ Query 1: ${search1Results.length} results`);
    
    // Search 2: Add "shops" variation (if not already present)
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!keyword.toLowerCase().includes('shop') && !keyword.toLowerCase().includes('store')) {
      const shopsQuery = textQuery.replace(keyword, `${keyword} shops`);
      console.log(`🔍 Query 2: Shops variation "${shopsQuery}"`);
      const search2Results = await performSingleSearch(shopsQuery, apiKey, onProgress);
      allPlaces = allPlaces.concat(search2Results);
      console.log(`✅ Query 2: ${search2Results.length} results (${allPlaces.length} total)`);
    }
    
    // Search 3: Try "near" variation for different results
    await new Promise(resolve => setTimeout(resolve, 1000));
    const nearQuery = textQuery.includes(' in ') ? textQuery.replace(' in ', ' near ') : `${keyword} near ${location}`;
    console.log(`🔍 Query 3: Near variation "${nearQuery}"`);
    const search3Results = await performSingleSearch(nearQuery, apiKey, onProgress);
    allPlaces = allPlaces.concat(search3Results);
    console.log(`✅ Query 3: ${search3Results.length} results (${allPlaces.length} total)`);
    
    // Search 4: Simple location search without prepositions
    await new Promise(resolve => setTimeout(resolve, 1000));
    const simpleQuery = `${keyword} ${location}`;
    console.log(`🔍 Query 4: Simple search "${simpleQuery}"`);
    const search4Results = await performSingleSearch(simpleQuery, apiKey, onProgress);
    allPlaces = allPlaces.concat(search4Results);
    console.log(`✅ Query 4: ${search4Results.length} results (${allPlaces.length} total)`);
    
    // Search 5: Add category variation if applicable
    if (category && category !== 'Custom' && category !== 'All') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const categoryQuery = `${keyword} ${category.toLowerCase()} ${location}`;
      console.log(`🔍 Query 5: Category variation "${categoryQuery}"`);
      const search5Results = await performSingleSearch(categoryQuery, apiKey, onProgress);
      allPlaces = allPlaces.concat(search5Results);
      console.log(`✅ Query 5: ${search5Results.length} results (${allPlaces.length} total)`);
    }
    
    console.log(`🎯 All queries completed. Collected ${allPlaces.length} total results before deduplication`);

    // Remove duplicates based on place name and address
    const uniquePlaces = allPlaces.filter((place, index, self) => {
      const placeIdentifier = `${place.displayName?.text}-${place.formattedAddress}`;
      return index === self.findIndex(p => 
        `${p.displayName?.text}-${p.formattedAddress}` === placeIdentifier
      );
    });

    const duplicatesRemoved = allPlaces.length - uniquePlaces.length;
    console.log(`🔄 Removed ${duplicatesRemoved} duplicates. Final unique results: ${uniquePlaces.length}`);

    // Return all collected unique places
    return { 
      places: uniquePlaces,
      note: uniquePlaces.length < 100 ? 
        'Google Places API has limitations and may not return all businesses. For comprehensive results, try searching smaller sub-areas.' : 
        undefined
    };

  } catch (error) {
    // Handle network errors or other exceptions
    console.error('Error searching businesses:', error);
    throw error;
  }
};

/**
 * Helper function to validate if the API response contains results
 * 
 * @param {Object} response - API response object
 * @returns {boolean} - True if response contains places
 */
export const hasResults = (response) => {
  return response && response.places && response.places.length > 0;
};

/**
 * Helper function to filter businesses that have phone numbers
 * 
 * @param {Array} places - Array of place objects
 * @returns {Array} - Filtered array containing only places with phone numbers
 */
export const filterByPhoneNumber = (places) => {
  return places.filter(place => place.nationalPhoneNumber && place.nationalPhoneNumber.trim() !== '');
};

/**
 * Helper function to filter places by exact address matching
 * Only returns businesses whose address contains the specific area name
 * 
 * @param {Array} places - Array of place objects
 * @param {string} areaName - The specific area/neighborhood name to match
 * @returns {Array} - Filtered array containing only places with matching address
 */
export const filterByAddress = (places, areaName) => {
  if (!areaName || areaName.trim() === '') {
    return places; // Return all if no area specified
  }

  const searchTerm = areaName.toLowerCase().trim();
  
  return places.filter(place => {
    const address = (place.formattedAddress || '').toLowerCase();
    // Check if the address contains the specific area name
    return address.includes(searchTerm);
  });
};
