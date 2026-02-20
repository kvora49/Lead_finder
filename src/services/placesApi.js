/**
 * Lead Finder — Places API Service  (Phase 2)
 *
 * Strategy: Dynamic Grid Search
 *   1. Geocode the user's location string → bounding box (viewport).
 *      Uses Geocoding REST API — CORS-enabled.
 *   2. Divide the viewport into an NxN grid of overlapping circles.
 *   3. Fire one NEW Places API v1 `searchText` call per cell (parallel, rate-limited).
 *      New Places API v1 (places.googleapis.com) explicitly supports browser CORS;
 *      the old REST endpoint (maps.googleapis.com/maps/api/place/*) does NOT.
 *   4. Deduplicate all results by place id.
 *
 * Zero-cost cache layer:
 *   • Before ANY API call we check `public_search_cache` in Firestore.
 *   • Cache TTL = CACHE_CONFIG.TTL_HOURS (default 24 h).
 *   • If fresh cache hit → return immediately, 0 Google API calls consumed.
 */

import { db } from '../firebase';
import {
  doc, getDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { GOOGLE_API_KEY, CACHE_CONFIG } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Geocoding REST API — supports browser CORS
const GEO_BASE = 'https://maps.googleapis.com/maps/api/geocode/json';

// New Places API v1 — POST endpoint, supports browser CORS
// (The old /maps/api/place/nearbysearch/json does NOT allow browser fetch)
const PLACES_V1_TEXT = 'https://places.googleapis.com/v1/places:searchText';

// Field mask — controls which fields are returned (billed per field group)
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

const MAX_PARALLEL_CALLS = 10;   // fire all queries at once

// Scope config: variants = number of query phrasings, pages = pagination depth.
// Each call returns up to 20 results. Pagination fetches the next 20 via nextPageToken.
// Total raw results = variants × pages × 20.
//   city:          10 × 3 pages = 30 calls → 600 raw → 200-300 unique
//   neighbourhood: 10 × 2 pages = 20 calls → 400 raw → 150-200 unique
//   specific:       6 × 1 page  =  6 calls → 120 raw →  60-100 unique
const SCOPE_CONFIG = {
  city:          { variants: 10, pages: 3 },
  neighbourhood: { variants: 10, pages: 2 },
  specific:      { variants:  6, pages: 1 },
};

/**
 * Build N query phrasings. Each phrasing surfaces a different subset of
 * Google's index for the same location — retail-tagged, wholesale-tagged,
 * manufacturer-tagged etc. are stored as separate index entries.
 */
const buildQueries = (keyword, fullLocation, count) => {
  const kw  = keyword.trim();
  const loc = fullLocation.trim();
  const suffixes = [
    '',            // "kurti in Maninagar, Ahmedabad"       — general
    'shop',        // "kurti shop in …"                    — retail
    'store',       // "kurti store in …"                   — shopping
    'supplier',    // "kurti supplier in …"                — wholesale supply
    'wholesaler',  // "kurti wholesaler in …"              — B2B wholesale
    'manufacturer',// "kurti manufacturer in …"            — production
    'dealer',      // "kurti dealer in …"                  — dealer/distributor
    'boutique',    // "kurti boutique in …"                — boutique/designer
    'market',      // "kurti market in …"                  — market/bazaar
    'outlet',      // "kurti outlet in …"                  — factory outlet/clearance
  ];
  return suffixes
    .slice(0, count)
    .map((s) => s ? `${kw} ${s} in ${loc}` : `${kw} in ${loc}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// CACHE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic cache key from search params */
const makeCacheKey = (keyword, location, type) => {
  const raw = `${keyword.toLowerCase().trim()}|${location.toLowerCase().trim()}|${(type || '').toLowerCase().trim()}`;
  // Simple but consistent base-64 key (URL-safe characters only)
  return btoa(unescape(encodeURIComponent(raw))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 60);
};

/** Return cached doc data if fresh, else null */
const readCache = async (cacheKey) => {
  try {
    const ref  = doc(db, CACHE_CONFIG.COLLECTION, cacheKey);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const data       = snap.data();
    const cachedAt   = data.cachedAt?.toMillis?.() ?? (data.cachedAt || 0);
    const ttlMs      = CACHE_CONFIG.TTL_HOURS * 60 * 60 * 1000;
    const isExpired  = Date.now() - cachedAt > ttlMs;

    if (isExpired) {
      console.log('[cache] expired →', cacheKey);
      return null;
    }

    console.log('[cache] HIT →', cacheKey, `(${data.results?.length ?? 0} results)`);
    // Bump hit counter fire-and-forget
    setDoc(ref, { hitCount: (data.hitCount || 0) + 1 }, { merge: true }).catch(() => {});
    return data;
  } catch (err) {
    console.warn('[cache] read error, bypassing cache:', err.message);
    return null;
  }
};

/** Write results to cache (fire-and-forget; never blocks search) */
const writeCache = async (cacheKey, keyword, location, results) => {
  try {
    const ref = doc(db, CACHE_CONFIG.COLLECTION, cacheKey);
    await setDoc(ref, {
      query:    keyword,
      location: location,
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
 * Geocode a location string → { lat, lng, viewport: {ne, sw} }
 * Uses the Geocoding REST API.
 */
const geocodeLocation = async (location) => {
  const url = `${GEO_BASE}?address=${encodeURIComponent(location)}&key=${GOOGLE_API_KEY}`;
  const res  = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' || !data.results.length) {
    throw new Error(`Geocoding failed for "${location}": ${data.status}`);
  }

  const r  = data.results[0];
  const vp = r.geometry.viewport;

  return {
    lat:      r.geometry.location.lat,
    lng:      r.geometry.location.lng,
    viewport: {
      ne: { lat: vp.northeast.lat, lng: vp.northeast.lng },
      sw: { lat: vp.southwest.lat, lng: vp.southwest.lng },
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// PLACES API — SINGLE QUERY CALL  (full viewport, locationBias)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One searchText call (single page) — internal helper used by searchQueryPaged.
 * Returns { places, nextPageToken }.
 */
const searchQueryPage = async (textQuery, viewport, pageToken = null) => {
  const body = {
    textQuery,
    maxResultCount: 20,
    locationRestriction: {
      rectangle: {
        low:  { latitude: viewport.sw.lat, longitude: viewport.sw.lng },
        high: { latitude: viewport.ne.lat, longitude: viewport.ne.lng },
      },
    },
  };
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
 * Fetch up to `maxPages` pages for a single query.
 * Page 1 fires immediately; pages 2+ follow the nextPageToken chain.
 * Each page = 1 API call, up to 20 results.
 */
const searchQueryPaged = async (textQuery, viewport, maxPages = 1) => {
  const allPlaces = [];
  let pageToken   = null;
  let callCount   = 0;

  for (let p = 0; p < maxPages; p++) {
    const { places, nextPageToken } = await searchQueryPage(textQuery, viewport, pageToken);
    callCount++;
    allPlaces.push(...places);
    console.log(`[query] "${textQuery}" page ${p + 1} → ${places.length} results`);

    if (!nextPageToken) break;   // Google has no more results for this query
    pageToken = nextPageToken;

    // Brief pause between pages — Google recommends a short delay before
    // consuming a nextPageToken to avoid INVALID_ARGUMENT errors.
    if (p < maxPages - 1) await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[query] "${textQuery}" total ${allPlaces.length} across ${callCount} page(s)`);
  return { places: allPlaces, callCount };
};

// ─────────────────────────────────────────────────────────────────────────────
// PARALLEL QUERY RUNNER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fire all queries simultaneously (each with up to maxPages pages).
 * Wall-clock time ≈ maxPages sequential HTTP calls (pages within a query are
 * sequential due to nextPageToken; queries across variants are parallel).
 * Merge and deduplicate by place id.
 */
const runQuerySearch = async (queries, viewport, onProgress, maxPages = 1) => {
  const seen     = new Set();
  const allLeads = [];
  const totalExpected = queries.length * maxPages;

  if (onProgress) {
    onProgress({
      phase: 'searching',
      message: `Running ${queries.length} queries × ${maxPages} page(s)…`,
      current: 0, total: totalExpected, found: 0, apiCalls: 0,
    });
  }

  // All query variants fire in parallel; pagination within each is sequential.
  const allResults = await Promise.all(
    queries.map((q) => searchQueryPaged(q, viewport, maxPages))
  );

  let totalCalls = 0;
  allResults.forEach(({ places, callCount }) => {
    totalCalls += callCount;
    places.forEach((p) => {
      if (p.id && !seen.has(p.id)) {
        seen.add(p.id);
        allLeads.push(formatPlace(p));
      }
    });
  });

  if (onProgress) {
    onProgress({
      phase: 'searching',
      message: `Done — ${allLeads.length} unique results from ${totalCalls} API call(s)`,
      current: totalCalls, total: totalCalls,
      found: allLeads.length, apiCalls: totalCalls,
    });
  }

  console.log(`[search] ${totalCalls} API calls → ${allLeads.length} unique places`);
  return { leads: allLeads, apiCalls: totalCalls };
};

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise a New Places API v1 result into a consistent lead object.
 * v1 field names differ from the old REST API:
 *   id (not place_id), displayName.text, internationalPhoneNumber, location.latitude/longitude
 */
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
  source:              'places-v1-text',
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main search entry point.
 *
 * Flow:
 *   cache check → geocode → build grid → parallel cell searches → dedup → cache write
 *
 * @param {string}   keyword     Business type / keyword (e.g. "kurti retailer")
 * @param {string}   location    City / region (e.g. "Ahmedabad")
 * @param {object}   [options]
 * @param {string}   [options.type]       Google Places type filter (e.g. "store")
 * @param {Function} [options.onProgress] Called with progress updates
 * @returns {Promise<{ results, apiCalls, cached, totalResults }>}
 */
// Internal single-pair search — used by both the fast path and the multi-search loop.
const _searchSingle = async (keyword, location, options = {}) => {
  const {
    type        = '',
    searchScope = 'city',   // 'city' | 'neighbourhood' | 'specific'
    area        = '',       // neighbourhood name OR building/market/street name
    onProgress  = null,
  } = options;

  if (!keyword?.trim() || !location?.trim()) {
    throw new Error('keyword and location are required');
  }

  // ── Resolve scope config (radius + max grid cells) ─────────────────────────
  const cfg = SCOPE_CONFIG[searchScope] ?? SCOPE_CONFIG.city;

  // ── Build enriched geocode target + textQuery ──────────────────────────────
  // CRITICAL: sending just the bare keyword (e.g. "kurti") without location
  // context produces very poor relevance even with locationRestriction.
  // Always embed location into the textQuery for best results.
  const areaStr      = area.trim();
  const cityStr      = location.trim();
  const fullLocation = areaStr ? `${areaStr}, ${cityStr}` : cityStr;

  const queries = buildQueries(keyword.trim(), fullLocation, cfg.variants);
  console.log(`[search] scope=${searchScope} | ${cfg.variants} queries for "${fullLocation}"`);

  // ── 1. Cache check ─────────────────────────────────────────────────────────
  const cacheKey = makeCacheKey(queries[0], fullLocation, `${type}:${searchScope}`);

  if (onProgress) onProgress({ phase: 'cache', message: 'Checking cache…', current: 0, total: 1 });

  const cached = await readCache(cacheKey);
  if (cached?.results) {
    if (onProgress) onProgress({ phase: 'done', message: 'Loaded from cache', found: cached.results.length, cached: true });
    return {
      results:      cached.results,
      apiCalls:     0,
      cached:       true,
      totalResults: cached.results.length,
    };
  }

  // ── 2. Geocode ──────────────────────────────────────────────────────────────
  if (onProgress) onProgress({ phase: 'geocoding', message: `Locating "${fullLocation}"…`, current: 0, total: 1 });

  const geo = await geocodeLocation(fullLocation);

  // ── 3. Run parallel queries with pagination ────────────────────────────────
  // All variant queries fire simultaneously; each fetches up to cfg.pages pages.
  const { leads, apiCalls } = await runQuerySearch(queries, geo.viewport, onProgress, cfg.pages ?? 1);

  // ── 5. Cache write ──────────────────────────────────────────────────────────
  if (leads.length > 0) {
    writeCache(cacheKey, queries[0], fullLocation, leads);   // fire-and-forget
  }

  if (onProgress) onProgress({ phase: 'done', message: `Found ${leads.length} businesses`, found: leads.length, cached: false });

  return {
    results:      leads,
    apiCalls,
    cached:       false,
    totalResults: leads.length,
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
 *   → 4 searches in parallel (2 keywords × 2 locations)
 *
 * Algorithm:
 *   1. Split keyword + location by comma into arrays.
 *   2. Build every (keyword, location) pair.
 *   3. Run all pairs concurrently via Promise.all — each pair is cache-first.
 *   4. Flatten + aggressively deduplicate by place_id.
 *
 * Single keyword + single location → full cache-first fast path (unchanged).
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

  // ── Multi: build all (keyword × location) pairs ──────────────────────────
  const pairs = [];
  for (const loc of locations) {
    for (const kw of keywords) {
      pairs.push({ kw, loc });
    }
  }
  const total = pairs.length;

  if (onProgress) {
    onProgress({
      phase: 'start',
      message: `Queuing ${total} searches (${keywords.length} keyword${keywords.length > 1 ? 's' : ''} × ${locations.length} location${locations.length > 1 ? 's' : ''})…`,
      current: 0, total, found: 0, apiCalls: 0,
    });
  }

  // Each pair runs concurrently; each individually checks its own cache first.
  let done = 0;
  const allResponses = await Promise.all(
    pairs.map(async ({ kw, loc }) => {
      const res = await _searchSingle(kw, loc, { ...options, onProgress: null });
      done++;
      if (onProgress) {
        onProgress({
          phase: 'searching',
          message: `Completed ${done}/${total} — "${kw}" in ${loc}`,
          current: done, total, found: 0, apiCalls: 0,
        });
      }
      return res;
    })
  );

  // ── Flatten + deduplicate by place_id ────────────────────────────────────
  const seen     = new Set();
  const combined = [];
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
      phase: 'done',
      message: `Found ${combined.length} unique businesses across ${total} search${total > 1 ? 'es' : ''}`,
      found: combined.length, apiCalls: totalApiCalls, cached: false,
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
// FILTER / DEDUP UTILITIES  (retained for Phase 3 / 4 compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/** Keep only leads that have a phone number */
export const filterByPhoneNumber = (leads, requirePhone = false) => {
  if (!requirePhone || !Array.isArray(leads)) return leads || [];
  return leads.filter((l) => l?.nationalPhoneNumber?.trim());
};

/** Keep only leads that have an address */
export const filterByAddress = (leads, requireAddress = false) => {
  if (!requireAddress || !Array.isArray(leads)) return leads || [];
  return leads.filter((l) => l?.formattedAddress?.trim());
};

/** Remove duplicates by place_id, phone, or name (in that priority order) */
export const deduplicateResults = (leads) => {
  const seen = new Set();
  return (leads || []).filter((l) => {
    const key = l.placeId || l.nationalPhoneNumber?.trim()
              || l.displayName?.text?.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default { searchBusinesses, filterByPhoneNumber, filterByAddress, deduplicateResults };
