/**
 * Lead Finder — Places API Service  (Phase 3)
 *
 * Strategy: Dynamic Viewport Grid Sweep
 *   1. Geocode the user's location string → bounding box (viewport).
 *      Uses Geocoding REST API — CORS-enabled.
 *   2. Subdivide the viewport into an N×M grid of non-overlapping rectangles
 *      based on searchScope:
 *        city          → 3 cols × 3 rows =  9 cells
 *        neighbourhood → 2 cols × 2 rows =  4 cells
 *        specific      → 1 col  × 1 row  =  1 cell (original viewport, no split)
 *   3. For EACH rectangle, call searchQueryPaged with up to 3 pages (60 results max).
 *      Cells are staggered 400 ms apart to avoid OVER_QUERY_LIMIT (429).
 *   4. Aggressively deduplicate by place.id before caching or returning.
 *
 * Theoretical maximum per single search:
 *        city          → 9 cells × 3 variants × 3 pages × 20 = 540 raw  → 160–250 unique  (≈27 base calls)
 *        neighbourhood → 9 cells × 3 variants × 3 pages × 20 = 540 raw  → 100–180 unique  (≈27 base calls)
 *        specific      → 1 cell  × 3 variants × 3 pages × 20 =  60 raw  →  40–60  unique
 *
 * Zero-cost cache layer:
 *   • Before ANY API call we check `public_search_cache` in Firestore.
 *   • Cache TTL = CACHE_CONFIG.TTL_HOURS (default 24 h).
 *   • Fresh cache hit → return immediately, 0 Google API calls consumed.
 */

import { db } from '../firebase';
import {
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { GOOGLE_API_KEY, CACHE_CONFIG } from '../config';

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
].join(',');

