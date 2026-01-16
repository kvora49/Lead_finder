/**
 * Configuration file for API keys and application settings
 * 
 * WARNING: This API key should be restricted in Google Cloud Console
 * Recommended restrictions:
 * - Application restrictions: HTTP referrers (web sites)
 * - API restrictions: Places API (New)
 */

// Google Places API Key - Replace with your actual key
export const GOOGLE_API_KEY = "AIzaSyCZpJXsOsF7ewr6bWa-bsFgwoVVH13ZVcc";

/**
 * Credit Pricing Configuration
 * IMPORTANT: This is the single source of truth for cost calculations
 * Used by Dashboard, CreditAnalytics, and all billing displays
 */
export const CREDIT_PRICING = {
  // Cost per 1000 API requests (in USD)
  COST_PER_1000_REQUESTS: 32,
  
  // Cost per single request (calculated)
  get COST_PER_REQUEST() {
    return this.COST_PER_1000_REQUESTS / 1000;
  },
  
  // Free tier limits
  FREE_TIER_LIMIT: 200000, // 200k requests per month
  
  // Alert threshold (percentage of free tier)
  ALERT_THRESHOLD_PERCENT: 80, // Alert at 80% usage
  
  // Calculate cost from credits used
  calculateCost(creditsUsed) {
    return parseFloat((creditsUsed * this.COST_PER_REQUEST).toFixed(2));
  },
  
  // Format cost as currency
  formatCost(creditsUsed) {
    const cost = this.calculateCost(creditsUsed);
    return `$${cost.toFixed(2)}`;
  }
};

/**
 * Important Security Note:
 * For production applications:
 * 1. Never commit API keys to version control
 * 2. Use environment variables instead (e.g., import.meta.env.VITE_GOOGLE_API_KEY)
 * 3. Restrict the API key in Google Cloud Console to specific domains
 * 4. Consider implementing a backend proxy to hide the API key
 */
