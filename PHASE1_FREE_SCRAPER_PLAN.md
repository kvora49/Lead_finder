# Phase 1: Zero-Cost Scraping Architecture Plan

## 🎯 Project Goal
Transform the Universal Business Lead Finder into a **100% FREE** self-hosted scraping platform for college project demonstration.

---

## 📊 Current System Analysis

### Current Costs (Google Places API)
- **Cost per API call**: $0.032
- **Results per call**: ~20 leads (60 max with pagination)
- **Cost per 1,000 leads**: ~$32.00
- **Monthly budget impact**: Unsustainable for students

### Current Limitations
1. ❌ 60-result cap per query
2. ❌ Missing email addresses
3. ❌ Missing social media handles
4. ❌ Expensive for high-volume scraping
5. ❌ Client-side processing (slow, exposes API keys)

---

## ✨ New Architecture: The Free Scraper Approach

### Core Technology Stack
```
Frontend (React + Vite)
    ↓
Firebase Cloud Functions (Spark Plan - FREE)
    ↓
Puppeteer-Stealth / Playwright (Self-Hosted)
    ↓
Google Maps Web Interface (Scraped Data)
    ↓
Firestore Cache (Results Storage)
```

### Key Components

#### 1. **Scraping Engine** (Puppeteer-Stealth)
- **Library**: `puppeteer-extra` + `puppeteer-extra-plugin-stealth`
- **Purpose**: Mimics human browsing to bypass bot detection
- **Features**:
  - Randomized 2-5s delays between actions
  - User-Agent rotation
  - Viewport randomization
  - Mouse movement simulation
  - Cookie persistence

#### 2. **Data Extraction Strategy**
```javascript
// Sequential neighborhood search
1. Search "restaurants in Mumbai"
2. If results < 20 → Subdivide into neighborhoods
3. Extract: Name, Address, Phone, Rating, Reviews
4. Follow website links → Extract email + social media
5. Deduplicate by phone number or address
6. Cache in Firestore
```

#### 3. **Stealth Parameters** (Stored in Firestore)
```json
{
  "systemConfig": {
    "scraper": {
      "delayMin": 2000,
      "delayMax": 5000,
      "maxConcurrentScrapes": 2,
      "userAgents": [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)..."
      ],
      "viewports": [
        { "width": 1920, "height": 1080 },
        { "width": 1366, "height": 768 }
      ],
      "resultThreshold": 20,
      "maxScrolls": 10
    }
  }
}
```

---

## 🆓 Firebase Spark Plan Limits (FREE Tier)

### Cloud Functions Quotas
- **Invocations**: 2 million/month (FREE)
- **Compute Time**: 400,000 GB-seconds/month (FREE)
- **Outbound Networking**: 5GB/month (FREE)
- **Memory**: 256MB default (sufficient for scraping)

### Firestore Quotas
- **Reads**: 50,000/day (FREE)
- **Writes**: 20,000/day (FREE)
- **Deletes**: 20,000/day (FREE)
- **Storage**: 1GB (FREE)

### Strategy to Stay Within Limits
✅ **Cache aggressively** - Store all scraped results for 7 days  
✅ **Batch processing** - Scrape 20-50 leads per function call  
✅ **Smart pagination** - Only subdivide when necessary  
✅ **Result reuse** - Check cache before scraping  

---

## 🏗️ Implementation Phases

### **Phase 1: Setup & Testing** (Current)
- [x] Assess current architecture
- [ ] Install Firebase CLI
- [ ] Initialize Cloud Functions project
- [ ] Install Puppeteer-Stealth dependencies
- [ ] Create test scraping function
- [ ] Test on single query

### **Phase 2: Core Scraping Logic**
- [ ] Refactor `placesApi.js` to call Cloud Function
- [ ] Build `scrapeMapsData` Cloud Function
- [ ] Implement human-mimicry delays
- [ ] Add User-Agent rotation
- [ ] Test stealth bypass on Google Maps