// ── Grid dimensions per searchScope ──────────────────────────────────────────
// The ONLY variable that reliably increases unique yield is geographic cell
// count.  Each cell covers a different physical zone of the city so Google
// returns different top-20 businesses.  More variants on the same cell
// returns the same businesses (deduplicated → wasted calls).
//
// Target: 25 calls → 200+ unique
//   5×5 = 25 cells × 1 variant × 1 page = EXACTLY 25 API calls
//   25 × 20 raw = 500 raw → ~200–250 unique (different zone each cell)
//
// pagesPerCell = 1 for city locks the call count to exactly n_cells.
// Neighbourhood uses 2 pages (smaller area, want depth not breadth).
// ── Double-Lock Viewport Architecture ───────────────────────────────────────
// Lock 1 (Geo):  locationRestriction.rectangle = geocoder viewport grid cell.
//                Viewport is the exact bounding box Google keeps for each
//                named place — never a radius, never padded.
// Lock 2 (NLP):  Every textQuery ends with "in [location]".
//                Google's NLP sees an address in an adjacent locality and
//                ranks it below Maninagar results → bleed eliminated.
//
// Grid budgets — actual calls are EXACT for city (no paging variability):
//   city:          4×4 = 16 cells × 2 queries × 1 page  = EXACTLY 32 calls
//   neighbourhood: 4×3 = 12 cells × 2 queries × ≤3 pages = ≤72  max (~24-32 actual)
//   specific:      1×1 =  1 cell  × 3 queries × ≤3 pages = ≤9   max (~3-6  actual)
//
// City uses pagesPerCell=1 so every (cell, query) pair fires ONCE and stops.
// 16 cells × 2 variants = 32 calls exactly, regardless of result count.
// 32 calls × up to 20 raw = 640 raw → ~250-280 unique after dedup.
//
// Neighbourhood: 12 cells × 2 variants with seenIds exits → ~24-32 actual calls.
// More cells = smaller micro-zones = less overlap on dedup → 100+ unique results.
// Specific: 3 variants for maximum depth on a single point.
const GRID_CONFIG = {
  city:          { cols: 4, rows: 4, pagesPerCell: 1 },
  neighbourhood: { cols: 4, rows: 3, pagesPerCell: 3 },
  specific:      { cols: 1, rows: 1, pagesPerCell: 3 },
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
// "Any type" uses 4 orthogonal variants for maximum yield:
//   bare kw + shop + wholesaler + dealer  (36 base calls → 250–300+ unique)
//
// Specific types use 2–3 targeted variants + includedType API restriction,
// which is both more accurate and more efficient (18–27 base calls).
//
// KEY FIX: previously `type` only affected the cache key; the API never
// saw it.  Now `includedType` is sent in the POST body for native types,
// so "Store / Shop" actually excludes pure manufacturers/wholesalers.
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

/**
 * Build NLP-locked query variants for a given search.
 *
 * Lock 2: every variant ends with "in [location]".
 * Google's ranking then biases toward businesses actually IN that location.
 *
 * Variant count per scope:
 *   city:                    2  (bare, shop)          — geographic cells do the work
 *   neighbourhood/specific:  3  (bare, shop, wholesaler / type suffix)
 *
 * @param {string} keyword      — e.g. "kurti"
 * @param {string} location     — the geocoded location string, e.g. "maninagar, ahmedabad"
 * @param {string} searchScope  — 'city' | 'neighbourhood' | 'specific'
 * @param {string} type         — business type key (from INCLUDED_TYPE_MAP)
 * @returns {string[]} array of textQuery strings
 */
const buildQueries = (keyword, location, searchScope, type) => {
  const kw  = keyword.trim();
  const loc = location.trim();

  let all;
  if (type === 'manufacturer') {
    all = [
      `${kw} manufacturer in ${loc}`,
      `${kw} factory in ${loc}`,
      `${kw} production in ${loc}`,
    ];
  } else if (type === 'wholesaler') {
    all = [
      `${kw} wholesaler in ${loc}`,
      `${kw} wholesale in ${loc}`,
      `${kw} distributor in ${loc}`,
    ];
  } else {
    // Any type or native-typed (store, restaurant, etc.)
    // NLP Lock: always append "in [location]" so Google biases toward
    // businesses whose address / name / reviews mention that location.
    all = [
      `${kw} in ${loc}`,
      `${kw} shop in ${loc}`,
      `${kw} wholesaler in ${loc}`,
    ];
  }

  // City/Neighbourhood: 2 variants (more cells do the yield work, not more queries).
  // Specific: all 3 variants with adaptive paging for maximum depth on single point.
  return searchScope === 'specific' ? all : all.slice(0, 2);
};

// ── Types that are clearly unrelated to any general business search ──────────
// Used by the post-fetch relevance filter (step 7) to remove results whose
// only specific Google category is obviously wrong (e.g. a jewellery shop
// inside a kurti market complex that matched via address proximity).
// Strategy: Google gives each place a `types` array.  We ignore generic
// types (establishment, store, point_of_interest) and check the specific
// ones.  If EVERY specific type is in this set → the place is unrelated.
// Conservative by design: places with no types or all-generic types are kept.
const GENERIC_PLACE_TYPES = new Set([
  'point_of_interest', 'establishment', 'store', 'shopping_mall', 'market',
]);
const UNRELATED_PLACE_TYPES = new Set([
  // Jewellery / luxury
  'jewelry_store',
  // Finance
  'bank', 'atm', 'finance', 'accounting', 'insurance_agency',
  // Automotive
  'car_dealer', 'car_rental', 'car_repair', 'car_wash', 'auto_parts_store',
  'parking', 'gas_station',
  // Food & drink
  'restaurant', 'cafe', 'bar', 'food', 'bakery', 'meal_delivery',
  'meal_takeaway', 'liquor_store',
  // Health / medical
  'hospital', 'doctor', 'dentist', 'pharmacy', 'drugstore',
  'physiotherapist', 'veterinary_care',
  // Accommodation
  'lodging', 'hotel', 'motel',
  // Entertainment
  'movie_theater', 'night_club', 'amusement_park', 'casino',
  'bowling_alley', 'stadium', 'zoo', 'aquarium', 'art_gallery', 'museum',
  // Personal care
  'beauty_salon', 'hair_care', 'spa', 'nail_salon',
  // Education
  'school', 'university', 'library',
  // Travel / transit
  'airport', 'bus_station', 'train_station', 'transit_station', 'subway_station',
  // Religious / civic
  'church', 'mosque', 'hindu_temple', 'place_of_worship', 'cemetery',
]);

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

  console.log(
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
      console.log('[cache] expired →', cacheKey);
      return null;
    }

    console.log('[cache] HIT →', cacheKey, `(${data.results?.length ?? 0} results)`);
    // Bump hit counter — fire-and-forget, never blocks caller
    setDoc(ref, { hitCount: (data.hitCount || 0) + 1 }, { merge: true }).catch(() => {});
    return data;
  } catch (err) {
    console.warn('[cache] read error, bypassing cache:', err.message);
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
    console.log('[cache] WRITE →', cacheKey, `(${results.length} results)`);
  } catch (err) {
    console.warn('[cache] write error (non-fatal):', err.message);
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
const geocodeLocation = async (location) => {
  const url  = `${GEO_BASE}?address=${encodeURIComponent(location)}&key=${GOOGLE_API_KEY}`;
  const res  = await fetch(url);
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
  console.log(
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
const searchQueryPage = async (textQuery, rectangle, pageToken = null, includedType = null) => {
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
    });
  } catch (networkErr) {
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
const searchQueryPaged = async (textQuery, rectangle, maxPages = PAGES_PER_CELL_DEFAULT, includedType = null, seenIds = null) => {
  const allPlaces = [];
  let pageToken   = null;
  let callCount   = 0;

  for (let p = 0; p < maxPages; p++) {
    // 400 ms stagger before every page except the first of the first cell
    // (outer stagger handles the first call; inner handles subsequent pages).
    if (p > 0) await new Promise((r) => setTimeout(r, CALL_STAGGER_MS));

    const { places, nextPageToken } = await searchQueryPage(textQuery, rectangle, pageToken, includedType);
    callCount++;
    allPlaces.push(...places);

    // New-unique count for this page (uses seenIds snapshot from prior cells/queries).
    // Measures how many results on THIS page haven't been collected yet.
    const pageNewUniques = seenIds
      ? places.filter(pl => pl.id && !seenIds.has(pl.id)).length
      : places.length;

    console.log(`[cell-page] page ${p + 1} → ${places.length} raw, ${pageNewUniques} new unique | nextToken=${!!nextPageToken}`);

    // Three adaptive early-exit conditions (minimum API calls):
    //   1. No more pages from Google.
    //   2. Sparse page (< 20) — Google is running out of results in this cell.
    //   3. Zero new uniques — all results already collected from prior cells.
    if (!nextPageToken || places.length < 20 || pageNewUniques === 0) break;
    pageToken = nextPageToken;
  }

  console.log(`[cell] total ${allPlaces.length} raw results across ${callCount} page(s)`);
  return { places: allPlaces, callCount };
};

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT HELPER
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a Places API v1 result object into a consistent lead shape */
const formatPlace = (p) => ({
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
  source:              'places-v1-grid',   // marks Phase 3 grid results
});

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
  } = options;

  if (!keyword?.trim() || !location?.trim()) {
    throw new Error('keyword and location are required');
  }

  const areaStr      = area.trim();
  const cityStr      = location.trim();
  const fullLocation = areaStr ? `${areaStr}, ${cityStr}` : cityStr;

  // NLP Fix: query strings are semantic variants — the locationRestriction
  // rectangle is the geographic anchor.  Each type gets its own optimised
  // variant set via TYPE_SEARCH_CONFIG; the includedType (when non-null) is
  // passed through to the Places API to restrict results at source.
  // Lock 2 (NLP): buildQueries appends "in [location]" to every variant.
  // For neighbourhood/specific the location is "area, city"; for city it's just city.
  // This ensures Google's NLP biases toward businesses IN that exact place.
  const queries      = buildQueries(keyword.trim(), fullLocation, searchScope, type);
  const includedType = INCLUDED_TYPE_MAP[type] ?? null;

  const { cols, rows, pagesPerCell = PAGES_PER_CELL_DEFAULT } = GRID_CONFIG[searchScope] ?? GRID_CONFIG.city;
  const totalCalls = queries.length * (cols * rows) * pagesPerCell;   // theoretical max
  console.log(
    `[search] scope=${searchScope} | grid=${cols}x${rows}=${cols*rows} cells`,
    `| ${queries.length} variants | budget≤${totalCalls} calls`,
    `| location="${fullLocation}"`,
  );

  // ── 1. Cache check ─────────────────────────────────────────────────────────
  // v9: 5×5=25 cells × 1 variant × 1 page = exactly 25 API calls → 200+ unique.
  //     pagesPerCell now per-scope in GRID_CONFIG (city=1, nbhd=2, specific=3).
  const cacheKey = makeCacheKey(keyword.trim(), fullLocation, `${type}:${searchScope}:matrixv21`);

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

  const geo = await geocodeLocation(fullLocation);

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
  const geoFenceBounds = searchScope !== 'city' ? geo.viewport : null;
  console.log(
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
  let totalApiCalls = 0;
  let callIdx       = 0;   // counts (cell, variant) pairs dispatched

  for (const rectangle of gridBoxes) {
    for (const query of queries) {
      // 400 ms stagger before every call except the very first
      if (callIdx > 0) await new Promise((r) => setTimeout(r, CALL_STAGGER_MS));

      // Pass `seen` so searchQueryPaged can exit pages early when all results
      // on a page are already collected (zero-yield page exit, saves pages 2-3).
      const { places, callCount } = await searchQueryPaged(query, rectangle, pagesPerCell, includedType, seen);
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

      console.log(
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

  console.log(`[search] grid sweep complete | ${totalApiCalls} API calls -> ${allLeads.length} unique places`);

  // ── 6. Geographic fence filter (neighbourhood & specific scopes only) ──────
  // For city scope the full-city grid is the intent — no filtering needed.
  // For neighbourhood/specific we filter by the geocoder's `bounds` bbox
  // (the administrative boundary of e.g. "Maninagar") rather than the
  // wider viewport.  bounds is typically 30–50% smaller than viewport for
  // Indian localities, which is exactly what excludes Isanpur / Saraspur.
  // A 5% grace margin retains businesses sitting right on the boundary edge.
  // Places without coordinates are kept (conservative fallback, rare).
  let finalLeads = allLeads;
  if (geoFenceBounds) {
    // Neighbourhood/specific: strict bbox filter using the same radius box.
    // 0% margin — if a place is outside the radius box it's excluded.
    // Places without coordinates are kept (conservative fallback, rare).
    const fence  = geoFenceBounds;
    const before = allLeads.length;
    finalLeads = allLeads.filter((lead) => {
      if (lead.lat == null || lead.lng == null) return true;
      return lead.lat >= fence.sw.lat
          && lead.lat <= fence.ne.lat
          && lead.lng >= fence.sw.lng
          && lead.lng <= fence.ne.lng;
    });
    console.log(
      `[geo-fence] ${before} → ${finalLeads.length} results after strict radius filter`,
      `| sw=(${fence.sw.lat.toFixed(5)},${fence.sw.lng.toFixed(5)})`,
      `  ne=(${fence.ne.lat.toFixed(5)},${fence.ne.lng.toFixed(5)})`,
    );
  }

  // ── 7. Relevance filter — remove clearly unrelated business categories ───
  // The Places API textQuery matches on name, address, reviews and nearby
  // context, so a jewellery shop inside a kurti market complex can appear
  // in results for "kurti".  We use each result's `types` (assigned by
  // Google) to detect and remove obvious category mismatches.
  // Conservative: only removes places where ALL specific types are unrelated.
  const beforeRelevance = finalLeads.length;
  finalLeads = finalLeads.filter((lead) => {
    const types    = lead.types || [];
    if (types.length === 0) return true;                    // no type info → keep
    const specific = types.filter(t => !GENERIC_PLACE_TYPES.has(t));
    if (specific.length === 0) return true;                 // all-generic → keep
    return !specific.every(t => UNRELATED_PLACE_TYPES.has(t)); // any specific relevant type → keep
  });
  console.log(`[relevance] ${beforeRelevance} → ${finalLeads.length} after removing unrelated categories`);

  // ── 8. Cache write (fire-and-forget) ──────────────────────────────────────
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
  const { onProgress = null } = options;

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
  const allResponses = await Promise.all(
    pairs.map(async ({ kw, loc }) => {
      const res = await _searchSingle(kw, loc, { ...options, onProgress: null });
      done++;
      if (onProgress) {
        onProgress({
          phase:   'searching',
          message: `Completed ${done}/${total} — "${kw}" in ${loc}`,
          current: done, total, found: 0, apiCalls: 0,
        });
      }
      return res;
    })
  );

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
    { value: 'retailer',      label: 'Retailer',        hint: 'Shops, stores, showrooms, outlets',              pattern: null },
    { value: 'wholesaler',    label: 'Wholesaler',       hint: 'Wholesale markets, bulk dealers',                pattern: /wholesal|\bthok\b|bulk\s*(deal|sale|trade|suppl)|whole\s*sale/ },
    { value: 'distributor',   label: 'Distributor',      hint: 'Distributors, stockists, authorised agents',     pattern: /distribut|stockist|\bc\s*[&]\s*f\b|authoris[ae]d\s*(dealer|distribut)|sole\s*(agent|distribut)|supply\s*(house|co\.?)|\bsupplier/ },
    { value: 'manufacturer',  label: 'Manufacturer',     hint: 'Factories, industries, fabricators',             pattern: /manufactur|\bfactory\b|\bindustr(ies|ial|y)\b|\bfabricat|\bmfg\.?\b|\bproducer|\bproduction\b|\bworks\b/ },
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
  if (!subtype) return leads;
  const key  = TYPE_TO_SUBTYPE_KEY[type] ?? 'product';
  const defs = SUBTYPE_DEFS[key]         ?? SUBTYPE_DEFS.product;
  return (leads || []).filter((lead) => detectSubtype(lead, defs).has(subtype));
};

export default { searchBusinesses, filterByPhoneNumber, filterByAddress, deduplicateResults, getFilterChips, filterBySubtype };