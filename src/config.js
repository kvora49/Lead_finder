// ─────────────────────────────────────────────────────────────────────────────
// Lead Finder — Central Configuration
// Restrict GOOGLE_API_KEY in Google Cloud Console to your deployment domain.
// ─────────────────────────────────────────────────────────────────────────────

// Google Places API key (Nearby Search, Geocoding, Places Autocomplete)
export const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

// App metadata
export const APP_NAME    = 'Lead Finder';
export const APP_VERSION = '2.0.0';

// ─── Credit / Cost System ────────────────────────────────────────────────────
// Google Places Nearby Search = $0.032 per request
// Google gives $200 free credit / month  →  6,250 free searches
// Each "search" in our app may trigger multiple Nearby Search requests
// (one per grid cell). Phase 3 will wire these constants into credit deductions.
export const CREDIT_CONFIG = {
  DEFAULT_CREDITS:         100,     // Credits given to every new user on sign-up
  COST_PER_REQUEST_USD:    0.032,   // Google's per-call price
  FREE_TIER_USD:           200,     // Monthly free budget from Google
  get FREE_REQUESTS_PER_MONTH() {
    return Math.floor(this.FREE_TIER_USD / this.COST_PER_REQUEST_USD); // 6 250
  },
  WARN_AT_PERCENT:         80,      // Show warning banner when 80% consumed
  BLOCK_AT_PERCENT:        97,      // Soft-block at 97% to avoid overage
};

// ─── Search Cache ─────────────────────────────────────────────────────────────
// Before hitting Google, we check Firestore for a recent identical query.
// A cached result is served free of charge and counts as 0 API calls.
export const CACHE_CONFIG = {
  TTL_HOURS:   24,                   // How long a cached result is considered fresh
  COLLECTION:  'public_search_cache', // Firestore collection name
};

// ─── Admin / Analytics alias ─────────────────────────────────────────────────
// Some admin components reference CREDIT_PRICING — map to CREDIT_CONFIG.
export const CREDIT_PRICING = {
  COST_PER_REQUEST:    CREDIT_CONFIG.COST_PER_REQUEST_USD,
  FREE_TIER_USD:       CREDIT_CONFIG.FREE_TIER_USD,
  DEFAULT_CREDITS:     CREDIT_CONFIG.DEFAULT_CREDITS,
};
