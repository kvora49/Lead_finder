# ⚡ Quick Start - Sidecar Scraper

**Goal**: Deploy scraper to Render.com in 20 minutes

---

## 📝 Checklist

### 1. Firebase (5 min)
- [ ] Go to [Firebase Console](https://console.firebase.google.com/)
- [ ] Select: `lead-finder-6b009`
- [ ] Settings → Service Accounts → Generate New Private Key
- [ ] Download JSON, save it

### 2. Render.com (10 min)
- [ ] Sign up at [render.com](https://render.com/) (use GitHub)
- [ ] New + → Web Service
- [ ] Connect repo: `Lead_finder`
- [ ] Root Directory: `scraper-service`
- [ ] Runtime: `Docker`
- [ ] Instance: `Free`

### 3. Environment Variables
Add in Render:

```
SECRET_KEY = [Generate: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"]

FIREBASE_PROJECT_ID = lead-finder-6b009

FIREBASE_SERVICE_ACCOUNT = [Paste JSON as single line]
```

### 4. Deploy
- [ ] Click "Create Web Service"
- [ ] Wait 5-10 min
- [ ] Copy URL: `https://your-app.onrender.com`

### 5. Frontend (5 min)
Create `.env.local`:
```env
VITE_SIDECAR_API_URL=https://your-app.onrender.com
VITE_SIDECAR_SECRET_KEY=your-secret-key
```

Rename files:
```bash
mv src/services/placesApi.js src/services/placesApi.old2.js
mv src/services/placesApi.sidecar.js src/services/placesApi.js
```

### 6. Test
```bash
npm run dev
```
Search: "restaurants in New York"

---

## ✅ Done!

- Cost: **$0/month**
- Results: **100+ per search**
- Speed: **20-30 seconds**

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for details.
