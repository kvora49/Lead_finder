# 🚀 Sidecar Scraper - Complete Deployment Guide

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Firebase Setup](#firebase-setup)
3. [Render Deployment](#render-deployment)
4. [Frontend Integration](#frontend-integration)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## ✅ Prerequisites

Before starting, ensure you have:
- [x] Firebase project (`lead-finder-6b009`)
- [x] GitHub account
- [x] Git installed locally
- [x] Node.js 18+ installed

---

## 🔥 Firebase Setup

### Step 1: Get Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **lead-finder-6b009**
3. Click **⚙️ (Settings)** → **Project Settings**
4. Navigate to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Click **Generate Key** (downloads a JSON file)
7. **SAVE THIS FILE** - You'll need it in Step 3

### Step 2: Update Firestore Rules

Ensure your Firestore rules allow the scraper to write:

```javascript
// In firestore.rules
match /scraped_leads/{document=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null; 
  // Service account has admin access automatically
}

match /searchLogs/{document=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null;
}
```

Deploy rules:
```bash
firebase deploy --only firestore:rules
```

---

## 🚢 Render Deployment

### Step 1: Prepare Repository

1. **Commit scraper service to GitHub:**
```bash
cd "c:\Project\Information extracter"
git add scraper-service/
git commit -m "Add Sidecar scraper service"
git push origin main
```

### Step 2: Create Render Account

1. Go to [render.com](https://render.com/)
2. Click **Sign Up**
3. Choose **Sign up with GitHub**
4. Authorize Render to access your repositories

### Step 3: Create New Web Service

1. In Render Dashboard, click **New +**
2. Select **Web Service**
3. Connect your GitHub repository: **Lead_finder**
4. Configure service:

| Setting | Value |
|---------|-------|
| **Name** | `lead-finder-scraper` |
| **Region** | Choose closest to you |
| **Branch** | `main` |
| **Root Directory** | `scraper-service` |
| **Runtime** | `Docker` |
| **Instance Type** | **Free** |

### Step 4: Set Environment Variables

In Render dashboard, go to **Environment** tab and add:

#### Required Variables:

**1. SECRET_KEY**
```
Value: Generate a random 32-character string
Example: a8d9f3k2m5n7p1q4r6s8t0u2v4w6x8y0
```
To generate:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

**2. FIREBASE_PROJECT_ID**
```
Value: lead-finder-6b009
```

**3. FIREBASE_SERVICE_ACCOUNT**
```
Value: Paste entire JSON from Step 1
CRITICAL: Must be single line, no line breaks!
```

To convert JSON to single line:
```bash
# On Windows PowerShell:
Get-Content firebase-key.json | ConvertTo-Json -Compress

# On Mac/Linux:
cat firebase-key.json | jq -c
```

Copy the output and paste into Render.

### Step 5: Deploy

1. Click **Create Web Service**
2. Render will:
   - Pull code from GitHub
   - Build Docker image (5-10 minutes)
   - Start service
3. Wait for **"Your service is live 🎉"**

### Step 6: Get Your Service URL

After deployment:
- Copy the URL: `https://lead-finder-scraper.onrender.com`
- Test health: Visit `https://lead-finder-scraper.onrender.com/health`

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-06T...",
  "firebase": "connected",
  "service": "render-sidecar-scraper"
}
```

---

## 🎨 Frontend Integration

### Step 1: Create Environment Variables

Create `.env.local` in project root:

```env
# Sidecar Scraper Configuration
VITE_SIDECAR_API_URL=https://lead-finder-scraper.onrender.com
VITE_SIDECAR_SECRET_KEY=your-secret-key-from-render
```

**⚠️ Replace with YOUR values from Render!**

### Step 2: Update Frontend Code

**Option A: Quick Switch (Rename files)**
```bash
# Backup current placesApi.js
mv src/services/placesApi.js src/services/placesApi.old2.js

# Use Sidecar version
mv src/services/placesApi.sidecar.js src/services/placesApi.js
```

**Option B: Manual Integration**

If you want to keep both versions (for A/B testing):

In `src/App.jsx`:
```javascript
// Change import
import { searchBusinesses } from './services/placesApi.sidecar';
// Instead of: import { searchBusinesses } from './services/placesApi';
```

### Step 3: Test Locally

```bash
npm run dev
```

1. Open `http://localhost:5173`
2. Try a search: "restaurants in New York"
3. Watch browser console for logs:
   - `🔍 Calling Sidecar API...`
   - `✅ Sidecar API response: X results`

---

## 🧪 Testing

### Test 1: Health Check

```bash
curl https://lead-finder-scraper.onrender.com/health
```

Expected: `{"status":"healthy",...}`

### Test 2: Manual Scrape Request

```bash
curl -X POST https://lead-finder-scraper.onrender.com/scrape \
  -H "Content-Type: application/json" \
  -H "x-secret-key: YOUR_SECRET_KEY" \
  -d '{
    "keyword": "coffee shops",
    "location": "San Francisco",
    "userId": "test-123"
  }'
```

Expected: JSON with `results` array (takes 20-30 seconds)

### Test 3: Check Firestore

1. Go to Firebase Console → Firestore
2. Look for collection: `scraped_leads`
3. Should see document with your search results

### Test 4: Frontend Search

1. Open your React app
2. Search for: "hotels in London"
3. Results should appear (100+ businesses)
4. Check Firestore for `searchLogs` entry

---

## 🐛 Troubleshooting

### Issue: "Unauthorized" error

**Cause**: Secret key mismatch

**Solution**:
1. Check `.env.local` has correct `VITE_SIDECAR_SECRET_KEY`
2. Verify it matches Render's `SECRET_KEY` environment variable
3. Restart dev server: `npm run dev`

### Issue: "Firebase initialization error"

**Cause**: Invalid service account JSON

**Solution**:
1. Re-download service account from Firebase
2. Convert to single line (no line breaks)
3. Update Render environment variable
4. Redeploy service

### Issue: "Service unreachable"

**Cause**: Render service sleeping (free tier)

**Solution**:
- Wait 30-60 seconds for cold start
- First request wakes the service
- Subsequent requests are fast

### Issue: "No results found"

**Cause**: Google Maps has no results for query

**Solution**:
- Try different keyword
- Check spelling of location
- Use more specific terms (e.g., "Italian restaurants" instead of "food")

### Issue: Render deployment fails

**Cause**: Docker build error

**Solution**:
1. Check Render logs for specific error
2. Ensure `Dockerfile` is in `scraper-service/` directory
3. Try manual build command:
   ```
   Build Command: cd scraper-service && npm install
   Start Command: cd scraper-service && node index.js
   ```

---

## 📊 Monitoring

### Check Render Logs

1. Render Dashboard → Your Service
2. Click **Logs** tab
3. Watch real-time scraping activity

### Check Firestore Usage

1. Firebase Console → Usage
2. Monitor:
   - Document reads/writes
   - Storage size
   - Network egress

### Check Render Usage

1. Render Dashboard → Account → Usage
2. Monitor:
   - Build minutes (500/month free)
   - Bandwidth (100GB/month free)

---

## 🎉 Success Checklist

- [ ] Render service deployed and healthy
- [ ] Firebase service account connected
- [ ] Frontend environment variables set
- [ ] Test scrape returns 50+ results
- [ ] Results saved to Firestore
- [ ] Frontend displays results
- [ ] searchLogs created in Firestore
- [ ] No console errors

---

## 🚀 Next Steps

After successful deployment:

1. **Update Admin Dashboard**
   - Show Sidecar API status
   - Add cache hit rate metrics

2. **Phase 4: Email Extraction**
   - Enhance scraper to visit websites
   - Extract email addresses
   - Add social media links

3. **Phase 5: UI Redesign**
   - Glassmorphism theme
   - Live scrape progress indicator
   - Cost savings display

---

## 💰 Cost Breakdown

| Service | Plan | Cost |
|---------|------|------|
| Render.com | Free Tier | $0.00/month |
| Firebase Firestore | Spark Plan | $0.00/month |
| Firebase Authentication | Spark Plan | $0.00/month |
| **Total** | | **$0.00/month** |

**Compare to:**
- Google Places API: $32 per 1,000 leads
- Outscraper: $49/month minimum

**Savings: 100%** 🎉

---

## 📞 Support

If you encounter issues:

1. **Check Logs First**
   - Render: Dashboard → Logs
   - Browser: Console (F12)
   - Firestore: Firebase Console

2. **Common Solutions**
   - Restart Render service
   - Clear browser cache
   - Verify environment variables
   - Wait for cold start (60s)

3. **Still Stuck?**
   - Check GitHub issues
   - Review README.md files
   - Test with Postman/curl first

---

## ✅ Deployment Complete!

You now have:
- ✅ Free, unlimited lead scraping
- ✅ 100+ results per search
- ✅ Firestore caching (7-day TTL)
- ✅ No API costs
- ✅ No credit card needed

**Total setup time: 15-20 minutes**

Happy scraping! 🎊
