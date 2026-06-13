/**
 * Lead Finder — Places API Service  (v7 — AI Intent Engine Edition)
 *
 * PURPOSE: Universal business search engine. User types a keyword and selects
 * a business type filter. The engine finds every relevant place.
 *
 * API CALL BUDGET (exact — never changes):
 *   city:          4×4 = 16 cells × 2 variants × 1 page  = 32 calls exact
 *   neighbourhood: 4×3 = 12 cells × 2 variants × 1 page  = 24 calls exact
 *   specific:      1×1 =  1 cell  × 3 variants × ≤3 pages = ≤9 calls
 *
 * GRID STRATEGY:
 *   Geocode location → get viewport bounding box → split into NxM grid cells
 *   → search each cell independently with a rectangle restriction
 *   → deduplicate results by place.id across all cells
 *   This bypasses Google Places API's 20-results-per-query limit.
 *
 * RELEVANCE FILTER (whitelist-based, type-aware):
 *   Product searches (Store/Any/Manufacturer/Wholesaler):
 *     → WHITELIST approach: keep only places with product-selling types
 *     → Completely eliminates restaurants, banks, temples etc.
 *     → Food keywords auto-detected and routed to food-type search
 *   Service searches (Restaurant/Hospital/Bank/etc.):
 *     → Google's includedType restriction does the filtering at API level
 *
 * GEO FENCE (two-layer):
 *   Layer 1: geo.bounds bbox filter (tight admin boundary)
 *   Layer 2: Address-string verification — formattedAddress must contain area name
 *   Prevents Maninagar results including Isanpur, Saraspur, Gomtipur.
 *
 * CACHE: Firestore public_search_cache, TTL 24h, 0 API calls on cache hit.
 */

import { db } from '../firebase';
import {
  doc, getDoc, setDoc, serverTimestamp, increment,
} from 'firebase/firestore';
import { GOOGLE_API_KEY, GEMINI_API_KEY, GEMINI_CONFIG, CACHE_CONFIG } from '../config';

// Gate all debug logs behind DEV flag — zero console output in production builds
const log  = import.meta.env.DEV ? console.log.bind(console)  : () => {};
const warn = import.meta.env.DEV ? console.warn.bind(console) : () => {};

const makeAbortError = (message = 'Search cancelled') => {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
};

const isAbortError = (err) => err?.name === 'AbortError';

const throwIfAborted = (signal) => {
  if (signal?.aborted) throw makeAbortError();
};

const delay = (ms, signal) => new Promise((resolve, reject) => {
  if (!signal) {
    setTimeout(resolve, ms);
    return;
  }

  if (signal.aborted) {
    reject(makeAbortError());
    return;
  }

  const timer = setTimeout(() => {
    signal.removeEventListener('abort', onAbort);
    resolve();
  }, ms);

  const onAbort = () => {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    reject(makeAbortError());
  };

  signal.addEventListener('abort', onAbort);
});

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Geocoding REST API — CORS-enabled in the browser
const GEO_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';

// New Places API v1 — POST endpoint, CORS-enabled
// (The old /maps/api/place/* REST endpoints do NOT support browser fetch.)
const PLACES_V1_TEXT = 'https://places.googleapis.com/v1/places:searchText';

// Field mask — controls which fields & billing tiers are used
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.types',
  'places.location',
  'places.reviews',
].join(',');

// ── Grid dimensions per searchScope ──────────────────────────────────────────
// The ONLY variable that reliably increases unique yield is geographic cell
// count.  Each cell covers a different physical zone of the city so Google
// returns different top-20 businesses.  More variants on the same cell
// returns the same businesses (deduplicated → wasted calls).
//
// pagesPerCell = 1 for city locks the call count to exactly n_cells.
// Neighbourhood uses 1 page (smaller area, cells do breadth work).
// ── Double-Lock Viewport Architecture ───────────────────────────────────────
// Lock 1 (Geo):  locationRestriction.rectangle = geocoder viewport grid cell.
//                Viewport is the exact bounding box Google keeps for each
//                named place — never a radius, never padded.
// Lock 2 (NLP):  Every textQuery ends with "in [location]".
//                Google's NLP sees an address in an adjacent locality and
//                ranks it below Maninagar results → bleed eliminated.
//
// Grid budgets (exact for city — no paging variability):
//   city:          4×4 = 16 cells × 2 variants × 1 page = 32 calls
//   neighbourhood: 4×3 = 12 cells × 2 variants × 1 page = 24 calls
//   specific:      1×1 =  1 cell  × 3 variants × ≤3 pages = ≤9 calls
const GRID_CONFIG = {
  city:          { cols: 4, rows: 4, pagesPerCell: 1 }, // 16 cells
  neighbourhood: { cols: 3, rows: 3, pagesPerCell: 1 }, //  9 cells
  specific:      { cols: 2, rows: 2, pagesPerCell: 2 }, //  4 cells × 2 pages = 8 page-calls per query
};

// Global fallback (should not be needed — all scopes are in GRID_CONFIG).
const PAGES_PER_CELL_DEFAULT = 3;

// 400 ms stagger between EVERY single Places API call to prevent 429.
const CALL_STAGGER_MS = 400;

// ── Per-type search configuration ────────────────────────────────────────────
// Each business type gets:
//   variants(kw)  → array of text query strings for the matrix sweep.
//                   Different types surface different index partitions.
//   includedType  → if set, sent as `includedType` in the Places API body,
//                   making Google restrict results to that category at source.
//                   null for types with no direct Google Places type (M/W).
//
// KEY DESIGN: Query variants are TYPE-AWARE. Product searches use
// selling-intent suffixes ("shop", "store", "dealer"). Service searches
// use the keyword as a specialisation ("italian restaurant").
// This eliminates bias toward any single keyword.
// ── includedType map ─────────────────────────────────────────────────────────
// Controls the `includedType` field sent to the Places API to restrict
// results to a native Google Places category at the source level.
// null = no restriction (any-type, manufacturer, wholesaler).
const INCLUDED_TYPE_MAP = {
  '':                   null,
  'store':              'store',
  'restaurant':         'restaurant',
  'lodging':            'lodging',
  'hospital':           'hospital',
  'school':             'school',
  'gym':                'gym',
  'bank':               'bank',
  'real_estate_agency': 'real_estate_agency',
  'manufacturer':       null,
  'wholesaler':         null,
};

// ── Food / service keyword detection ─────────────────────────────────────────
// When type is '' (Any type) and the keyword is food-related, we should NOT
// apply the product-seller whitelist — we should show restaurants/cafes/etc.
// This prevents "pizza" or "biryani" searches from returning zero results
// because restaurants get filtered out by the product-seller whitelist.
const FOOD_KEYWORDS = /\b(food|restaurant|cafe|bakery|sweet|mithai|pizza|burger|biryani|thali|dosa|idli|paratha|naan|roti|tandoori|momos|chaat|pav\s*bhaji|samosa|paneer|dal|curry|cake|pastry|chocolate|ice\s*cream|juice|tea|coffee|snack|fast\s*food|dhaba|tiffin|catering|canteen|mess|kitchen|eat|dine|dinner|lunch|breakfast|brunch|meal|cuisine)\b/i;

// Service keywords that should NOT be filtered as product searches
const SERVICE_KEYWORDS = /\b(hotel|lodge|guest\s*house|hostel|resort|hospital|clinic|doctor|dentist|pharmacy|chemist|pathology|diagnostic|medicine|medical|drug\s*store|pharma|school|college|university|coaching|tuition|training|gym|fitness|yoga|spa|salon|bank|finance|loan|insurance|real\s*estate|property|broker|builder|rent|pg|paying\s*guest)\b/i;

const AREA_TOKEN_STOPWORDS = new Set([
  'road', 'rd', 'street', 'st', 'lane', 'ln', 'nagar', 'area', 'market',
  'society', 'colony', 'phase', 'sector', 'block', 'circle', 'chowk', 'cross',
  'main', 'near', 'opp', 'opposite', 'city', 'district',
]);

const normalizeForMatch = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const includesNormalized = (haystack, needle) => {
  const h = normalizeForMatch(haystack);
  const n = normalizeForMatch(needle);
  return !!n && h.includes(n);
};

const getAreaTokens = (areaValue) => String(areaValue || '')
  .toLowerCase()
  .split(/[^a-z0-9]+/)
  .map((t) => t.trim())
  .filter((t) => t.length >= 4 && !AREA_TOKEN_STOPWORDS.has(t));

const addressMatchesLocation = (address, city, area) => {
  const addr = String(address || '');
  const cityOk = city ? includesNormalized(addr, city) : true;
  if (!cityOk) return false;

  if (!area) return true;
  if (includesNormalized(addr, area)) return true;

  const areaTokens = getAreaTokens(area);
  if (!areaTokens.length) return false;

  const normalizedAddr = normalizeForMatch(addr);
  return areaTokens.some((token) => normalizedAddr.includes(token));
};

// ── Type suffixes for product-intent queries ─────────────────────────────────
// Maps each filter type to the query suffixes that express seller-intent.
// These are appended to the keyword to guide Google toward the right results.
const TYPE_QUERY_SUFFIXES = {
  '':            ['shop', 'store'],                    // Any type → generic seller intent
  'store':       ['shop', 'store'],                    // Store → retail seller intent
  'manufacturer':['manufacturer', 'factory'],          // Manufacturer → production intent
  'wholesaler':  ['wholesaler', 'distributor'],        // Wholesaler → bulk intent
  'restaurant':  ['restaurant', 'food'],               // Restaurant → food intent
  'lodging':     ['hotel', 'lodge'],                   // Hotel → accommodation intent
  'hospital':    ['hospital', 'clinic'],               // Hospital → medical intent
  'school':      ['school', 'college'],                // School → education intent
  'gym':         ['gym', 'fitness'],                   // Gym → fitness intent
  'bank':        ['bank', 'finance'],                  // Bank → finance intent
  'real_estate_agency': ['real estate', 'property'],   // Real estate → property intent
};

/**
 * Build NLP-locked query variants for a given search.
 *
 * Lock 2: every variant ends with "in [location]".
 * Google's ranking then biases toward businesses actually IN that location.
 *
 * TYPE-AWARE DESIGN:
 *   Product types → selling-intent suffixes ("shop", "store", "dealer")
 *   Service types → category suffixes ("restaurant", "hospital")
 *   Never sends bare keyword alone — always has intent context.
 *
 * Variant count per scope:
 *   city/neighbourhood: 2 variants — cells do the yield work
 *   specific:           3 variants — maximum depth on single point
 *
 * @param {string} keyword      — e.g. "ball"
 * @param {string} location     — the geocoded location string
 * @param {string} searchScope  — 'city' | 'neighbourhood' | 'specific'
 * @param {string} type         — business type key (from INCLUDED_TYPE_MAP)
 * @returns {string[]} array of textQuery strings
 */
