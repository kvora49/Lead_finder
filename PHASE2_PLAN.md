# Phase 2: Frontend Integration & Cloud Function Migration

**Status**: In Progress  
**Objective**: Transition from Google Places API to Cloud Function-based scraping

---

## Phase 2 Tasks

### Task 1: Create Refactored placesApi.js ✅ IN PROGRESS

**Goal**: Replace Google Places API calls with Cloud Function calls

**Changes**:
1. Replace `searchBusinesses()` to call `scrapeMapsTest` Cloud Function
2. Remove direct API key usage
3. Add Firestore caching layer
4. Maintain same function interface for compatibility

**Implementation**:
- Create new `searchBusinesses()` that calls `httpsCallable('scrapeMapsTest')`
- Add result caching to Firestore
- Add `searchCache` collection
- Implement cache expiry (7 days default)

---

### Task 2: Implement Firestore Cache Layer

**Schema**:
```firestore
searchCache/{queryHash}/
  - query: "restaurants in ahmedabad"
  - results: [...]
  - createdAt: timestamp
  - expiresAt: timestamp
  - hitCount: number
```

**Logic**:
1. Hash the query (keyword + location)
2. Check cache before scraping
3. Return cached results if fresh (< 7 days)
4. Store new results with expiry

---

### Task 3: Update Frontend to Use Cloud Functions

**Files to Update**:
1. `src/services/placesApi.js` - Main refactor
2. `src/App.jsx` - Update search call (if needed)
3. `src/components/LeadCard.jsx` - Display results

**Key Changes**:
- `searchBusinesses()` now returns Cloud Function result
- Same data structure maintained
- Error handling updated for Cloud Functions

---

### Task 4: Test with Real Queries

**Test Scenarios**:
1. ✅ Simple query: "restaurants in ahmedabad"
2. ✅ Location-specific: "coffee shops in mumbai"
3. ✅ Category search: "banks in delhi"
4. ✅ Cache hit test: Repeat same query
5. ✅ Error handling: Invalid query

---

## Implementation Order

1. **Today**: Refactor placesApi.js + Cache implementation
2. **Today**: Update App.jsx to handle new return format
3. **Today**: Manual testing with emulator
4. **Tomorrow**: Deploy to Firebase production

---

## Key Code Changes

### Before (Google Places API)
```javascript
const results = await googleMapsClient.placesTextSearch({
  query: keyword + ' ' + location,
  type: filterType,
  pagetoken: pageToken
});
```

### After (Cloud Functions)
```javascript
const results = await scrapeMapsTest({
  query: keyword + ' ' + location
});
```

---

## Success Criteria

- ✅ Cloud Function called successfully
- ✅ Results returned with correct structure
- ✅ Cache layer working (stores/retrieves results)
- ✅ Frontend displays results correctly
- ✅ Error handling works for all scenarios
- ✅ At least 20 results per query
- ✅ Zero cost ($0.00 spent)

---

## File Changes Summary

| File | Changes | Status |
|------|---------|--------|
| `src/services/placesApi.js` | Complete rewrite | ⏳ Todo |
| `src/App.jsx` | Minor updates | ⏳ Todo |
| `firestore.rules` | Add searchCache rules | ⏳ Todo |
| `firebase.json` | No changes | ✅ Done |
| `functions/index.js` | No changes | ✅ Done |

---

Let's begin!
