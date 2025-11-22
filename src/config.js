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
 * Important Security Note:
 * For production applications:
 * 1. Never commit API keys to version control
 * 2. Use environment variables instead (e.g., import.meta.env.VITE_GOOGLE_API_KEY)
 * 3. Restrict the API key in Google Cloud Console to specific domains
 * 4. Consider implementing a backend proxy to hide the API key
 */