const buildQueries = (keyword, location, searchScope, type) => {
  const kw  = keyword.trim();
  const loc = location.trim();
  const kwLower = kw.toLowerCase();

  // For "Any type" with food keywords, route to food-intent queries
  const isFoodKw    = FOOD_KEYWORDS.test(kwLower);
  const isServiceKw = SERVICE_KEYWORDS.test(kwLower);

  let suffixes;
  if (type === '' && isFoodKw) {
    // Food keyword + Any type → use restaurant/food suffixes
    suffixes = ['restaurant', 'food'];
  } else if (type === '' && isServiceKw) {
    // Service keyword + Any type → use keyword as-is (it IS the category)
    suffixes = ['', 'near me'];
  } else {
    suffixes = TYPE_QUERY_SUFFIXES[type] || ['shop', 'store'];
  }

  // Build query variants: "{keyword} {suffix} in {location}"
  // The suffix provides seller/category intent so Google understands
  // we want businesses that DEAL IN the keyword, not just mention it.
  const all = suffixes.map(suffix =>
    suffix ? `${kw} ${suffix} in ${loc}` : `${kw} in ${loc}`
  );

  // For specific scope, add a third variant for extra depth
  if (searchScope === 'specific' && all.length < 3) {
    if (type === '' || type === 'store') {
      all.push(`${kw} dealer in ${loc}`);
    } else if (type === 'manufacturer') {
      all.push(`${kw} production in ${loc}`);
    } else if (type === 'wholesaler') {
      all.push(`${kw} wholesale market in ${loc}`);
    } else {
      all.push(`${kw} in ${loc}`);
    }
  }

  // City/Neighbourhood: 2 variants (cells do the yield work).
  // Specific: all variants (up to 3) for maximum depth.
  return searchScope === 'specific' ? all : all.slice(0, 2);
};

// ── GENERIC: types that carry zero category information.
// These are ignored when determining what kind of place it is.
// CRITICAL: 'store' is treated as generic because Google tags nearly EVERY
// business as 'store'. If we treated it as specific, the whitelist would
// pass everything through — defeating the entire filter.
const GENERIC_PLACE_TYPES = new Set([
  'point_of_interest',
  'establishment',
  'store',             // Almost every business is tagged 'store' — treat as generic
]);

// ── PRODUCT SELLER WHITELIST ─────────────────────────────────────────────────
// DESIGN PRINCIPLE (WHITELIST, not blacklist):
// For product searches, a place is KEPT only if it has ≥1 type in this set.
// This is far more accurate than a blacklist because it ONLY passes places
// that are categorically capable of selling products — any new unknown type
// from Google is excluded by default (safe), whereas a blacklist would let
// unknown types through (unsafe).
//
// This set covers all Google Places types that represent businesses which
// sell, manufacture, distribute, or deal in physical products.
const PRODUCT_SELLER_TYPES = new Set([
  // ── Multi-product retail (sell diverse goods → relevant for any keyword) ──
  'shopping_mall', 'supermarket', 'department_store',
  'convenience_store', 'wholesale_store', 'warehouse_store',
  'grocery_or_supermarket', 'market',

  // ── Specialised retail (Google returns these when they match the keyword) ──
  'clothing_store', 'electronics_store', 'hardware_store',
  'book_store', 'toy_store', 'sporting_goods_store',
  'home_goods_store', 'furniture_store', 'shoe_store',
  'pet_store', 'bicycle_store', 'auto_parts_store',
  'car_dealer', 'gift_shop', 'stationery_store',
  'mobile_phone_store', 'computer_store',

  // ── Florist / garden / home improvement ──
  'florist', 'home_improvement_store', 'garden_center',

  // ── Liquor / wine ──
  'liquor_store', 'wine_store',

  // NOTE: 'store' is intentionally EXCLUDED — treated as generic (see above).
  // NOTE: 'pharmacy', 'drugstore', 'gas_station' excluded — niche sellers.
  //       Pharmacies still appear for 'medicine'/'medical' via SERVICE_KEYWORDS.
]);

// ── FOOD/DRINK TYPES ─────────────────────────────────────────────────────────
// Used when the search is food-related (keyword or type = restaurant).
// These types are KEPT for food searches and EXCLUDED for product searches.
const FOOD_DRINK_TYPES = new Set([
  'restaurant', 'cafe', 'bar', 'food', 'bakery', 'meal_delivery',
  'meal_takeaway', 'fast_food_restaurant', 'ice_cream_shop',
  'coffee_shop', 'night_club', 'caterer',
]);

// ── SERVICE CATEGORY TYPES ───────────────────────────────────────────────────
// Maps each service filter type to the Google Place types that are relevant.
// Used for service searches where includedType at API level may not be enough.
const SERVICE_TYPE_WHITELIST = {
  'restaurant': FOOD_DRINK_TYPES,
  'lodging':    new Set(['lodging', 'hotel', 'motel', 'guest_house', 'hostel', 'resort']),
  'hospital':   new Set(['hospital', 'doctor', 'dentist', 'physiotherapist', 'veterinary_care', 'pharmacy', 'drugstore', 'health']),
  'school':     new Set(['school', 'university', 'library', 'primary_school', 'secondary_school']),
  'gym':        new Set(['gym', 'fitness_center', 'stadium', 'sports_club', 'yoga_studio']),
  'bank':       new Set(['bank', 'atm', 'accounting', 'insurance_agency', 'finance']),
  'real_estate_agency': new Set(['real_estate_agency', 'real_estate_agent']),
};

// ── JEWELLERY KEYWORDS — used for jewelry_store handling ─────────────────────
const JEWELLERY_KEYWORDS = /\b(watch|ring|chain|necklace|bracelet|bangle|earring|gold|silver|diamond|jewel|jewellery|jewelry|pendant|locket|bead|haar|kangan|mangalsutra|payal|anklet)\b/i;

// ─────────────────────────────────────────────────────────────────────────────
// INTENT ENGINE (Gemini 2.5 Flash-Lite)
// ─────────────────────────────────────────────────────────────────────────────
// Called ONCE per unique keyword ever. Result cached permanently in Firestore.
// Returns AI-generated search_queries, exclude_name_words, anti_stock_keywords,
// review_keywords, synonyms, store_name_keywords, is_food, is_service.

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Fallback intent when Gemini is unavailable or rate-limited */
const _fallbackIntent = (keyword) => {
  const kw = keyword.toLowerCase().trim();
  return {
    type_queries: {
      retailer:     [`${kw} shop`, `${kw} store`],
      wholesaler:   [`${kw} wholesale`, `${kw} thok`],
      manufacturer: [`${kw} manufacturer`, `${kw} factory`],
      distributor:  [`${kw} distributor`, `${kw} supplier`],
    },
    store_name_keywords: [kw],
    review_keywords:     [kw],
    synonyms:            [],
    indian_synonyms:     [],
    category_keywords:   [],
    exclude_name_words:  [],
    anti_stock_keywords: [],
    is_food:  FOOD_KEYWORDS.test(kw),
    is_service: SERVICE_KEYWORDS.test(kw),
    is_ambiguous:    false,
    primary_meaning: kw,
  };
};

/** Make Firestore-safe cache key for intent */
const _intentCacheKey = (keyword) => {
  const encoded = encodeURIComponent(keyword.toLowerCase().trim());
  return btoa(unescape(encoded)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 60);
};

/**
 * Get keyword intent — checks permanent Firestore cache first, then calls Gemini.
 * Returns structured intent object for any product keyword.
 */
