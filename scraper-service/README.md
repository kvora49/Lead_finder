# 🚀 Lead Finder Sidecar Scraper Service

A standalone Express.js scraper service that runs on Render.com's free tier, using Puppeteer to scrape Google Maps for business leads and store results in Firebase Firestore.

## 🎯 Why Sidecar Architecture?

- ✅ **Free Hosting**: Runs on Render.com free tier (no credit card needed)
- ✅ **No Firebase Cloud Functions**: Bypasses Firebase Spark plan limitations
- ✅ **100+ Results**: Scrolls Google Maps to get more leads than API limits
- ✅ **Cost**: $0/month (completely free)
- ✅ **Integration**: Connects directly to your existing Firebase project

---

## 📦 What's Included

```
scraper-service/
├── index.js                  # Main Express server with Puppeteer
├── package.json              # Dependencies
├── Dockerfile                # Docker config for Render
├── render-build.sh           # Build script for Linux
├── .env.example              # Environment variables template
├── .dockerignore             # Docker ignore file
└── README.md                 # This file
```

---

## 🔧 Setup Instructions

### Step 1: Get Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `lead-finder-6b009`
3. Click **⚙️ Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Download the JSON file
6. **IMPORTANT**: Copy the entire JSON content (will need for Step 3)

### Step 2: Create Render.com Account

