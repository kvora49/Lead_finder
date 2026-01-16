# Firebase Service Account Setup for Server

## Why This Is Needed

The server.js file now uses Firebase Admin SDK to store email verification codes in Firestore instead of in-memory storage. This prevents data loss when the server restarts.

## Setup Instructions

### 1. Generate Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the ⚙️ gear icon → **Project Settings**
4. Navigate to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Click **Generate Key** to download the JSON file

### 2. Add Key to Project

1. Rename the downloaded file to `serviceAccountKey.json`
2. Move it to your project root directory (same level as `package.json`)
3. **IMPORTANT**: Add it to `.gitignore` to prevent committing to Git

### 3. Update .gitignore

Add this line to your `.gitignore` file:

```
serviceAccountKey.json
```

### 4. Install Dependencies

```bash
npm install firebase-admin
```

### 5. Restart Server

```bash
npm run server
```

You should see:
```
✅ Firebase Admin initialized
✅ SMTP Server ready to send emails
🚀 Email verification server running on http://localhost:3001
```

## Fallback Mode

If `serviceAccountKey.json` is not found, the server will automatically fall back to in-memory storage with a warning:

```
⚠️ Firebase Admin not initialized - verification codes will use in-memory fallback
⚠️ To enable persistent storage, add serviceAccountKey.json file
```

**In fallback mode**: Verification codes will be lost if the server restarts!

## Production Deployment

For production environments (like Cloudflare Workers, Vercel, etc.):

1. **Do NOT** commit `serviceAccountKey.json`
2. Use environment variables instead:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
3. Initialize Admin SDK using environment variables:

```javascript
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
});
```

## Security Notes

⚠️ **CRITICAL**: The service account key grants full admin access to your Firebase project!

- **Never commit** `serviceAccountKey.json` to version control
- **Never expose** it in client-side code
- **Only use** on secure backend servers
- **Rotate keys** regularly for security
- **Use environment variables** in production

## Troubleshooting

### Error: "Cannot find module 'firebase-admin'"

Run: `npm install firebase-admin`

### Error: "ENOENT: no such file or directory"

The `serviceAccountKey.json` file is missing. Follow steps 1-2 above.

### Error: "Permission denied"

Check Firestore rules allow writing to `verificationCodes` collection:

```javascript
match /verificationCodes/{email} {
  allow read, write: if request.auth == null; // Public for registration
}
```

### Verification Codes Not Persisting

1. Check Firebase Admin is initialized (look for ✅ in console logs)
2. Verify Firestore rules allow writes to `verificationCodes`
3. Check Firebase Console → Firestore Database → `verificationCodes` collection exists

## Benefits of Firestore Storage

✅ **Persistent**: Codes survive server restarts
✅ **Scalable**: Works with multiple server instances
✅ **Automatic Cleanup**: Expired codes can be auto-deleted with Firestore TTL
✅ **Audit Trail**: Track verification attempts in production
✅ **Real-time**: Instantly synced across all servers