const getKeywordIntent = async (keyword, options = {}) => {
  const { signal } = options;
  throwIfAborted(signal);
  const kw = keyword.toLowerCase().trim();
  const cacheKey = _intentCacheKey(kw);

  // ── 1. Check permanent intent cache ────────────────────────────────────────
  const CURRENT_INTENT_SCHEMA = 6;   // bump when Gemini prompt schema changes — v6: category_keywords and indian_synonyms
  try {
    const cacheRef = doc(db, GEMINI_CONFIG.INTENT_CACHE_COLLECTION, cacheKey);
    const cacheSnap = await getDoc(cacheRef);
    if (cacheSnap.exists()) {
      const cached = cacheSnap.data();
      if ((cached.schemaVersion || 0) < CURRENT_INTENT_SCHEMA) {
        log('[intent] cache schema outdated — re-fetching:', kw);
        // Fall through to Gemini call (don't return cached)
      } else {
        log('[intent] cache HIT →', kw, cached);
        return cached.intent || cached;
      }
    }
  } catch (err) {
    warn('[intent] cache read error:', err.message);
  }

  // ── 2. Rate limit check ────────────────────────────────────────────────────
  if (!GEMINI_API_KEY) {
    warn('[intent] No GEMINI_API_KEY — using fallback');
    return _fallbackIntent(kw);
  }

  try {
    const usageRef = doc(db, GEMINI_CONFIG.USAGE_COLLECTION, GEMINI_CONFIG.USAGE_DOC);
    const usageSnap = await getDoc(usageRef);
    const usage = usageSnap.exists() ? usageSnap.data() : { calls_made: 0, calls_limit: 1000 };
    const pct = usage.calls_made / (usage.calls_limit || 1000);

    if (pct >= GEMINI_CONFIG.BLOCK_AT_PERCENT) {
      warn('[intent] HARD LIMIT reached — using fallback (no Gemini call)');
      return _fallbackIntent(kw);
    }

    if (pct >= GEMINI_CONFIG.WARN_AT_PERCENT && !usage.warned) {
      await setDoc(usageRef, { warned: true }, { merge: true });
      log('[intent] Usage at', (pct * 100).toFixed(0) + '% — warning flag set');
    }
  } catch (err) {
    warn('[intent] usage check error (proceeding):', err.message);
  }

  // ── 3. Call Gemini ─────────────────────────────────────────────────────────
  const prompt = `You are a product-to-shop classifier for Indian local business search.

Given the keyword "${kw}", return a JSON object with these fields:

- type_queries: object with exactly 4 keys. Each key is an array of 4-6 India-specific Google Maps search phrases SPECIFIC to that business role for the keyword "${kw}".

  Keys and their meaning:
  "retailer"     → shops, stores, showrooms, outlets that sell this product to end customers
  "wholesaler"   → bulk markets, wholesale dealers, thok bazaar, bulk suppliers
  "manufacturer" → factories, production units, udyog, industries that MAKE this product
  "distributor"  → distributors, stockists, authorised agents, C&F agents, sole agents

  Example for "bat":
  {
    "retailer":     ["cricket bat shop", "sports goods store", "bat retail outlet", "cricket equipment shop"],
    "wholesaler":   ["cricket bat wholesale", "sports goods wholesale market", "bat bulk supplier", "cricket equipment thok"],
    "manufacturer": ["cricket bat manufacturer", "bat factory", "cricket bat udyog", "sports goods manufacturer"],
    "distributor":  ["cricket bat distributor", "sports equipment stockist", "bat authorised dealer", "cricket goods agent"]
  }

  Example for "kurti":
  {
    "retailer":     ["kurti shop", "ladies ethnic wear store", "kurti boutique", "ethnic fashion outlet"],
    "wholesaler":   ["kurti wholesale", "ethnic wear wholesale market", "kurti thok", "ladies garment wholesale"],
    "manufacturer": ["kurti manufacturer", "ladies garment factory", "ethnic wear production unit", "kurti udyog"],
    "distributor":  ["kurti distributor", "ethnic wear stockist", "ladies garment agent", "kurti supplier"]
  }

  Rules:
  - Each array must have exactly 4-6 items
  - Phrases must be specific to the product + role combination
  - Include Indian variants: "thok", "bhandar", "udyog", "mart", "house"
  - Do NOT include broad generic phrases like "shop ahmedabad" without the product name
  - All 4 keys must always be present, even if you have to approximate for unusual keywords

- review_keywords: array of words customers write in Google reviews when they bought this product. For "kurti" → ["kurti", "kurta", "ethnic wear"]. For "bat" → ["bat", "cricket bat", "sports"].

- store_name_keywords: array of SPECIFIC phrases likely in the NAME of shops that actually SELL this product.
  CRITICAL RULE: These must be SPECIFIC to this product — words that would ONLY appear in a shop name if it actually sells this product. Do NOT include broad single-word categories.
  BAD example for "ball"  → ["sports", "games"] (too broad — matches Sports Cafe, Sports Club, Sports Academy)
  GOOD example for "ball" → ["cricket ball", "sports goods", "sporting goods", "sports equipment"]
  BAD example for "bat"   → ["sports", "cricket"] (too broad — matches Cricket Club, Cricket Academy)
  GOOD example for "bat"  → ["cricket bat", "sports goods", "sports equipment", "bat and ball"]
  BAD example for "kurti" → ["fashion", "ladies"] (too broad — matches Fashion Photography, Ladies Salon)
  GOOD example for "kurti" → ["ladies wear", "ethnic wear", "kurti house", "garment shop"]
  Provide 4-6 specific multi-word phrases.

- category_keywords: array of 6-10 words/phrases that describe the TYPE OF SHOP that sells "${kw}" in India. These are the words that appear in Indian shop NAMES even when the product name itself does not appear.

  The category_keywords should answer: "What kind of shop sells this product in India?"

  Examples:
  "chair" → the shops are called furniture stores, interior shops, home furnishing shops
    category_keywords: ["furniture", "interior", "furnishing", "home decor", "office furniture", "sofa", "wooden furniture", "modular furniture"]

  "curtains" → the shops are called handloom, parda, window decor, home furnishing
    category_keywords: ["handloom", "parda", "furnishing", "window decor", "drapes", "home decor", "curtain", "blinds", "textile"]

  "cement" → the shops are called building material, hardware, construction material
    category_keywords: ["building material", "hardware", "construction", "cement dealer", "sanitary", "tiles", "plumbing"]

  "paint" → the shops are called paint house, colour point, hardware
    category_keywords: ["paint", "colour", "hardware", "asian paints", "berger", "nerolac", "wall care", "decorative"]

  "bat" → the shops actually use the product name — use ["sports goods", "cricket", "sports equipment"]
  (When the product name DOES appear in shop names, category_keywords can overlap with store_name_keywords)

  CRITICAL:
  - Include BOTH English AND common Indian/Hindi/Gujarati terms for the shop type
  - Include brand names that appear in shop names (Asian Paints, Berger, etc.) when relevant
  - Include 6-10 items, not just 2-3
  - These are for NAME matching only — they can be single words unlike store_name_keywords

- synonyms: alternate Indian names for this product. For "kurti" → ["kurta", "kurtee"]. For "cement" → ["concrete", "mortar"].

- indian_synonyms: array of Hindi/Gujarati/regional language words for "${kw}" that commonly appear in Indian shop names and reviews.

  Examples:
  "curtains" → ["parda", "pardah", "drapes"]
  "chair" → ["kursi", "khursi"]
  "sofa" → ["sofa", "settee", "divan"]
  "carpet" → ["carpet", "dari", "gaddi", "kaleen"]
  "paint" → ["rang", "colour"]
  "pillow" → ["takiya", "gaddi"]
  "shirt" → ["shirt", "kameez"]

  Include these in addition to the existing "synonyms" field.
  These will be used as name-matching words alongside the product keyword.

- exclude_name_words: 8-12 words in business names that DISQUALIFY them. Must include BOTH types:
  (a) FALSE COGNATES — other products or businesses sharing the same word but in a completely different industry.
      For "ball" → ["bearing", "valve", "bowling", "billiard", "ballroom"]
      For "bat"  → ["batman", "batting cage", "cricket club", "cricket academy"]
      For "pipe" → ["bagpipe", "pipe dream", "pipeline"]
      For "ring" → ["boxing ring", "wrestling", "ringroad"]
  (b) UNRELATED categories — motor, car, computer, hospital, school, salon, gym, cafe, restaurant, club, academy, coaching, etc.
  Provide 8-12 words total.

- anti_stock_keywords: words meaning the shop sells something DIFFERENT within same broad category. For "kurti" → ["jeans", "denim", "raymond", "suit", "nike", "adidas", "shoe", "footwear"]. For "bat" → ["shoe", "jewellery", "furniture"].

- is_food: boolean, true ONLY if "${kw}" is a food/beverage item (biryani, pizza, cake, juice, etc.)

- is_service: boolean, true ONLY if "${kw}" is a service (plumber, carpenter, AC repair, gym, salon, etc.)

- is_ambiguous: boolean, true if "${kw}" could refer to completely different products in different industries. For "ball" → true (sports ball vs ball bearing). For "pipe" → true (plumbing pipe vs smoking pipe vs bagpipe). For "ring" → true (jewellery vs boxing ring). For "kurti" → false (only one meaning). For "cement" → false.

- primary_meaning: string, the most common product meaning of "${kw}" for Indian retail context. For "ball" → "sports ball". For "pipe" → "plumbing pipe". For "ring" → "finger ring / jewellery ring". Only required when is_ambiguous is true.

Return ONLY valid JSON. No markdown, no explanation, no code fences.`;

  const url = `${GEMINI_API_BASE}/${GEMINI_CONFIG.MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: GEMINI_CONFIG.TEMPERATURE,
      maxOutputTokens: GEMINI_CONFIG.MAX_OUTPUT_TOKENS,
    },
  };

  let intent = null;
  const maxRetries = 3;
  const baseDelay = 2000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      throwIfAborted(signal);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });

      if (res.status === 429) {
        const waitMs = baseDelay * Math.pow(2, attempt);
        warn(`[intent] 429 rate limit — retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
        await delay(waitMs, signal);
        continue;
      }

      if (!res.ok) {
        warn(`[intent] Gemini API error ${res.status}`);
        break;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      // Strip markdown code fences if present
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      intent = JSON.parse(cleaned);
      break;
    } catch (err) {
      if (isAbortError(err)) throw err;
      warn(`[intent] Gemini call error (attempt ${attempt + 1}):`, err.message);
      if (attempt === maxRetries - 1) break;
      await delay(baseDelay * Math.pow(2, attempt), signal);
    }
  }

  if (!intent) {
    warn('[intent] All retries failed — using fallback');
    return _fallbackIntent(kw);
  }

  // ── 4. Validate & normalize ────────────────────────────────────────────────
  if (typeof intent.type_queries !== 'object' || intent.type_queries === null) {
    intent.type_queries = {
      retailer:     [`${kw} shop`, `${kw} store`],
      wholesaler:   [`${kw} wholesale`, `${kw} thok`],
      manufacturer: [`${kw} manufacturer`, `${kw} factory`],
      distributor:  [`${kw} distributor`, `${kw} supplier`],
    };
  } else {
    intent.type_queries.retailer     = Array.isArray(intent.type_queries.retailer) ? intent.type_queries.retailer : [`${kw} shop`, `${kw} store`];
    intent.type_queries.wholesaler   = Array.isArray(intent.type_queries.wholesaler) ? intent.type_queries.wholesaler : [`${kw} wholesale`, `${kw} thok`];
    intent.type_queries.manufacturer = Array.isArray(intent.type_queries.manufacturer) ? intent.type_queries.manufacturer : [`${kw} manufacturer`, `${kw} factory`];
    intent.type_queries.distributor  = Array.isArray(intent.type_queries.distributor) ? intent.type_queries.distributor : [`${kw} distributor`, `${kw} supplier`];
  }
  intent.category_keywords   = Array.isArray(intent.category_keywords) ? intent.category_keywords : [];
  intent.indian_synonyms     = Array.isArray(intent.indian_synonyms) ? intent.indian_synonyms : [];
  intent.store_name_keywords = Array.isArray(intent.store_name_keywords) ? intent.store_name_keywords : [kw];
  intent.review_keywords     = Array.isArray(intent.review_keywords) ? intent.review_keywords : [kw];
  intent.synonyms            = Array.isArray(intent.synonyms) ? intent.synonyms : [];
  intent.exclude_name_words  = Array.isArray(intent.exclude_name_words) ? intent.exclude_name_words : [];
  intent.anti_stock_keywords = Array.isArray(intent.anti_stock_keywords) ? intent.anti_stock_keywords : [];
  intent.is_food       = !!intent.is_food;
  intent.is_service    = !!intent.is_service;
  intent.is_ambiguous  = !!intent.is_ambiguous;
  intent.primary_meaning = typeof intent.primary_meaning === 'string' ? intent.primary_meaning : kw;

  log('[intent] Gemini result for "' + kw + '":', intent);

  // ── 5. Write to permanent cache ────────────────────────────────────────────
  try {
    const cacheRef = doc(db, GEMINI_CONFIG.INTENT_CACHE_COLLECTION, _intentCacheKey(kw));
    await setDoc(cacheRef, {
      keyword: kw,
      intent,
      schemaVersion: CURRENT_INTENT_SCHEMA,
      createdAt: serverTimestamp(),
    });
    log('[intent] cached permanently →', kw);
  } catch (err) {
    warn('[intent] cache write error (non-fatal):', err.message);
  }

  // ── 6. Increment usage counter ─────────────────────────────────────────────
  try {
    const usageRef = doc(db, GEMINI_CONFIG.USAGE_COLLECTION, GEMINI_CONFIG.USAGE_DOC);
    await setDoc(usageRef, { calls_made: increment(1) }, { merge: true });
  } catch (err) {
    warn('[intent] usage increment error (non-fatal):', err.message);
  }

  return intent;
};

