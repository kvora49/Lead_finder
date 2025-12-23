# Firebase Setup Guide

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or "Create a project"
3. Enter a project name (e.g., "Lead Finder")
4. Follow the prompts to complete project creation

## Step 2: Enable Authentication

1. In your Firebase project, click on "Authentication" in the left sidebar
2. Click "Get started"
3. Go to the "Sign-in method" tab
4. Enable the following providers:
   - **Email/Password**: Click on it, toggle "Enable", then "Save"
   - **Google**: Click on it, toggle "Enable", add your project support email, then "Save"

## Step 3: Register Your Web App

1. In the Firebase Console, go to Project Settings (gear icon)
2. Scroll down to "Your apps" section
3. Click the web icon (`</>`) to add a web app
4. Enter an app nickname (e.g., "Lead Finder Web")
5. Check "Also set up Firebase Hosting" (optional)
6. Click "Register app"

## Step 4: Get Your Configuration

After registering, you'll see your Firebase configuration object that looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

## Step 5: Update Your Code

1. Open `src/firebase.js` in your project
2. Replace the placeholder configuration with your actual Firebase config values:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "YOUR_ACTUAL_AUTH_DOMAIN",
  projectId: "YOUR_ACTUAL_PROJECT_ID",
  storageBucket: "YOUR_ACTUAL_STORAGE_BUCKET",
  messagingSenderId: "YOUR_ACTUAL_SENDER_ID",
  appId: "YOUR_ACTUAL_APP_ID"
};
```

## Step 6: Add Authorized Domains (for deployment)

1. Go to Firebase Console → Authentication → Settings tab
2. Scroll to "Authorized domains"
3. Add your deployed domain (e.g., `your-app.pages.dev` for Cloudflare Pages)

## Step 7: Test Your Authentication

1. Start your development server: `npm run dev`
2. Open http://localhost:3000 in your browser
3. You should see the login screen
4. Click "Sign up" to create an account
5. Test registration with email/password
6. Test Google OAuth sign-in
7. Verify you can see the main app after logging in
8. Test the logout button

## Troubleshooting

### "Firebase: Error (auth/operation-not-allowed)"
- Make sure Email/Password authentication is enabled in Firebase Console
- Go to Authentication → Sign-in method → Enable Email/Password

### "Firebase: Error (auth/unauthorized-domain)"
- Add localhost to authorized domains in Firebase Console
- Go to Authentication → Settings → Authorized domains → Add domain

### "Firebase: Error (auth/api-key-not-valid)"
- Check that you copied the correct API key from Firebase Console
- Make sure there are no extra spaces or quotes

### Google Sign-In popup blocked
- Allow popups in your browser for localhost
- Make sure Google provider is enabled in Firebase Console

## Security Notes

- Never commit your Firebase config with real values to public repositories
- Use environment variables for sensitive data in production
- Keep your API keys secure
- Firebase security rules should be configured for production use

## Next Steps

Once authentication is working:
- [ ] Set up Firestore database for storing user data
- [ ] Add user profile page
- [ ] Implement user-specific API key storage
- [ ] Add usage analytics per user
- [ ] Configure Firebase security rules

## Useful Resources

- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firebase Web Setup Guide](https://firebase.google.com/docs/web/setup)
- [Firebase Console](https://console.firebase.google.com/)
