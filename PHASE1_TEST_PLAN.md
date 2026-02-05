# Phase 1: Testing & Validation

## Test Objectives
1. ✅ Verify Cloud Functions are callable
2. ✅ Test Puppeteer-Stealth scraping logic
3. ✅ Validate data extraction accuracy
4. ✅ Check human-mimicry features
5. ✅ Identify any IP blocking or rate limiting issues
6. ✅ Measure performance and memory usage

---

## Test 1: Hello World Function (Baseline)

**Endpoint**: `http://127.0.0.1:5001/lead-finder-6b009/us-central1/helloWorld`

**Test**: Simple GET request to verify functions are running

**Expected Result**: 
```
"Hello from Firebase!"
```

**Status**: ⏳ Pending

---

## Test 2: Scrape Test Function (Core Feature)

**Endpoint**: `http://127.0.0.1:5001/lead-finder-6b009/us-central1/scrapeMapsTest`

**Request Body**:
```json
{
  "data": {
    "query": "restaurants in ahmedabad"
  }
}
```

**Expected Response**:
```json
{
  "success": true,
  "query": "restaurants in ahmedabad",
  "resultsCount": 10-50,
  "leads": [
    {
      "name": "Restaurant Name",
      "rating": "4.5 (1,234)",
      "address": "Address here",
      "source": "Google Maps"
    }
  ],
  "scrapedAt": "2026-02-05T...",
  "cost": "$0.00"
}
```

**Test Scenarios**:
- [ ] Test 1: Single query with common search term
- [ ] Test 2: Query with location specificity
- [ ] Test 3: Verify result count > 20 (vs API's ~20)
- [ ] Test 4: Check deduplication (no duplicate names)
- [ ] Test 5: Validate data fields populated

**Status**: ⏳ Pending

---

## Test 3: Performance & Resource Usage

**Metrics to Monitor**:
- ⏳ Function execution time
- ⏳ Memory usage (target: < 350MB of 512MB)
- ⏳ Browser startup time
- ⏳ Page load time
- ⏳ Scroll time

**Expected Results**:
- Total time: 15-30 seconds (acceptable for scraping)
- Memory: < 350MB
- Results: 20-50 per query

---

## Test 4: Error Handling

**Scenarios**:
- [ ] Missing query parameter → Error response
- [ ] Timeout scenario → Graceful cleanup
- [ ] Invalid query → Returns 0 results
- [ ] Network error → Proper error logging

---

## Test 5: Stealth Features Validation

**Check**:
- [ ] Random User-Agent applied
- [ ] Viewport randomization working
- [ ] Delays between actions (2-5s)
- [ ] No "bot detected" errors

---

## Success Criteria for Phase 1

| Criteria | Status | Notes |
|----------|--------|-------|
| Functions deploy without errors | ⏳ | |
| Hello World returns response | ⏳ | |
| Scraper launches browser successfully | ⏳ | |
| Scraper navigates to Google Maps | ⏳ | |
| Scraper extracts business data | ⏳ | |
| Results > 20 per query | ⏳ | |
| No IP blocking detected | ⏳ | |
| Memory usage < 350MB | ⏳ | |
| Function completes in < 45 seconds | ⏳ | |
| Error handling works | ⏳ | |

---

## Test Commands

### 1. Test Hello World
```bash
curl "http://127.0.0.1:5001/lead-finder-6b009/us-central1/helloWorld"
```

### 2. Test Scraper (using Node.js)
```javascript
const functions = require('firebase-functions');
const test = require('firebase-functions-test');

// Initialize test
const testEnv = test();

// Import the function
const myFunctions = require('../functions');

// Call the function
myFunctions.scrapeMapsTest({ data: { query: "restaurants in ahmedabad" } })
  .then(result => console.log(result))
  .catch(error => console.error(error));
```

---

## Next Steps

After passing all tests:
1. Document any issues found
2. Fix identified problems
3. Proceed to Phase 2: Frontend Integration