// ─────────────────────────────────────────────────────────────────────────────
// TASK 1 — SPATIAL GRID MATH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Divide a geocoder viewport into a uniform grid of non-overlapping rectangles.
 *
 * Mathematical derivation:
 *   latSpan        = ne.lat − sw.lat          (total height, degrees)
 *   lngSpan        = ne.lng − sw.lng          (total width,  degrees)
 *   cellLatHeight  = latSpan  / rows
 *   cellLngWidth   = lngSpan  / cols
 *
 * For cell at (col, row):
 *   low.latitude   = sw.lat + row       * cellLatHeight
 *   high.latitude  = sw.lat + (row + 1) * cellLatHeight
 *   low.longitude  = sw.lng + col       * cellLngWidth
 *   high.longitude = sw.lng + (col + 1) * cellLngWidth
 *
 * @param {{ ne: {lat: number, lng: number}, sw: {lat: number, lng: number} }} viewport
 * @param {'city'|'neighbourhood'|'specific'} searchScope
 * @returns {Array<{ low:  {latitude: number, longitude: number},
 *                   high: {latitude: number, longitude: number} }>}
 *          Ready-to-use rectangle objects for Places API `locationRestriction.rectangle`.
 */
const generateGridBoxes = (viewport, searchScope) => {
  const { ne, sw } = viewport;
  const { cols, rows } = GRID_CONFIG[searchScope] ?? GRID_CONFIG.city;

  const latSpan       = ne.lat - sw.lat;   // total height in degrees
  const lngSpan       = ne.lng - sw.lng;   // total width  in degrees
  const cellLatHeight = latSpan / rows;
  const cellLngWidth  = lngSpan / cols;

  const boxes = [];

  // row 0 = southernmost strip (sw corner), row (rows−1) = northernmost strip
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      boxes.push({
        low: {
          latitude:  sw.lat + row       * cellLatHeight,
          longitude: sw.lng + col       * cellLngWidth,
        },
        high: {
          latitude:  sw.lat + (row + 1) * cellLatHeight,
          longitude: sw.lng + (col + 1) * cellLngWidth,
        },
      });
    }
  }

  log(
    `[grid] scope=${searchScope} → ${cols}×${rows}=${boxes.length} cells`,
    `| latSpan=${latSpan.toFixed(5)}° lngSpan=${lngSpan.toFixed(5)}°`,
    `| cellH=${cellLatHeight.toFixed(5)}° cellW=${cellLngWidth.toFixed(5)}°`,
  );

  return boxes;
};

// ─────────────────────────────────────────────────────────────────────────────
// CACHE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic Firestore-safe cache key from search params */
const makeCacheKey = (keyword, location, tag) => {
  const raw = `${keyword.toLowerCase().trim()}|${location.toLowerCase().trim()}|${(tag || '').toLowerCase().trim()}`;
  return btoa(unescape(encodeURIComponent(raw))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 60);
};

/** Return cached doc data if fresh, else null */
const readCache = async (cacheKey) => {
  try {
    const ref  = doc(db, CACHE_CONFIG.COLLECTION, cacheKey);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const data      = snap.data();
    const cachedAt  = data.cachedAt?.toMillis?.() ?? (data.cachedAt || 0);
    const ttlMs     = CACHE_CONFIG.TTL_HOURS * 60 * 60 * 1000;

    if (Date.now() - cachedAt > ttlMs) {
      log('[cache] expired →', cacheKey);
      return null;
    }

    log('[cache] HIT →', cacheKey, `(${data.results?.length ?? 0} results)`);
    // Bump hit counter — fire-and-forget, never blocks caller
    setDoc(ref, { hitCount: (data.hitCount || 0) + 1 }, { merge: true }).catch(() => {});
    return data;
  } catch (err) {
    warn('[cache] read error, bypassing cache:', err.message);
    return null;
  }
};

