# Phase 1: Migration Assessment & Planning

**Date:** February 5, 2026  
**Project:** Universal Business Lead Finder  
**Migration Goal:** Transition from Google Places API to Scraper-Based Approach

---

## 1. Current System Analysis

### 1.1 Firebase Infrastructure
- **Project ID:** lead-finder-6b009
- **Current Services:** 
  - ✅ Firestore Database (active)
  - ✅ Firebase Hosting (active)
  - ✅ Firebase Authentication (active)
  - ❌ Cloud Functions (NOT configured)
- **Plan Status:** Need to verify if Blaze Plan is active

### 1.2 Current API Implementation
**File:** `src/services/placesApi.js`

**Current Approach:**
- Using Google Places API (New) with Text Search
- Client-side execution (API key exposed in browser)
- Pagination: Max 10 pages × 20 results = 200 results theoretical max
- **Actual bottleneck:** Google typically returns 60-80 results before `nextPageToken` disappears

**Current Cost Structure:**
```
Cost per API call: $0.032 (Text Search)
Average calls per search: 3-5 pages
Cost per search: ~$0.096 - $0.160
Monthly limit: $6.24 / $0.032 = 195 API calls
```

### 1.3 Current Data Flow
```
User Input → App.jsx → placesApi.js → Google API → Client-side processing → Display
```

**Problems:**
1. API key exposed in client code
2. Limited to ~60 results per search
3. No email/social media extraction
4. High cost per lead ($0.001-$0.002 per lead)

---

## 2. Migration Requirements

### 2.1 Technical Prerequisites

**Firebase Blaze Plan Required:**
- Cloud Functions require pay-as-you-go billing
- **Action Required:** Check current plan at https://console.firebase.google.com/project/lead-finder-6b009/usage

**Development Environment:**
- Node.js 18+ (for Firebase Functions)
- Firebase CLI (already installed ✅)
- Git (already configured ✅)

### 2.2 Scraping Provider Options

| Provider | Cost per 1000 Results | Proxy Management | Email Extraction | Best For |
|----------|----------------------|------------------|------------------|----------|
| **Outscraper** | $2-5 | ✅ Included | ✅ Yes | Google Maps focused |
| **Apify** | $3-7 | ✅ Included | ✅ Yes | Flexible, multi-platform |
| **ScrapingBee** | $4-8 | ✅ Included | ❌ No | General web scraping |
| **Bright Data** | $5-10 | ✅ Premium | ✅ Yes | Enterprise scale |

**Recommendation:** Start with **Outscraper** for Google Maps
- Specialized for Google Maps scraping
- Residential proxy rotation included
- Email/social extraction built-in
- Lowest cost per result
- **Estimated cost:** $0.002-0.005 per lead (90% reduction)

---

## 3. Architecture Design

### 3.1 New Data Flow
```
User Input → Frontend → Cloud Function → Scraping API → Cloud Function (dedupe/cache) → Frontend
                                    ↓
                              Firestore Cache
```

### 3.2 Required Cloud Functions

**Function 1: `searchLeads`**
- Accept: `{ keyword, location, category }`
- Check Firestore cache (24hr TTL)
- If no cache: call Outscraper API
- Deduplicate results
- Store in cache
- Return to frontend

**Function 2: `exportLeads`**
- Accept: `{ leadIds[] }`
- Generate Excel file server-side
- Upload to Firebase Storage
- Return download URL
- Auto-delete after 1 hour

**Function 3: `enrichLeads`** (Optional Phase 2)
- Accept: `{ leadId }`
- Scrape business website for additional data
- Update Firestore with enriched data

### 3.3 Firestore Collections

**New Collections:**
```
searchCache/{searchId}
  - query: string
  - location: string
  - results: array
  - createdAt: timestamp
  - expiresAt: timestamp

scrapingJobs/{jobId}
  - userId: string
  - status: "pending" | "running" | "completed" | "failed"
  - progress: number
  - totalLeads: number
  - cost: number
  - createdAt: timestamp

systemConfig/scraping
  - apiProvider: "outscraper"
  - apiKey: encrypted
  - costPerLead: 0.003
  - maxLeadsPerSearch: 500
  - cacheEnabled: true
  - cacheTTL: 86400
```

