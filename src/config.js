// ─────────────────────────────────────────────────────────────────────────────
// Lead Finder — Central Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
export const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export const GEMINI_CONFIG = {
  MODEL:                   'gemini-2.5-flash',   // Stable GA model — won't be deprecated without notice
  TEMPERATURE:             0.1,
  MAX_OUTPUT_TOKENS:       600,
  INTENT_CACHE_COLLECTION: 'keyword_intent_cache',
  USAGE_COLLECTION:        'gemini_usage',
  USAGE_DOC:               'current_month',
  WARN_AT_PERCENT:         0.80,
  BLOCK_AT_PERCENT:        0.97,
};

export const APP_NAME    = 'Lead Finder';
export const APP_VERSION = '2.0.0';

// ─── SKU-Based Credit System ──────────────────────────────────────────────────
// Google Places API (New) — India region, per key, per month:
//   Enterprise SKU (phone, website, ratings, reviews): 7,000 calls  ← BOTTLENECK
//   Pro SKU        (displayName):                     35,000 calls
//   Essentials SKU (address, id, types, location):    70,000 calls
//
// Current FIELD_MASK includes Enterprise fields → every call = Enterprise billing.
// 7,000 × 10 credits = 70,000 platform credits ÷ 25 users = 2,800 credits/user
//
// Searches per user on 2,800 credits:
//   City scope        (32 calls × 10) = 320 credits →  ~8 searches/month
//   Neighbourhood     (24 calls × 10) = 240 credits → ~11 searches/month
//   Specific          ( 9 calls × 10) =  90 credits → ~31 searches/month
export const CREDIT_CONFIG = {
  DEFAULT_USER_CREDITS:   2800,
  USER_ALERT_PCT:         80,

  CREDITS_PER_TIER: {
    essentials: 1,
    pro:        4,
    enterprise: 10,
  },

  SKU_FREE_CAPS: {
    essentials: 70000,
    pro:        35000,
    enterprise: 7000,
  },

  ADMIN_ALERT_PCT: 80,
  HARD_KILL_PCT:   95,

  SKU_KILL_SWITCH: {
    essentials: 66500,
    pro:        33250,
    enterprise:  6650,
  },
  SKU_ADMIN_ALERT: {
    essentials: 56000,
    pro:        28000,
    enterprise:  5600,
  },

  PLATFORM_CREDITS_POOL:  70000,
  PLATFORM_KILL_CREDITS:  66500,
  PLATFORM_ALERT_CREDITS: 56000,
};

// Backward-compat alias (admin components import CREDIT_PRICING)
export const CREDIT_PRICING = {
  PLATFORM_CAP_CREDITS:  CREDIT_CONFIG.PLATFORM_CREDITS_POOL,
  DEFAULT_USER_CREDITS:  CREDIT_CONFIG.DEFAULT_USER_CREDITS,
  SKU_FREE_CAPS:         CREDIT_CONFIG.SKU_FREE_CAPS,
  SKU_KILL_SWITCH:       CREDIT_CONFIG.SKU_KILL_SWITCH,
  CREDITS_PER_TIER:      CREDIT_CONFIG.CREDITS_PER_TIER,
};

export const CACHE_CONFIG = {
  TTL_HOURS:  24,
  COLLECTION: 'public_search_cache',
};