### **Phase 3: Data Enrichment**
- [ ] Add email extraction from business websites
- [ ] Add social media link extraction
- [ ] Implement deduplication logic
- [ ] Add Firestore caching layer

### **Phase 4: Backend Migration**
- [ ] Move Excel export to Cloud Function
- [ ] Create secure download links
- [ ] Update credit tracking (change to "Scrape Credits")
- [ ] Remove API keys from frontend

### **Phase 5: UI Redesign**
- [ ] Implement Glassmorphism theme
- [ ] Add "Live Scrape Status" indicators
- [ ] Update LeadCard with email/social icons
- [ ] Add "Cost Saved" metrics to Dashboard

---

## 📈 Expected Results

### Performance Improvements
| Metric | Current (API) | New (Scraper) | Improvement |
|--------|---------------|---------------|-------------|
| Cost per 1,000 leads | $32.00 | $0.00 | **100% savings** |
| Max results per query | 60 | 200+ | **333% increase** |
| Data fields | 6 | 9 (+ email, social) | **50% more data** |
| Processing speed | 5-10s | 15-30s | Acceptable trade-off |

### Risk Mitigation
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| IP blocking | Medium | Use delays, rotate User-Agents |
| Rate limiting | Low | Sequential search, max 2 concurrent |
| Function timeout | Medium | Limit to 50 leads per invocation |
| Data accuracy | Low | Validate phone numbers, deduplicate |

---

## 🔧 Technical Requirements

### Development Environment
```bash
# Install Firebase Tools
npm install -g firebase-tools

# Install Cloud Function Dependencies
cd functions
npm install puppeteer-extra puppeteer-extra-plugin-stealth
npm install exceljs axios cheerio

# Test locally
firebase emulators:start --only functions
```

### Environment Variables (`.env.local` in functions/)
```
GOOGLE_MAPS_BASE_URL=https://www.google.com/maps/search/
USER_AGENT_LIST=...
FIRESTORE_CACHE_TTL=604800
MAX_SCRAPE_RESULTS=50
```

---

## 📋 Success Criteria

### Phase 1 Complete When:
- [ ] Firebase Cloud Functions initialized
- [ ] Puppeteer-Stealth successfully loads Google Maps
- [ ] Test function extracts 10+ businesses
- [ ] Stealth config stored in Firestore `systemConfig`
- [ ] No IP blocks during 50-query test

### Phase 2-5 Complete When:
- [ ] Full search returns 200+ unique leads
- [ ] Email extraction working for 60%+ of businesses
- [ ] UI shows real-time scraping progress
- [ ] Admin dashboard shows "$0 spent" metric
- [ ] Excel export downloads from secure Cloud Function link

---

## 🚀 Next Steps

1. **Install Firebase CLI**
   ```bash
   npm install -g firebase-tools
   firebase login
   ```

2. **Initialize Cloud Functions**
   ```bash
   cd "c:\Project\Information extracter"
   firebase init functions
   # Select JavaScript
   # Install dependencies: Yes
   ```

3. **Install Scraping Dependencies**
   ```bash
   cd functions
   npm install puppeteer-extra puppeteer-extra-plugin-stealth
   npm install puppeteer@21.6.0
   ```

4. **Create Test Function**
   - Build basic `scrapeMapsTest` function
   - Test with single query: "restaurants in ahmedabad"
   - Verify results in console

---

## 📚 Resources

- [Puppeteer-Stealth GitHub](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth)
- [Firebase Functions Pricing](https://firebase.google.com/pricing)
- [Google Maps Scraping Best Practices](https://www.scrapehero.com/how-to-scrape-google-maps/)
- [Cheerio Documentation](https://cheerio.js.org/) (for email extraction)

---

**Status**: Phase 1 Planning Complete ✅  
**Next**: Initialize Firebase Functions & Install Dependencies  
**ETA**: 30 minutes setup time