---

## 4. Cost Comparison

### 4.1 Current System (Google Places API)
```
Search: "Kurti wholesalers in Mumbai"
API Calls: 5 pages
Cost: 5 × $0.032 = $0.16
Results: ~60 leads
Cost per lead: $0.0027
```

### 4.2 New System (Outscraper)
```
Search: "Kurti wholesalers in Mumbai"
API Calls: 1 request (500 results)
Cost: 500 × $0.003 = $1.50
Results: ~500 leads (with emails!)
Cost per lead: $0.003
```

**Volume Increase:** 833% more leads  
**Total Cost:** $1.50 vs $0.16 (but 8x more valuable leads)  
**Cost Efficiency:** With emails = 3x more valuable per lead

---

## 5. Migration Phases

### Phase 1: Setup (Current)
- ✅ Assess current system
- ⏳ Verify Firebase Blaze plan
- ⏳ Choose scraping provider
- ⏳ Set up Cloud Functions environment

### Phase 2: Backend Foundation (Next)
- Initialize Cloud Functions
- Create `searchLeads` function
- Integrate Outscraper API
- Implement caching layer

### Phase 3: Frontend Integration
- Update `placesApi.js` to call Cloud Function
- Remove client-side API key
- Update credit tracking
- Add progress indicators

### Phase 4: UI Redesign
- Implement cinematic dark theme
- Update cost displays
- Add scraping intensity controls
- Enhanced result display (emails, social media)

### Phase 5: Testing & Launch
- Load testing with 100+ concurrent searches
- Cost monitoring
- Gradual rollout (10% → 50% → 100%)

---

## 6. Immediate Action Items

### Before Proceeding to Phase 2:

**Critical:**
1. ❗ **Verify Firebase Plan:** Check if Blaze plan is active
   - Go to: https://console.firebase.google.com/project/lead-finder-6b009/usage
   - Look for "Blaze Plan" badge
   - If Spark Plan: Upgrade required

2. ❗ **Create Outscraper Account:**
   - Sign up at: https://outscraper.com
   - Get API key from dashboard
   - Test with free credits (500 results)

3. ❗ **Backup Current Data:**
   - Export Firestore data
   - Git commit all code changes
   - Tag current version: `v1.0-google-api`

**Optional but Recommended:**
4. Create staging Firebase project for testing
5. Set up monitoring/alerting for Cloud Functions
6. Prepare rollback plan

---

## 7. Risk Assessment

### High Risk ⚠️
- **IP Blocking:** Mitigated by using Outscraper's proxy rotation
- **Cost Overruns:** Implement strict rate limiting and budget alerts
- **Data Quality:** Validate scraped data matches Google Places accuracy

### Medium Risk ⚡
- **Cloud Functions Cold Start:** Optimize with Firebase Functions v2
- **Cache Invalidation:** Implement smart TTL and manual refresh
- **User Education:** Users expecting instant results may see delays

### Low Risk ✅
- **Code Migration:** Minimal changes to frontend
- **Rollback:** Can revert to old API if needed
- **Testing:** Can test in parallel before switching

---

## 8. Success Metrics

**Phase 2 Success Criteria:**
- Cloud Function deploys successfully
- Can retrieve 500+ leads in single search
- Response time < 30 seconds
- Cost < $0.005 per lead

**Overall Migration Success:**
- 500% increase in leads per search
- 90% cost reduction per lead
- Email extraction rate > 60%
- User satisfaction maintained/improved

---

## Next Steps

**When ready to proceed:**
1. Confirm Firebase Blaze plan is active
2. Create Outscraper account and get API key
3. Run: `firebase init functions` to set up Cloud Functions
4. Move to Phase 2: Backend Foundation

**Questions to Answer:**
- What is your monthly search volume target?
- What is your maximum monthly scraping budget?
- Do you want to start with a test project first?
