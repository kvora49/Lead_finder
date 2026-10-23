// ─────────────────────────────────────────────────────────────────────────────
// Lead Finder — Central Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
export const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export const GEMINI_CONFIG = {
  MODEL:                   'gemini-2.5-flash',   // Stable GA model — won't be deprecated without notice
  TEMPERATURE:             0.1,
  MAX_OUTPUT_TOKENS:       3000,
  INTENT_CACHE_COLLECTION: 'keyword_intent_cache',
  USAGE_COLLECTION:        'gemini_usage',
  USAGE_DOC:               'current_month',
  WARN_AT_PERCENT:         0.80,
  BLOCK_AT_PERCENT:        0.97,
};

export const APP_NAME    = 'Lead Finder';
export const APP_VERSION = '2.0.0';

// ─── SKU-Based Credit System ──────────────────────────────────────────────────
// Google Maps Platform India free requests are per billing account and SKU/month.
// The current Text Search mask includes reviews, so it triggers Enterprise + Atmosphere.
// The enterprise bucket tracks this 7,000-request SKU separately in the dashboard.
//   Pro SKU        (displayName):                     35,000 calls
//   Essentials SKU (address, id, types, location):    70,000 calls
//
// Current FIELD_MASK includes Enterprise fields → every call = Enterprise billing.
// 7,000 × 10 credits; stop at 90% = 63,000 spendable enterprise-group credits.
// 25 users × 2,000 default credits = 50,000, leaving a 13,000-credit reserve.
//
// Maximum search costs after the search redesign: city 1,280, neighbourhood
// 720, specific 320 credits per keyword/location pair. Actual calls may be fewer.
export const CREDIT_CONFIG = {
  DEFAULT_USER_CREDITS:   2000,
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
  HARD_KILL_PCT:   90,

  SKU_KILL_SWITCH: {
    essentials: 63000,
    pro:        31500,
    enterprise:  6300,
  },
  SKU_ADMIN_ALERT: {
    essentials: 56000,
    pro:        28000,
    enterprise:  5600,
  },

  PLATFORM_CREDITS_POOL:  280000,
  PLATFORM_KILL_CREDITS:  252000,
  PLATFORM_ALERT_CREDITS: 224000,
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
