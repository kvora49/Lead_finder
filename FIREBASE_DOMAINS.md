# Firebase Authorized Domains Setup

## Issue: "auth/unauthorized-domain" Error

When using Google Sign-in on Cloudflare, you need to add your domain to Firebase.

## Steps to Fix:

### 1. Go to Firebase Console
1. Visit: https://console.firebase.google.com/
2. Select project: **lead-finder-6b009**

### 2. Add Authorized Domains
1. Click **Authentication** in left menu
2. Click **Settings** tab at top
3. Scroll down to **Authorized domains** section
4. Click **Add domain**

### 3. Add Your Cloudflare Domain
Add these domains one by one:
- Your Cloudflare URL: `your-app.pages.dev`
- Example: `lead-finder.pages.dev`

If you have a custom domain, add that too:
- `www.yourdomain.com`
- `yourdomain.com`

### 4. Save
Click **Add** for each domain

---

## Already Authorized by Default:
- ✅ `localhost` (for development)
- ✅ `*.firebaseapp.com` (Firebase hosting)

---

## How to Find Your Cloudflare URL:

1. Go to Cloudflare Pages dashboard
2. Click on your project: **Lead_finder**
3. Copy the URL shown (looks like: `https://lead-finder-xxx.pages.dev`)
4. Add just the domain part to Firebase: `lead-finder-xxx.pages.dev`

---

## After Adding Domain:

1. Wait 1-2 minutes for changes to propagate
2. Try Google Sign-in again on Cloudflare
3. Should work! ✅

---

## Common Mistakes:

❌ **Don't include `http://` or `https://`**
   - Wrong: `https://myapp.pages.dev`
   - Right: `myapp.pages.dev`

❌ **Don't include paths**
   - Wrong: `myapp.pages.dev/login`
   - Right: `myapp.pages.dev`

✅ **Just the domain name**
   - `myapp.pages.dev`
   - `www.myapp.com`