1. Go to [render.com](https://render.com/)
2. Sign up with GitHub (free, no credit card)
3. Click **New +** → **Web Service**
4. Choose **Deploy an existing image from a registry** OR connect your GitHub repo

### Step 3: Configure Environment Variables on Render

In Render's dashboard, add these environment variables:

| Key | Value | Example |
|-----|-------|---------|
| `PORT` | `3001` | Auto-set by Render |
| `SECRET_KEY` | Random string (20+ chars) | `my-super-secret-key-abc123xyz` |
| `FIREBASE_PROJECT_ID` | `lead-finder-6b009` | Your Firebase project ID |
| `FIREBASE_SERVICE_ACCOUNT` | Paste entire JSON from Step 1 | `{"type":"service_account",...}` |

**⚠️ CRITICAL**: For `FIREBASE_SERVICE_ACCOUNT`, paste the **entire JSON as a single line** (no line breaks).

### Step 4: Deploy to Render

#### Option A: Using Dockerfile (Recommended)
```bash
# Render will auto-detect Dockerfile and build
# Just push to GitHub and connect repo to Render
```

#### Option B: Manual Build Command
```bash
Build Command: bash render-build.sh && npm ci
Start Command: node index.js
```

### Step 5: Get Your Render URL

After deployment completes:
- Render will give you a URL like: `https://your-app-name.onrender.com`
- Copy this URL (you'll need it for frontend integration)
- Test: Visit `https://your-app-name.onrender.com/health`

---

## 🧪 Testing Locally

### 1. Install Dependencies
```bash
cd scraper-service
npm install
```

### 2. Create `.env` File
```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Run Server
```bash
npm start
```

Server starts at `http://localhost:3001`

### 4. Test Scraping
```bash
curl -X POST http://localhost:3001/scrape \
  -H "Content-Type: application/json" \
  -H "x-secret-key: your-super-secret-key-change-this-12345" \
  -d '{
    "keyword": "restaurants",
    "location": "New York",
    "userId": "test-user-123"
  }'
```

---

## 📡 API Endpoints

### POST `/scrape`

Scrape Google Maps and save results to Firestore.

**Headers:**
```json
{
  "Content-Type": "application/json",
  "x-secret-key": "your-secret-key"
}
```

**Request Body:**
```json
{
  "keyword": "restaurants",
  "location": "Mumbai",
  "userId": "user123",
  "forceRefresh": false
}
```

**Response (Success):**
```json
{
  "success": true,
  "cached": false,
  "results": [
    {
      "displayName": { "text": "Pizza Palace" },
      "formattedAddress": "123 Main St, Mumbai",
      "nationalPhoneNumber": "+91 12345-67890",
      "rating": 4.5,
      "userRatingCount": 230,
      "websiteUri": "https://pizzapalace.com",
      "businessStatus": "OPERATIONAL"
    }
  ],
  "count": 87,
  "duration": "24.3s",
  "message": "Fresh scrape completed"
}
```

**Response (Cached):**
```json
{
  "success": true,
  "cached": true,
  "results": [...],
  "count": 87,
  "message": "Results from cache"
}
```

### GET `/health`

Check service health.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-06T10:30:00.000Z",
  "firebase": "connected",
  "service": "render-sidecar-scraper"
}
```

### GET `/`

Service information.

---

## 🔒 Security Features

1. **Secret Key Authentication**: All `/scrape` requests require `x-secret-key` header
2. **Firestore Rules**: Only authenticated users can read/write
3. **No Exposed Credentials**: Service account stored as environment variable
4. **Rate Limiting**: Controlled by Render's free tier (prevents abuse)

---

## 🚨 Render Free Tier Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| **RAM** | 512 MB | Sufficient for Puppeteer |
| **CPU** | Shared | May sleep after 15 min inactivity |
| **Bandwidth** | 100 GB/month | Plenty for scraping |
| **Build Minutes** | 500 min/month | Each deploy ~5-10 min |
| **Instance Hours** | 750 hours/month | Always-on possible |

**⚠️ Cold Starts**: Free tier services sleep after 15 minutes of inactivity. First request after sleep takes ~30-60 seconds to wake up.

---

## 📊 Firestore Collections

This service interacts with:

### 1. `scraped_leads`
Caches scraping results for 7 days.

```javascript
{
  keyword: "restaurants",
  location: "Mumbai",
  results: [...],
  resultCount: 87,
  scrapedAt: Timestamp,
  expiresAt: Date,
  userId: "user123",
  source: "render-sidecar"
}
```

### 2. `searchLogs`
Analytics for each scrape.

```javascript
{
  userId: "user123",
  keyword: "restaurants",
  location: "Mumbai",
  resultCount: 87,
  success: true,
  source: "render-sidecar",
  duration: 24.3,
  timestamp: Timestamp
}
```

---

## 🐛 Troubleshooting

### Issue: "Firebase initialization error"
**Solution**: Check `FIREBASE_SERVICE_ACCOUNT` environment variable is valid JSON (no line breaks)

### Issue: "Unauthorized" response
**Solution**: Verify `x-secret-key` header matches `SECRET_KEY` environment variable

### Issue: "No results found"
**Solution**: Try different keyword or location. Some searches have no results on Google Maps.

### Issue: Render deployment fails
**Solution**: 
- Check Render logs for specific error
- Ensure `render-build.sh` has execute permissions: `chmod +x render-build.sh`
- Try using Dockerfile instead

### Issue: Service is slow (60+ seconds)
**Solution**: This is normal for cold starts on free tier. Wait for service to warm up.

---

## 🔄 Updating the Service

1. Make changes to code
2. Commit and push to GitHub
3. Render auto-deploys (if connected to repo)
4. Or manually trigger deploy from Render dashboard

---

## 📈 Performance Tips

1. **Enable Caching**: Results cached for 7 days, speeds up repeat searches
2. **Batch Requests**: Send multiple keywords in sequence
3. **Off-Peak Hours**: Scrape during low-traffic hours for faster results
4. **Keep Warm**: Ping `/health` every 10 minutes to prevent cold starts

---

## 🆘 Support

If you encounter issues:
1. Check Render logs: Dashboard → Your Service → Logs
2. Check Firestore rules: Firebase Console → Firestore → Rules
3. Verify environment variables are set correctly
4. Test locally first before deploying to Render

---

## 📝 License

MIT - Feel free to modify and use for your project!

---

## 🎉 Next Steps

After deploying to Render:
1. Get your Render URL
2. Update frontend `placesApi.js` to call this URL instead of Firebase Functions
3. Test scraping through your React app
4. Monitor Render logs and Firestore for results

Happy scraping! 🚀
