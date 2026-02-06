/**
 * Places API Service - Sidecar Version
 * 
 * Connects to the Render.com-hosted scraper service instead of Firebase Cloud Functions
 * or Google Places API.
 * 
 * Updated for: Sidecar Scraper Architecture (Phase 3)
 */

import { auth } from '../firebase';

// ========================================
// CONFIGURATION
// ========================================

// Sidecar API Configuration
const SIDECAR_API_URL = import.meta.env.VITE_SIDECAR_API_URL || 'http://localhost:3001';
const SIDECAR_SECRET_KEY = import.meta.env.VITE_SIDECAR_SECRET_KEY || 'your-super-secret-key-change-this-12345';

/**
 * Call Sidecar Scraper API
 * 
 * @param {string} keyword - Search keyword
 * @param {string} location - Search location
 * @param {boolean} forceRefresh - Force new scrape (ignore cache)
 * @returns {Promise<Array>} Business results
 */
async function callSidecarAPI(keyword, location, forceRefresh = false) {
  try {
    const user = auth.currentUser;
    const userId = user?.uid || 'anonymous';
    
    console.log(`🔍 Calling Sidecar API: "${keyword}" in "${location}"`);
    
    const response = await fetch(`${SIDECAR_API_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': SIDECAR_SECRET_KEY
      },
      body: JSON.stringify({
        keyword,
        location,
        userId,
        forceRefresh
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Scraping failed');
    }
    
    const data = await response.json();
    
    console.log(`✅ Sidecar API response: ${data.count} results (cached: ${data.cached})`);
    
    return {
      results: data.results || [],
      cached: data.cached || false,
      count: data.count || 0,
      duration: data.duration || 'N/A'
    };
    
  } catch (error) {
    console.error('❌ Sidecar API error:', error);
    throw error;
  }
}

/**
 * Main Search Function
 * 
 * @param {string} keyword - Search keyword (e.g., "restaurants")
 * @param {string} location - Location string (e.g., "Mumbai")
 * @param {Function} onProgress - Progress callback (optional)
 * @returns {Promise<Object>} { results, totalResults, cached }
 */
export async function searchBusinesses(keyword, location, onProgress = null) {
  try {
    if (onProgress) {
      onProgress('Connecting to scraper...');
    }
    
    // Call Sidecar API
    const { results, cached, count, duration } = await callSidecarAPI(keyword, location);
    
    if (onProgress) {
      onProgress(cached ? 'Loading from cache...' : 'Scraping Google Maps...');
    }
    
    // Add small delay for UX (show progress message)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (onProgress) {
      onProgress(`Found ${count} businesses`);
    }
    
    return {
      results,
      totalResults: count,
      cached,
      duration,
      cost: 0.00 // FREE!
    };
    
  } catch (error) {
    console.error('Search error:', error);
    throw new Error(error.message || 'Search failed');
  }
}

/**
 * Filter results by phone number availability
 * 
 * @param {Array} results - Business results
 * @returns {Array} Filtered results
 */
export function filterByPhoneNumber(results) {
  return results.filter(business => 
    business.nationalPhoneNumber && 
    business.nationalPhoneNumber.trim() !== ''
  );
}

/**
 * Filter results by address availability
 * 
 * @param {Array} results - Business results
 * @returns {Array} Filtered results
 */
export function filterByAddress(results) {
  return results.filter(business => 
    business.formattedAddress && 
    business.formattedAddress.trim() !== '' &&
    business.formattedAddress !== 'Address not available'
  );
}

/**
 * Deduplicate results by phone number or name
 * 
 * @param {Array} results - Business results
 * @param {string} by - Dedupe by 'phone' or 'name'
 * @returns {Array} Deduplicated results
 */
export function deduplicateResults(results, by = 'phone') {
  const seen = new Set();
  const deduplicated = [];
  
  for (const business of results) {
    let key;
    
    if (by === 'phone') {
      key = business.nationalPhoneNumber?.replace(/\D/g, ''); // Remove non-digits
      if (!key) continue; // Skip if no phone
    } else {
      key = business.displayName?.text?.toLowerCase().trim();
      if (!key) continue; // Skip if no name
    }
    
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(business);
    }
  }
  
  return deduplicated;
}

/**
 * Get results from cache (if available)
 * This checks the Firestore cache directly
 */
export async function getCachedResults(keyword, location) {
  try {
    // Call Sidecar API without forcing refresh
    // It will return cached results if available
    const { results, cached } = await callSidecarAPI(keyword, location, false);
    
    if (cached) {
      return results;
    }
    
    return null;
  } catch (error) {
    console.error('Cache check error:', error);
    return null;
  }
}

/**
 * Force a fresh scrape (ignore cache)
 */
export async function forceRefresh(keyword, location, onProgress = null) {
  try {
    if (onProgress) {
      onProgress('Starting fresh scrape...');
    }
    
    const { results, count, duration } = await callSidecarAPI(keyword, location, true);
    
    if (onProgress) {
      onProgress(`Scraped ${count} fresh results`);
    }
    
    return {
      results,
      totalResults: count,
      cached: false,
      duration,
      cost: 0.00
    };
    
  } catch (error) {
    console.error('Force refresh error:', error);
    throw error;
  }
}

/**
 * Check Sidecar service health
 */
export async function checkServiceHealth() {
  try {
    const response = await fetch(`${SIDECAR_API_URL}/health`);
    
    if (!response.ok) {
      return { status: 'unhealthy', error: 'Service not responding' };
    }
    
    const data = await response.json();
    return { status: 'healthy', ...data };
    
  } catch (error) {
    return { status: 'unreachable', error: error.message };
  }
}

// Export configuration for debugging
export const config = {
  apiUrl: SIDECAR_API_URL,
  hasSecretKey: !!SIDECAR_SECRET_KEY,
  version: '3.0.0-sidecar'
};
