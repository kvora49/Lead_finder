# Fix Google OAuth "Unauthorized Domain" Error on Cloudflare

When you see the error `auth/unauthorized-domain` while trying to use Google Sign-In on your Cloudflare Pages deployment, it means Firebase doesn't recognize your Cloudflare domain as authorized.

## Quick Fix Steps

### 1. Get Your Cloudflare Pages URL
- Go to your Cloudflare Pages dashboard
- Find your project's URL (e.g., `lead-finder-xxx.pages.dev`)
- Copy the **exact domain** (without `https://` or any path)

### 2. Add Domain to Firebase Console

1. **Open Firebase Console**
   - Go to: https://console.firebase.google.com
   - Select your project: `lead-finder-6b009`

2. **Navigate to Authentication Settings**
   - Click on **"Authentication"** in the left sidebar
   - Click on **"Settings"** tab at the top
   - Click on **"Authorized domains"** section

3. **Add Your Cloudflare Domain**
   - Click **"Add domain"** button
   - Paste your Cloudflare Pages domain (e.g., `lead-finder-xxx.pages.dev`)
   - Click **"Add"**

### 3. Wait for Propagation
- Changes take **1-2 minutes** to propagate
- Clear your browser cache if needed
- Test Google Sign-In again on Cloudflare

## Example Domains to Add

✅ **Correct format:**
- `lead-finder-xxx.pages.dev`
- `your-custom-domain.com`

❌ **Incorrect format:**
- `https://lead-finder-xxx.pages.dev` (no protocol)
- `lead-finder-xxx.pages.dev/login` (no paths)

## Default Authorized Domains

Firebase automatically includes:
- `localhost` (for local development)
- `*.firebaseapp.com` (Firebase hosting)
- Your Firebase project's default domain

## Troubleshooting

### Still Getting Error?
1. **Double-check the domain format** - No http://, no paths, just the domain
2. **Wait a bit longer** - Sometimes takes up to 5 minutes
3. **Clear browser cache** - Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
4. **Check for typos** - Domain must match exactly

### Testing Google OAuth
- Test on localhost first (should work with redirect method now)
- Then test on Cloudflare after adding the domain
- Both should work after proper configuration

## Recent Improvements

✅ **Popup-Closed Error Fixed**
- App now uses redirect method as fallback if popup is blocked
- Popup will try first, then automatically switch to redirect
- No more "auth/popup-closed-by-user" errors

✅ **Forgot Password Added**
- Click "Forgot password?" on login page
- Enter your email to receive reset link
- Check inbox for password reset email from Firebase

## Security Notes

- Only add domains you own and trust
- Firebase validates the domain ownership
- You can have multiple authorized domains for different environments (staging, production, etc.)

---

**Need Help?**
If you're still experiencing issues:
1. Check Firebase Console for any error messages
2. Verify your Cloudflare deployment is live and accessible
3. Ensure your Firebase configuration in `.env` is correct
