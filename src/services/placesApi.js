/**
 * Google Places API Service
 * Handles communication with Google Places API (New) for searching businesses
 */

/**
 * Searches for businesses using Google Places API (New)
 * 
 * @param {string} keyword - The search keyword (e.g., "Kurti", "Electronics")
 * @param {string} category - The business category (e.g., "Wholesaler", "Retailer", "Custom")
 * @param {string} location - The location to search in (e.g., "Mumbai", "New York")
 * @param {string} apiKey - Google Places API key
 * @param {string} searchScope - Search area scope: 'wide', 'neighborhood', or 'specific'
 * @param {string} specificArea - Specific area/building/street name (optional)
 * @returns {Promise<Object>} - Returns the API response with places data
 */
export const searchBusinesses = async (keyword, category, location, apiKey, searchScope = 'wide', specificArea = '') => {
  // Google Places API (New) endpoint for text search
  const endpoint = 'https://places.googleapis.com/v1/places:searchText';
  
  // Construct the search query dynamically based on category and scope
  let textQuery;
  let maxResultCount = 20; // Default max results
  
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
    maxResultCount = 10; // Reduce results for specific searches to save costs
  } else if (searchScope === 'neighborhood' && specificArea.trim()) {
    // Neighborhood search with specific area: search in that exact neighborhood
    textQuery += ` in ${specificArea}, ${location}`;
    maxResultCount = 20; // Get more results to filter by address
  } else if (searchScope === 'neighborhood') {
    // Neighborhood search without specific area
    textQuery += ` near ${location}`;
    maxResultCount = 15; // Moderate result count
  } else {
    // Wide search: whole city
    textQuery += ` in ${location}`;
    maxResultCount = 20; // More results for wider searches
  }

  // Request body for the API call
  const requestBody = {
    textQuery: textQuery,
    maxResultCount: maxResultCount, // Limit results based on scope to control costs
    // You can add additional parameters here if needed:
    // languageCode: "en",
    // rankPreference: "DISTANCE" or "RELEVANCE"
  };

  try {
    // Make the POST request to Google Places API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // API Key authentication
        'X-Goog-Api-Key': apiKey,
        // Field mask specifies which fields to return in the response
        // This helps reduce response size and improve performance
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.businessStatus'
      },
      body: JSON.stringify(requestBody)
    });

    // Check if the response is successful
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `API Error: ${response.status} - ${errorData.error?.message || response.statusText}`
      );
    }

    // Parse and return the JSON response
    const data = await response.json();
    return data;

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