/** Write results to Firestore cache — fire-and-forget, never blocks the search */
const writeCache = async (cacheKey, keyword, location, results) => {
  try {
    const ref = doc(db, CACHE_CONFIG.COLLECTION, cacheKey);
    await setDoc(ref, {
      query:       keyword,
      location,
      results,
      cachedAt:    serverTimestamp(),
      hitCount:    0,
      resultCount: results.length,
    });
    log('[cache] WRITE →', cacheKey, `(${results.length} results)`);
  } catch (err) {
    warn('[cache] write error (non-fatal):', err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GEOCODING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Geocode a location string → { lat, lng, viewport, bounds }
 *
 * Both `viewport` and `bounds` come from Google's Geocoding API:
 *   - viewport  = recommended map display area (padded, wider)
 *   - bounds    = actual administrative/geographic boundary of the place (tighter)
 *
 * bounds is present for named places (suburbs, localities, cities).
 * For point locations it may be absent; we fall back to viewport in that case.
 * We use `bounds` for the geo-fence post-filter to enforce strict locality
 * boundaries (e.g. keep only Maninagar, exclude Isanpur that falls within
 * the wider viewport box).
 */
const geocodeLocation = async (location, options = {}) => {
  const { signal } = options;
  throwIfAborted(signal);
  const url  = `${GEO_BASE}?address=${encodeURIComponent(location)}&key=${GOOGLE_API_KEY}`;
  const res  = await fetch(url, { signal });
  const data = await res.json();

  if (data.status !== 'OK' || !data.results.length) {
    throw new Error(`Geocoding failed for "${location}": ${data.status}`);
  }

  const r  = data.results[0];
  const vp = r.geometry.viewport;
  const bn = r.geometry.bounds;    // tighter admin boundary — may be absent

  const viewport = {
    ne: { lat: vp.northeast.lat, lng: vp.northeast.lng },
    sw: { lat: vp.southwest.lat, lng: vp.southwest.lng },
  };

  // bounds is the strict administrative polygon bbox.
  // Falls back to viewport when the geocoder doesn't return a bounds (rare
  // for named localities).
  const bounds = bn ? {
    ne: { lat: bn.northeast.lat, lng: bn.northeast.lng },
    sw: { lat: bn.southwest.lat, lng: bn.southwest.lng },
  } : viewport;

  const boundsLog = bn
    ? `| bounds sw=(${bounds.sw.lat.toFixed(5)},${bounds.sw.lng.toFixed(5)}) ne=(${bounds.ne.lat.toFixed(5)},${bounds.ne.lng.toFixed(5)})`
    : '| bounds: absent — falling back to viewport';
  log(
    '[geocode]', location,
    `| viewport sw=(${viewport.sw.lat.toFixed(5)},${viewport.sw.lng.toFixed(5)}) ne=(${viewport.ne.lat.toFixed(5)},${viewport.ne.lng.toFixed(5)})`,
    boundsLog,
  );

  return {
    lat:      r.geometry.location.lat,
    lng:      r.geometry.location.lng,
    viewport,
    bounds,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// TASK 2 — PLACES API PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One Places API v1 searchText call for one page inside one grid rectangle.
 *
 * @param {string} textQuery    — e.g. "Hardware store in Maninagar, Ahmedabad"
 * @param {{ low: {latitude, longitude}, high: {latitude, longitude} }} rectangle
 * @param {string|null} pageToken    — nextPageToken from previous page, or null
 * @param {string|null} includedType — Google Place type restriction (e.g. 'store'), or null
 * @returns {{ places: Array, nextPageToken: string|null }}
 */
const searchQueryPage = async (textQuery, rectangle, pageToken = null, includedType = null, signal = null) => {
  throwIfAborted(signal);
  const body = {
    textQuery,
    maxResultCount: 20,
    locationRestriction: { rectangle },
  };
  // includedType restricts Google's results to a specific category at source.
  // Only set for types with a native Google Places type (store, restaurant, etc.).
  // Must NOT be set for manufacturer/wholesaler (no native type) or any-type searches.
  if (includedType) body.includedType = includedType;
  if (pageToken) body.pageToken = pageToken;

  let res;
  try {
    res = await fetch(PLACES_V1_TEXT, {
      method:  'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-Goog-Api-Key':   GOOGLE_API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (networkErr) {
    if (isAbortError(networkErr)) throw networkErr;
    throw new Error(`Network error — check internet connection: ${networkErr.message}`);
  }

  const raw = await res.text();

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errJson = JSON.parse(raw);
      const details = errJson?.error?.message || errJson?.error?.status || raw;
      errMsg = `Google Places API error (${res.status}): ${details}`;
      if (res.status === 403 || String(details).includes('not enabled')) {
        errMsg += ' — Make sure "Places API (New)" is enabled in Google Cloud Console.';
      }
    } catch { /* raw is not JSON */ }
    console.error('[places-v1]', errMsg);
    throw new Error(errMsg);
  }

  let data;
  try { data = JSON.parse(raw); }
  catch { return { places: [], nextPageToken: null }; }

  return { places: data.places || [], nextPageToken: data.nextPageToken || null };
};

/**
 * Fetch up to `maxPages` pages for one (textQuery, rectangle) pair.
 * Pages are sequential — required by the nextPageToken chain.
 * maxPages defaults to PAGES_PER_CELL_DEFAULT for the function signature only;
 * callers always pass the scope-specific pagesPerCell from GRID_CONFIG.
 *
 * @param {string} textQuery
 * @param {{ low, high }} rectangle
 * @param {number} maxPages
 * @param {string|null} includedType
 * @returns {{ places: Array, callCount: number }}
 */
// seenIds — the live Set of place IDs already collected from prior cells/queries.
// Passed by reference so this function can detect zero-yield pages and exit early,
// saving API calls when an area is already saturated by previous sweeps.
const searchQueryPaged = async (
  textQuery,
  rectangle,
  maxPages = PAGES_PER_CELL_DEFAULT,
  includedType = null,
  seenIds = null,
  signal = null,
) => {
  const allPlaces = [];
  let pageToken   = null;
  let callCount   = 0;

  for (let p = 0; p < maxPages; p++) {
    throwIfAborted(signal);
    // 400 ms stagger before every page except the first of the first cell
    // (outer stagger handles the first call; inner handles subsequent pages).
    if (p > 0) await delay(CALL_STAGGER_MS, signal);

    const { places, nextPageToken } = await searchQueryPage(textQuery, rectangle, pageToken, includedType, signal);
    callCount++;
    allPlaces.push(...places);

    // New-unique count for this page (uses seenIds snapshot from prior cells/queries).
    // Measures how many results on THIS page haven't been collected yet.
    const pageNewUniques = seenIds
      ? places.filter(pl => pl.id && !seenIds.has(pl.id)).length
      : places.length;

    log(`[cell-page] page ${p + 1} → ${places.length} raw, ${pageNewUniques} new unique | nextToken=${!!nextPageToken}`);

    // Three adaptive early-exit conditions (minimum API calls):
    //   1. No more pages from Google.
    //   2. Sparse page (< 20) — Google is running out of results in this cell.
    //   3. Zero new uniques — all results already collected from prior cells.
    if (!nextPageToken || places.length < 20 || pageNewUniques === 0) break;
    pageToken = nextPageToken;
  }

  log(`[cell] total ${allPlaces.length} raw results across ${callCount} page(s)`);
  return { places: allPlaces, callCount };
};

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT HELPER
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a Places API v1 result object into a consistent lead shape */
const formatPlace = (p) => {
  // Concatenate review texts for scoring (stripped before cache write)
  const reviewTexts = (p.reviews || [])
    .map(r => r.text?.text || r.originalText?.text || '')
    .filter(Boolean)
    .join(' ');

  return {
    id:                  p.id,
    placeId:             p.id,
    displayName:         p.displayName || { text: 'Unknown Business' },
    formattedAddress:    p.formattedAddress || 'Address not available',
    nationalPhoneNumber: p.internationalPhoneNumber || null,
    websiteUri:          p.websiteUri || null,
    rating:              p.rating     || null,
    userRatingCount:     p.userRatingCount || 0,
    businessStatus:      p.businessStatus  || 'OPERATIONAL',
    types:               p.types || [],
    lat:                 p.location?.latitude  || null,
    lng:                 p.location?.longitude || null,
    source:              'places-v1-grid',
    _reviewText:         reviewTexts,  // internal — stripped before cache/return
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// TASK 2 + 3 — CORE GRID SWEEP ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal single-pair search — used by both the fast path and multi-search loop.
 *
 * Algorithm (replaces keyword-variant loop entirely):
 *   1. Build ONE textQuery: "{keyword} in {fullLocation}" — no variants.
 *   2. Cache check → short-circuit if fresh hit.
 *   3. Geocode fullLocation → viewport bounding box.
 *   4. generateGridBoxes → array of N rectangles.
 *   5. for...of staggered sweep (CELL_STAGGER_MS between cells):
 *        searchQueryPaged(textQuery, rectangle, PAGES_PER_CELL) per cell.
 *   6. Deduplicate by place.id across ALL cells inline (border overlap elimination).
 *   7. writeCache (fire-and-forget).
 */
const _searchSingle = async (keyword, location, options = {}) => {
  const {
    type        = '',
    searchScope = 'city',
    area        = '',
    onProgress  = null,
    signal      = null,
  } = options;

  let totalApiCalls = 0;

  try {
    throwIfAborted(signal);

    if (!keyword?.trim() || !location?.trim()) {
      throw new Error('keyword and location are required');
    }

  const areaStr      = area.trim();
  const cityStr      = location.trim();
  const fullLocation = areaStr ? `${areaStr}, ${cityStr}` : cityStr;

  // ── Intent Engine (product searches only) ──────────────────────────────────
  // Call getKeywordIntent for product-type searches. Routes food/service
  // keywords based on AI classification. Provides search_queries, exclude_name_words,
  // anti_stock_keywords, review_keywords, synonyms, store_name_keywords.
  const isProductType = (type === '' || type === 'store' || type === 'manufacturer' || type === 'wholesaler');
  let intent = null;

    if (isProductType) {
      if (onProgress) onProgress({ phase: 'intent', message: 'Analysing keyword…', current: 0, total: 1 });
      intent = await getKeywordIntent(keyword.trim(), { signal });
      log('[search] intent for "' + keyword.trim() + '":', intent);
    }

  // Determine routing based on intent (AI) or type dropdown
  const isFoodSearch    = intent ? intent.is_food    : FOOD_KEYWORDS.test(keyword.trim().toLowerCase());
  const isServiceSearch = intent ? intent.is_service : SERVICE_KEYWORDS.test(keyword.trim().toLowerCase());

  // ── Build queries ──────────────────────────────────────────────────────────
  // For product searches with AI intent: use intent.search_queries + location
  // For food/service/category: use existing buildQueries with TYPE_QUERY_SUFFIXES
  let queries;
  const includedType = INCLUDED_TYPE_MAP[type] ?? null;

  if (isProductType && intent && !isFoodSearch && !isServiceSearch && intent.type_queries) {
    const loc = fullLocation;
    const QUERY_LIMITS = {
      city:          8,
      neighbourhood: 6,
      specific:      4,
    };
    const queryLimit = QUERY_LIMITS[searchScope] ?? 6;

    let aiQueries;
    if (!type || type === '') {
      // Any type — combine all arrays
      const combined = [
        ...(intent.type_queries?.retailer     || []),
        ...(intent.type_queries?.wholesaler   || []),
        ...(intent.type_queries?.manufacturer || []),
        ...(intent.type_queries?.distributor  || []),
      ];
      // Deduplicate and limit
      aiQueries = [...new Set(combined)].slice(0, queryLimit);
    } else {
      // Specific type — use that type's queries only
      const typeKey = type === 'store' ? 'retailer' : type;
      aiQueries = (intent.type_queries?.[typeKey] || intent.type_queries?.retailer || []).slice(0, queryLimit);
    }

    queries = aiQueries.map(q => `${q} in ${loc}`);
    log('[search] using AI type-queries:', queries);
  } else {
    // Fallback to static query builder (food, service, category types)
    queries = buildQueries(keyword.trim(), fullLocation, searchScope, type);
    log('[search] using static queries:', queries);
  }

  const { cols, rows, pagesPerCell = PAGES_PER_CELL_DEFAULT } = GRID_CONFIG[searchScope] ?? GRID_CONFIG.city;
  const totalCalls = queries.length * (cols * rows) * pagesPerCell;   // theoretical max
  log(
    `[search] scope=${searchScope} | grid=${cols}x${rows}=${cols*rows} cells`,
    `| ${queries.length} variants | budget≤${totalCalls} calls`,
    `| location="${fullLocation}"`,
  );

  // ── 1. Cache check ─────────────────────────────────────────────────────────
    const cacheKey = makeCacheKey(keyword.trim(), fullLocation, `${type}:${searchScope}:v14`);

    if (onProgress) onProgress({ phase: 'cache', message: 'Checking cache…', current: 0, total: 1 });

  // forceRefresh=true skips reading the cache so a live sweep always runs.
    if (!options.forceRefresh) {
      const cached = await readCache(cacheKey);
      if (cached?.results) {
        if (onProgress) onProgress({ phase: 'done', message: 'Loaded from cache', found: cached.results.length, cached: true });
        return { results: cached.results, apiCalls: 0, cached: true, totalResults: cached.results.length };
      }
    }

  // ── 2. Geocode ──────────────────────────────────────────────────────────────
    if (onProgress) onProgress({ phase: 'geocoding', message: `Locating "${fullLocation}"…`, current: 0, total: 1 });

    const geo = await geocodeLocation(fullLocation, { signal });

  // ── 3. Sweep viewport ─────────────────────────────────────────────────────────
  // For city scope we pad the geocoder viewport by +15% in all directions.
  // The Geocoding API\u2019s viewport is a conservative \u201cdisplay\u201d box — peri-urban
  // suburbs and industrial estates often fall just outside it.  The padding
  // adds ~2–5 km on each edge for a typical Indian city, recovering those
  // businesses at ZERO extra API calls (same 9-cell grid, wider cells).
  // neighbourhood/specific use the viewport as-is; the geo-fence (step 6)
  // then enforces the strict admin boundary for those scopes.
  // Lock 1 (Geo): Use the geocoder's viewport EXACTLY — no padding, no radius.
  // The viewport IS the bounding rectangle for the named place (Maninagar, Ahmedabad, etc.).
  // Subdivided into a grid, each cell becomes a locationRestriction.rectangle.
  const sweepViewport  = geo.viewport;
  // Post-filter fence: same viewport, strict (0% margin).
  // Redundant for city (NLP handles it) but retained for neighbourhood/specific
  // to catch any Places API edge cases where results slightly exceed the rectangle.
  // FIX: Use geo.bounds (tight admin boundary) for neighbourhood/specific fence.
  // geo.viewport is a padded display box 30-50% larger than the actual area.
  // geo.bounds matches the real administrative boundary of e.g. "Maninagar"
  // so results from adjacent areas (Isanpur, Saraspur) are excluded correctly.
  // Falls back to geo.viewport if bounds is absent (rare — point locations).
  const geoFenceBounds = geo.bounds;
  log(
    `[grid] ${searchScope} sweep = geocoder viewport (exact)`,
    `| sw=(${sweepViewport.sw.lat.toFixed(5)},${sweepViewport.sw.lng.toFixed(5)})`,
    `  ne=(${sweepViewport.ne.lat.toFixed(5)},${sweepViewport.ne.lng.toFixed(5)})`,
  );

  // ── 4. Generate grid rectangles ────────────────────────────────────────────
    const gridBoxes = generateGridBoxes(sweepViewport, searchScope);

    const matrixTotal = gridBoxes.length * queries.length;   // total (cell, variant) pairs

    if (onProgress) {
      onProgress({
        phase:    'searching',
        message:  `Matrix sweep: ${gridBoxes.length} cells × ${queries.length} variants…`,
        current:  0,
        total:    matrixTotal,
        found:    0,
        apiCalls: 0,
      });
    }

  // ── 5. Matrix sweep: staggered for...of (cell × variant) ──────────────────
  // 400 ms stagger between EVERY searchQueryPaged call — both across cells
  // and across variants — to prevent OVER_QUERY_LIMIT (429).
    const seen        = new Set();
    const allLeads    = [];
    let callIdx       = 0;   // counts (cell, variant) pairs dispatched

    for (const rectangle of gridBoxes) {
      for (const query of queries) {
        throwIfAborted(signal);
      // 400 ms stagger before every call except the very first
        if (callIdx > 0) await delay(CALL_STAGGER_MS, signal);

      // Pass `seen` so searchQueryPaged can exit pages early when all results
      // on a page are already collected (zero-yield page exit, saves pages 2-3).
        const { places, callCount } = await searchQueryPaged(query, rectangle, pagesPerCell, includedType, seen, signal);
        totalApiCalls += callCount;
        callIdx++;

      // Deduplicate by place.id across ALL cells and variants.
        let newThisCall = 0;
        for (const p of places) {
          if (p.id && !seen.has(p.id)) {
            seen.add(p.id);
            allLeads.push(formatPlace(p));
            newThisCall++;
          }
        }

        log(
          `[matrix] ${callIdx}/${matrixTotal} | query="${query}"`,
          `-> ${places.length} raw, ${newThisCall} new unique`,
          `| total=${allLeads.length} | apiCalls=${totalApiCalls}`,
        );

        if (onProgress) {
          onProgress({
            phase:    'searching',
            message:  `${callIdx}/${matrixTotal} sweeps complete — ${allLeads.length} unique businesses found…`,
            current:  callIdx,
            total:    matrixTotal,
            found:    allLeads.length,
            apiCalls: totalApiCalls,
          });
        }
      // NOTE: We do NOT skip remaining queries on this cell even if newThisCall===0.
      // Different query variants ("shop", "wholesaler") surface different businesses
      // from Google's index even within the same geographic rectangle.
      // The per-page seenIds check inside searchQueryPaged already prevents paying
      // for additional pages when a page is fully saturated.
      }
    }

    log(`[search] grid sweep complete | ${totalApiCalls} API calls -> ${allLeads.length} unique places`);

  // ── 6. Geographic fence filter (all scopes) ─────────────────────────────────
  // TWO-LAYER GEO FENCE:
  //   Layer 1: Bounding box filter using geo.bounds (tight admin boundary)
  //   Layer 2: Address-string verification — formattedAddress must contain area name
  // This double-lock prevents results from neighbouring areas (e.g. Isanpur
  // appearing in a Maninagar search) even when those results technically fall
  // within the wider viewport or on the edge of the bounds bbox.
    let finalLeads = allLeads;
    if (geoFenceBounds) {
    const fence  = geoFenceBounds;
    const before = allLeads.length;

    // Layer 1: Bounding box filter
    finalLeads = allLeads.filter((lead) => {
      if (lead.lat == null || lead.lng == null) return true;
      return lead.lat >= fence.sw.lat
          && lead.lat <= fence.ne.lat
          && lead.lng >= fence.sw.lng
          && lead.lng <= fence.ne.lng;
    });

    const afterBbox = finalLeads.length;
    log(
      `[geo-fence-L1] ${before} → ${afterBbox} results after bbox filter`,
      `| sw=(${fence.sw.lat.toFixed(5)},${fence.sw.lng.toFixed(5)})`,
      `  ne=(${fence.ne.lat.toFixed(5)},${fence.ne.lng.toFixed(5)})`,
    );

    // Layer 2: Address-string verification
    // City must always match. If area is supplied, enforce area too.
    // This removes nearby-locality bleed-through even when coordinates are
    // close to boundary edges.
    const beforeAddr = finalLeads.length;

    finalLeads = finalLeads.filter((lead) => {
      const addr = lead.formattedAddress || '';
      // For neighbourhood/specific: bbox (Layer 1) already restricts to the area.
      // Only enforce city in the address string to avoid over-filtering.
      const enforceArea = (searchScope === 'city') ? (areaStr || null) : null;
      return addressMatchesLocation(addr, cityStr, enforceArea);
    });

    log(
      `[geo-fence-L2] ${beforeAddr} → ${finalLeads.length} results after address-string filter`,
      `| city="${cityStr}"`,
      areaStr ? `| area="${areaStr}"` : '| area=none',
    );
    }

  // ── 7. Three-Layer Relevance Filter (AI-powered for product searches) ──────
    const kwLower = keyword.trim().toLowerCase();
    const isJewellerySearch = JEWELLERY_KEYWORDS.test(kwLower);
    const beforeRelevance = finalLeads.length;

    if (isProductType && !isFoodSearch && !isServiceSearch) {
    // ── Layer A: Type-Based Exclusion ────────────────────────────────────
    const NON_PRODUCT_TYPES = new Set([
      'restaurant', 'cafe', 'bar', 'food', 'bakery', 'meal_delivery',
      'meal_takeaway', 'fast_food_restaurant', 'ice_cream_shop',
      'coffee_shop', 'night_club', 'caterer',
      'bank', 'atm', 'accounting', 'insurance_agency',
      'hospital', 'doctor', 'dentist', 'physiotherapist', 'veterinary_care',
      'lodging', 'hotel', 'motel',
      'movie_theater', 'amusement_park', 'casino', 'stadium',
      'zoo', 'aquarium', 'art_gallery', 'museum',
      'tourist_attraction', 'event_venue', 'banquet_hall', 'wedding_venue',
      'beauty_salon', 'hair_care', 'spa', 'nail_salon',
      'school', 'university', 'library',
      'airport', 'bus_station', 'train_station', 'transit_station',
      'subway_station', 'parking',
      'church', 'mosque', 'hindu_temple', 'place_of_worship', 'cemetery',
      'local_government_office', 'courthouse', 'embassy',
      'fire_station', 'police',
      'car_rental', 'car_repair', 'car_wash',
      'gym', 'fitness_center',
    ]);
    if (!isJewellerySearch) NON_PRODUCT_TYPES.add('jewelry_store');

    const beforeA = finalLeads.length;
    finalLeads = finalLeads.filter((lead) => {
      const types = lead.types || [];
      const name = (lead.displayName?.text || '').toLowerCase();
      // Name match always wins — if the business name contains the keyword, keep it
      if (name.includes(kwLower)) return true;
      // No types at all — keep (can't determine category)
      if (types.length === 0) return true;
      const specific = types.filter(t => !GENERIC_PLACE_TYPES.has(t));
      if (specific.length === 0) {
        // Place has only generic types — keep ONLY if the business name contains
        // the search keyword (strong signal it actually deals in that product).
        return name.includes(kwLower);
      }
      // Whitelist: keep only if place has ≥1 type that is a known product seller
      const hasProductType = specific.some(t => PRODUCT_SELLER_TYPES.has(t));
      if (hasProductType) return true;
      // Has specific types but none are product-seller types → drop
      return false;
    });
    log(`[filter-A] ${beforeA} → ${finalLeads.length} after type whitelist`);

    // ── Layer B: Intent Name Exclusion ───────────────────────────────────
    if (intent?.exclude_name_words?.length) {
      const excludeWords = intent.exclude_name_words.map(w => w.toLowerCase());
      const beforeB = finalLeads.length;
      finalLeads = finalLeads.filter((lead) => {
        const name = (lead.displayName?.text || '').toLowerCase();
        if (name.includes(kwLower)) return true;
        return !excludeWords.some(w => name.includes(w));
      });
      log(`[filter-B] ${beforeB} → ${finalLeads.length} after name exclusion`);
    }

    // ── Layer C: Anti-Stock Keyword Filter ───────────────────────────────
    if (intent?.anti_stock_keywords?.length) {
      const antiWords = intent.anti_stock_keywords.map(w => w.toLowerCase());
      const beforeC = finalLeads.length;
      finalLeads = finalLeads.filter((lead) => {
        const name = (lead.displayName?.text || '').toLowerCase();
        if (name.includes(kwLower)) return true;
        return !antiWords.some(w => name.includes(w));
      });
      log(`[filter-C] ${beforeC} → ${finalLeads.length} after anti-stock filter`);
    }

    // ── Layer D: Keyword-Relevance Gate ────────────────────────────────
    // Layer A proves a place is a shop. Layers B/C exclude bad names.
    // But a shop can sell ANYTHING — "Patel Hardware" passes type-whitelist
    // for a "ball" search even though it has zero relation to balls.
    // Layer D requires at least ONE affinity signal:
    //   • keyword or synonym appears in the business name
    //   • a store_name_keyword appears in the business name
    //   • keyword or synonym appears in customer reviews
    //   • place has a highly specific matching type (e.g. sporting_goods_store)
    // Safety net: if filtering would leave < 3 results, keep unfiltered.
    if (intent) {
      const affinityWords = [
        kwLower,
        ...(intent.synonyms || []).map(s => s.toLowerCase()),
        ...(intent.indian_synonyms || []).map(s => s.toLowerCase()),
        ...(intent.review_keywords || []).map(s => s.toLowerCase()),
      ];
      const categoryWords = (intent.category_keywords || []).map(s => s.toLowerCase());
      const storeHints = (intent.store_name_keywords || []).map(s => s.toLowerCase());

      // Types that are specific enough to count as a signal on their own
      // (a sporting_goods_store IS relevant for "ball" even without name match)
      const HIGHLY_SPECIFIC_TYPES = new Set([
        'sporting_goods_store', 'toy_store', 'bicycle_store',
        'book_store', 'pet_store', 'florist',
        'clothing_store', 'jewelry_store',
        'furniture_store', 'home_goods_store',
        'hardware_store', 'paint_store', 'electronics_store',
      ]);

      const beforeD = finalLeads.length;
      const gated = finalLeads.filter((lead) => {
        const name = (lead.displayName?.text || '').toLowerCase();
        const reviewText = (lead._reviewText || '').toLowerCase();
        const types = lead.types || [];

        // Signal 1: product keyword OR indian synonym in name
        if (affinityWords.some(w => w && name.includes(w))) return true;
        // Signal 2: category keyword in name
        if (categoryWords.some(w => w && name.includes(w))) return true;
        // Signal 3: product keyword OR synonym in reviews
        if (reviewText && affinityWords.some(w => w && reviewText.includes(w))) return true;
        // Signal 4: highly specific OR category Google type
        if (types.some(t => HIGHLY_SPECIFIC_TYPES.has(t))) return true;
        // Signal 5: specific store hint phrase in name (bonus)
        if (storeHints.some(w => w && name.includes(w))) return true;

        return false;
      });

      // ── No safety net — 0 accurate results > 20 wrong results ──────────
      // Old code: if (gated.length >= 3) use gated, else skip filter entirely.
      // That "safety net" was the #1 reason Layer D never applied — it bypassed
      // the entire filter whenever fewer than 3 businesses passed, which is
      // common for niche keywords in smaller cities.
      if (gated.length > 0) {
        // NORMAL PATH: filter produced results — use them
        finalLeads = gated;
        log(`[filter-D] ${beforeD} → ${finalLeads.length} after keyword-relevance gate`);
      } else {
        // FALLBACK PATH: filter produced 0 results
        // Apply a weaker name-only filter instead of bypassing entirely.
        // This still removes unrelated shops while keeping anything that
        // at least mentions the keyword or a synonym in its name.
        const nameOnly = finalLeads.filter(lead => {
          const name = (lead.displayName?.text || '').toLowerCase();
          return affinityWords.some(w => w && name.includes(w));
        });
        finalLeads = nameOnly;  // may be empty — that is correct and expected
        log(`[filter-D] fallback name-only filter: ${beforeD} → ${finalLeads.length} (full gate returned 0)`);
      }
    }

    log(`[relevance] FOUR-LAYER | "${kwLower}" | ${beforeRelevance} → ${finalLeads.length}`);

    } else if (isProductType && isFoodSearch) {
    const foodAndProductTypes = new Set([...FOOD_DRINK_TYPES, ...PRODUCT_SELLER_TYPES]);
    finalLeads = finalLeads.filter((lead) => {
      const types = lead.types || [];
      if (types.length === 0) return true;
      const specific = types.filter(t => !GENERIC_PLACE_TYPES.has(t));
      if (specific.length === 0) return true;
      return specific.some(t => foodAndProductTypes.has(t));
    });
    log(`[relevance] FOOD whitelist | "${kwLower}" | ${beforeRelevance} → ${finalLeads.length}`);

    } else if (isProductType && isServiceSearch) {
    // Look up a whitelist for this service keyword if one exists
    const serviceTypeKey = Object.keys(SERVICE_TYPE_WHITELIST).find(k => kwLower.includes(k));
    if (serviceTypeKey) {
      const whitelist = SERVICE_TYPE_WHITELIST[serviceTypeKey];
      finalLeads = finalLeads.filter((lead) => {
        const types = lead.types || [];
        const name = (lead.displayName?.text || '').toLowerCase();
        if (name.includes(kwLower)) return true;   // name match always wins
        if (types.length === 0) return true;
        const specific = types.filter(t => !GENERIC_PLACE_TYPES.has(t));
        if (specific.length === 0) return name.includes(kwLower);
        return specific.some(t => whitelist.has(t));
      });
      log(`[relevance] SERVICE keyword whitelist | "${kwLower}" | ${beforeRelevance} → ${finalLeads.length}`);
    } else {
      // No whitelist for this service — apply name-based filter at minimum
      finalLeads = finalLeads.filter((lead) => {
        const name = (lead.displayName?.text || '').toLowerCase();
        return name.includes(kwLower) || (lead.types || []).some(t => t.includes(kwLower.replace(/\s+/g, '_')));
      });
      log(`[relevance] SERVICE keyword name-filter | "${kwLower}" | ${beforeRelevance} → ${finalLeads.length}`);
    }

    } else if (SERVICE_TYPE_WHITELIST[type]) {
    const whitelist = SERVICE_TYPE_WHITELIST[type];
    finalLeads = finalLeads.filter((lead) => {
      const types = lead.types || [];
      if (types.length === 0) return true;
      const specific = types.filter(t => !GENERIC_PLACE_TYPES.has(t));
      if (specific.length === 0) return true;
      return specific.some(t => whitelist.has(t));
    });
    log(`[relevance] SERVICE whitelist type="${type}" | ${beforeRelevance} → ${finalLeads.length}`);
    }

  // ── 8. Confidence Scoring & Review Mining ─────────────────────────────────
    if (isProductType && !isFoodSearch && !isServiceSearch && intent) {
    const reviewWords = [
      ...(intent.review_keywords || []),
      ...(intent.synonyms || []),
      ...(intent.indian_synonyms || []),
      kwLower,
    ].map(w => w.toLowerCase());
    
    const affinityWords = [
      kwLower,
      ...(intent.synonyms || []),
      ...(intent.indian_synonyms || []),
    ].map(w => w.toLowerCase());

    const categoryWords = (intent.category_keywords || []).map(w => w.toLowerCase());
    const storeHintWords = (intent.store_name_keywords || []).map(w => w.toLowerCase());

    const HIGHLY_SPECIFIC_TYPES = new Set([
      'sporting_goods_store', 'toy_store', 'bicycle_store',
      'book_store', 'pet_store', 'florist',
      'clothing_store', 'jewelry_store',
      'furniture_store', 'home_goods_store',
      'hardware_store', 'paint_store', 'electronics_store',
    ]);

    for (const lead of finalLeads) {
      let score = 0;
      const name = (lead.displayName?.text || '').toLowerCase();
      const reviewText = (lead._reviewText || '').toLowerCase();
      const types = lead.types || [];

      if (reviewText && reviewWords.some(w => w && reviewText.includes(w))) score += 60;
      if (name.includes(kwLower)) score += 50;
      if (affinityWords.some(w => w.length > 2 && name.includes(w))) score += 40;
      if (categoryWords.some(w => w && name.includes(w))) score += 35;
      if (storeHintWords.some(w => w && name.includes(w))) score += 30;
      if (types.some(t => HIGHLY_SPECIFIC_TYPES.has(t))) score += 25;
      if (types.length > 0 && types.filter(t => !GENERIC_PLACE_TYPES.has(t)).length === 0) score -= 20;

      lead.confidenceScore = score;
      lead.confidenceLabel = score >= 60 ? 'verified' : score >= 50 ? 'likely' : 'possible';
    }

    finalLeads.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

    // Threshold raised from 20→50: a business now needs at LEAST one of these to qualify:
    //   • keyword in business name (+50) OR
    //   • customer reviews mention the keyword (+60)
    // Just being a shop (+20) no longer qualifies on its own.
    const CONFIDENCE_THRESHOLD = 35;
    const highQuality = finalLeads.filter(l => (l.confidenceScore || 0) >= CONFIDENCE_THRESHOLD);
    if (highQuality.length > 0) {
      finalLeads = highQuality;
      log(`[confidence] threshold filter: kept ${finalLeads.length} results (score ≥ ${CONFIDENCE_THRESHOLD})`);
    } else {
      log(`[confidence] no results above threshold ${CONFIDENCE_THRESHOLD} — keeping all ${finalLeads.length} as-is`);
    }

    const v = finalLeads.filter(l => l.confidenceLabel === 'verified').length;
    const lk = finalLeads.filter(l => l.confidenceLabel === 'likely').length;
    const ps = finalLeads.filter(l => l.confidenceLabel === 'possible').length;
    log(`[confidence] ${v} VERIFIED, ${lk} LIKELY, ${ps} POSSIBLE out of ${finalLeads.length}`);
    }

  // ── 9. Strip _reviewText before cache/return ──────────────────────────────
    for (const lead of finalLeads) { delete lead._reviewText; }

  // ── 10. Cache write (fire-and-forget) ─────────────────────────────────────
    if (finalLeads.length > 0) {
      writeCache(cacheKey, keyword.trim(), fullLocation, finalLeads);
    }

    if (onProgress) {
      onProgress({ phase: 'done', message: `Found ${finalLeads.length} businesses`, found: finalLeads.length, cached: false });
    }

    return {
      results:      finalLeads,
      apiCalls:     totalApiCalls,
      cached:       false,
      totalResults: finalLeads.length,
    };
  } catch (err) {
    if (isAbortError(err)) {
      err.partialApiCalls = Number(err.partialApiCalls ?? totalApiCalls ?? 0);
    }
    throw err;
  }
};



// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — supports comma-separated keywords AND locations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main search entry point.
 *
 * Accepts comma-separated values for both keyword and location:
 *   searchBusinesses('kurti, saree', 'Ahmedabad, Surat')
 *   -> 4 independent grid sweeps (2 keywords x 2 locations), then deduplicated.
 *
 * Single keyword + single location -> straight into _searchSingle (fast path).
 *
 * @param {string}   keyword
 * @param {string}   location
 * @param {object}   [options]
 * @param {string}   [options.type]
 * @param {string}   [options.searchScope]  'city' | 'neighbourhood' | 'specific'
 * @param {string}   [options.area]
 * @param {Function} [options.onProgress]
 * @returns {Promise<{ results, apiCalls, cached, totalResults }>}
 */
export const searchBusinesses = async (keyword, location, options = {}) => {
  const { onProgress = null, signal = null } = options;
  throwIfAborted(signal);

  const keywords  = String(keyword  || '').split(',').map((k) => k.trim()).filter(Boolean);
  const locations = String(location || '').split(',').map((l) => l.trim()).filter(Boolean);

  if (!keywords.length || !locations.length) {
    throw new Error('keyword and location are required');
  }

  // ── Fast path: single keyword + single location ───────────────────────────
  if (keywords.length === 1 && locations.length === 1) {
    return _searchSingle(keywords[0], locations[0], options);
  }

  // ── Multi: (keyword x location) pairs — each runs its own full grid sweep ─
  const pairs = [];
  for (const loc of locations) {
    for (const kw of keywords) {
      pairs.push({ kw, loc });
    }
  }
  const total = pairs.length;

  if (onProgress) {
    onProgress({
      phase:   'start',
      message: `Queuing ${total} grid searches (${keywords.length} keyword${keywords.length > 1 ? 's' : ''} x ${locations.length} location${locations.length > 1 ? 's' : ''})…`,
      current: 0, total, found: 0, apiCalls: 0,
    });
  }

  let done = 0;
  const allResponses = [];
  let totalApiCallsSoFar = 0;

  for (const { kw, loc } of pairs) {
    throwIfAborted(signal);
    try {
      const res = await _searchSingle(kw, loc, { ...options, onProgress: null, signal });
      done++;
      totalApiCallsSoFar += (res.apiCalls || 0);
      allResponses.push(res);

      if (onProgress) {
        onProgress({
          phase:   'searching',
          message: `Completed ${done}/${total} — "${kw}" in ${loc}`,
          current: done, total, found: 0, apiCalls: totalApiCallsSoFar,
        });
      }
    } catch (err) {
      if (isAbortError(err)) {
        err.partialApiCalls = Number(err.partialApiCalls ?? 0) + totalApiCallsSoFar;
      }
      throw err;
    }
  }

  // ── Flatten + deduplicate by place.id across all pairs ───────────────────
  const seen        = new Set();
  const combined    = [];
  let totalApiCalls = 0;

  for (const res of allResponses) {
    totalApiCalls += (res.apiCalls || 0);
    for (const lead of (res.results || [])) {
      const key = lead.id || lead.placeId;
      if (key && !seen.has(key)) {
        seen.add(key);
        combined.push(lead);
      }
    }
  }

  // Re-sort combined results by confidence score (product searches have it; others get 0)
  combined.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

  if (onProgress) {
    onProgress({
      phase:    'done',
      message:  `Found ${combined.length} unique businesses across ${total} search${total > 1 ? 'es' : ''}`,
      found:    combined.length,
      apiCalls: totalApiCalls,
      cached:   false,
    });
  }

  return {
    results:      combined,
    apiCalls:     totalApiCalls,
    cached:       false,
    totalResults: combined.length,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// FILTER / DEDUP UTILITIES  (retained for Phase 4+ compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/** Keep only leads that have a phone number */
export const filterByPhoneNumber = (leads, requirePhone = false) => {
  if (!requirePhone || !Array.isArray(leads)) return leads || [];
  return leads.filter((l) => l?.nationalPhoneNumber?.trim());
};

/** Keep only leads that have a formatted address */
export const filterByAddress = (leads, requireAddress = false) => {
  if (!requireAddress || !Array.isArray(leads)) return leads || [];
  return leads.filter((l) => l?.formattedAddress?.trim());
};

/** Remove duplicates by place_id, phone, or name (priority order) */
export const deduplicateResults = (leads) => {
  const seen = new Set();
  return (leads || []).filter((l) => {
    const key = l.placeId
      || l.nationalPhoneNumber?.trim()
      || l.displayName?.text?.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// ── Category-aware subtype definitions ─────────────────────────────────────
// Each entry in a category is { value, label, hint, pattern }.
// pattern = null means "default / catch-all" — matched when nothing else does.
// A lead can match MULTIPLE subtypes (e.g. "Wholesale & Retail" → both).
//
// Covers every search type the app supports:
//   products (any type, store, manufacturer, wholesaler)
//   restaurant · lodging · hospital · bank · school · gym · real estate
const SUBTYPE_DEFS = {
  product: [
    { value: 'retailer',      label: 'Retailer',        hint: 'Shops, stores, showrooms, outlets',              pattern: /shop|store|showroom|outlet|mart|retail|bhandar/i },
    { value: 'wholesaler',    label: 'Wholesaler',       hint: 'Wholesale markets, bulk dealers',                pattern: /wholesal|\bthok\b|bulk\s*(deal|sale|trade|suppl)|whole\s*sale/i },
    { value: 'distributor',   label: 'Distributor',      hint: 'Distributors, stockists, authorised agents',     pattern: /distribut|stockist|\bc\s*[&]\s*f\b|authoris[ae]d\s*(dealer|distribut)|sole\s*(agent|distribut)|supplier/i },
    { value: 'manufacturer',  label: 'Manufacturer',     hint: 'Factories, industries, fabricators',             pattern: /manufactur|\bfactory\b|\bindustr(ies|ial|y)\b|\bfabricat|\bmfg\.?\b|\bproducer|\bproduction\b|\bworks/i },
  ],
  restaurant: [
    { value: 'dine_in',       label: 'Restaurant',       hint: 'Dine-in restaurants and eateries',               pattern: null },
    { value: 'cafe_bakery',   label: 'Cafe / Bakery',    hint: 'Cafes, coffee shops, bakeries, sweet shops',     pattern: /cafe|coffee|bakery|patisserie|bake|sweets?\s*(shop|house|corner)|mithai|confection/ },
    { value: 'fastfood',      label: 'Fast Food',        hint: 'Fast food, street food, dhabas, tiffin centres', pattern: /fast\s*food|quick\s*bite|snack|pav|chaat|stall|dhaba|canteen|tiffin|parcel|takeaway|take.?away/ },
    { value: 'catering',      label: 'Catering',         hint: 'Catering services, banquets, event food',        pattern: /cater(ing|er)?|banquet|event.*food|wedding.*food|party.*food|\bmess\b/ },
  ],
  lodging: [
    { value: 'hotel',         label: 'Hotel',            hint: 'Hotels, resorts, heritage properties',           pattern: null },
    { value: 'guesthouse',    label: 'Guest House',      hint: 'Guest houses, lodges, hostels, dharamshalas',    pattern: /guest\s*house|lodge|hostel|dorm|dharamshala|paying\s*guest|\bpg\b/ },
    { value: 'service_apt',   label: 'Service Apt',      hint: 'Service apartments, furnished flats, homestays', pattern: /service\s*apart|furnished|homestay|vacation|holiday\s*(home|rental)/ },
  ],
  hospital: [
    { value: 'hospital',      label: 'Hospital',         hint: 'Hospitals and nursing homes',                    pattern: null },
    { value: 'clinic',        label: 'Clinic',           hint: 'Clinics, specialist doctors, polyclinics',       pattern: /clinic|polyclinic|\bdr[.\s]|\bdoctor\b|physician|specialist|surgeon/ },
    { value: 'diagnostic',    label: 'Diagnostic',       hint: 'Labs, pathology, scan centres, imaging',         pattern: /diagnost|laborator|patholog|scan\s*centre|imaging|radiol|blood\s*test/ },
    { value: 'pharmacy',      label: 'Pharmacy',         hint: 'Pharmacies, chemists, medical stores',           pattern: /pharmac|chemist|medical\s*(store|shop)|drug\s*store|\bmedicine/ },
  ],
  bank: [
    { value: 'bank',          label: 'Bank',             hint: 'Scheduled banks (public & private)',             pattern: null },
    { value: 'finance',       label: 'Finance / NBFC',   hint: 'NBFCs, finance companies, loan providers',       pattern: /\bfinance\b|nbfc|microfinance|lending|\bloan\b|credit\s*(society|co-?op)/ },
    { value: 'insurance',     label: 'Insurance',        hint: 'Insurance companies and agents',                 pattern: /insur/ },
    { value: 'exchange',      label: 'Forex / Exchange',  hint: 'Forex, money exchange, remittance',             pattern: /exchange|forex|remit|money\s*transfer|currency/ },
  ],
  school: [
    { value: 'school',        label: 'School',           hint: 'Primary / secondary schools',                   pattern: null },
    { value: 'college',       label: 'College / Uni',    hint: 'Colleges, universities, institutes',             pattern: /college|universit|instit|polytechnic|academy/ },
    { value: 'coaching',      label: 'Coaching',         hint: 'Tuition classes, coaching centres',              pattern: /tuition|coaching|tutorial|\bclasses\b|study\s*circle|prep/ },
    { value: 'training',      label: 'Training',         hint: 'Skill training, vocational, computer courses',   pattern: /training|skill|vocational|computer.*course|\biti\b|\bitc\b/ },
  ],
  gym: [
    { value: 'gym',           label: 'Gym / Fitness',    hint: 'Gyms, fitness centres, crossfit',                pattern: null },
    { value: 'yoga',          label: 'Yoga / Wellness',  hint: 'Yoga centres, meditation, naturopathy',          pattern: /yoga|meditat|naturopathy|wellness|ayurved|pranayam/ },
    { value: 'martial_arts',  label: 'Martial Arts',     hint: 'Martial arts, boxing, karate, academies',        pattern: /martial|boxing|karate|taekwondo|judo|wrestling|sport.*academ/ },
    { value: 'spa',           label: 'Spa / Salon',      hint: 'Spas, beauty salons, massage centres',           pattern: /spa|salon|massage|beauty\s*parlou?r|sauna|steam/ },
  ],
  real_estate: [
    { value: 'broker',        label: 'Agent / Broker',   hint: 'Real estate brokers and agents',                 pattern: null },
    { value: 'builder',       label: 'Builder / Dev',    hint: 'Builders, developers, construction companies',   pattern: /builder|developer|construct|promoter|infrastructure|township/ },
    { value: 'property_mgmt', label: 'Property Mgmt',    hint: 'Property management, rental management',         pattern: /property\s*management|rental.*management|facility.*management/ },
  ],
};

// Maps the `type` dropdown value → SUBTYPE_DEFS key.
const TYPE_TO_SUBTYPE_KEY = {
  '':                   'product',
  'store':              'product',
  'manufacturer':       'product',
  'wholesaler':         'product',
  'restaurant':         'restaurant',
  'lodging':            'lodging',
  'hospital':           'hospital',
  'bank':               'bank',
  'school':             'school',
  'gym':                'gym',
  'real_estate_agency': 'real_estate',
};

/**
 * Returns chip definitions for the current search type.
 * Always starts with { value: '', label: 'All' }.
 * Used by SearchPanel to render context-aware filter chips for every category.
 */
export const getFilterChips = (type) => {
  const key  = TYPE_TO_SUBTYPE_KEY[type] ?? 'product';
  const defs = SUBTYPE_DEFS[key]         ?? SUBTYPE_DEFS.product;
  return [
    { value: '', label: 'All', hint: 'Show all results' },
    ...defs.map(({ value, label, hint }) => ({ value, label, hint })),
  ];
};

/**
 * Detect subtype(s) of a lead within its category.
 * Returns a Set — a lead can match multiple subtypes (e.g. hospital + diagnostic).
 * Falls back to the first defined subtype ("default" role) when no pattern matches.
 */
const detectSubtype = (lead, subtypeDefs) => {
  const name  = (lead.displayName?.text || '').toLowerCase();
  const addr  = (lead.formattedAddress  || '').toLowerCase();
  const types = (lead.types || []).join(' ').toLowerCase();
  const all   = `${name} ${addr} ${types}`;

  const matched = new Set();
  for (const { value, pattern } of subtypeDefs) {
    if (pattern && pattern.test(all)) matched.add(value);
  }
  // Fallback: nothing matched → assign the first subtype (e.g. 'retailer', 'dine_in', 'bank').
  if (matched.size === 0) matched.add(subtypeDefs[0].value);
  return matched;
};

/**
 * Filter leads by category-appropriate subtype.
 * subtype = '' → return all unchanged.
 * Works for every search category: products, restaurants, banks, hospitals, etc.
 * A lead can match multiple subtypes, so it appears under all relevant chips.
 *
 * @param {Array}  leads   — raw leads from searchBusinesses()
 * @param {string} type    — business type key (from the type dropdown)
 * @param {string} subtype — subtype value from getFilterChips()
 */
export const filterBySubtype = (leads, type, subtype) => {
  const key  = TYPE_TO_SUBTYPE_KEY[type] ?? 'product';
  const defs = SUBTYPE_DEFS[key]         ?? SUBTYPE_DEFS.product;

  // If a specific subtype chip is selected, filter strictly by that chip
  if (subtype) {
    return (leads || []).filter((lead) => detectSubtype(lead, defs).has(subtype));
  }

  // If NO chip is selected, but a specific main 'type' is selected (e.g., 'manufacturer'),
  // we filter strictly by that type. If 'Any type' (''), we pass all.
  if (key === 'product' && type && type !== '') {
    const targetSubtype = type === 'store' ? 'retailer' : type;
    return (leads || []).filter((lead) => detectSubtype(lead, defs).has(targetSubtype));
  }

  return leads || [];
};

export default { searchBusinesses, filterByPhoneNumber, filterByAddress, deduplicateResults, getFilterChips, filterBySubtype };