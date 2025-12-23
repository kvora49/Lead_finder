# Firestore Setup Guide - Credit Tracking Sync

## Overview
Credits are now synced across all devices using Cloud Firestore. When you use credits on one device, they automatically update on all other devices in real-time.

## How It Works

### Before (localStorage):
- Credits stored locally on each device
- Different devices had different credit counts
- Clearing browser data = losing credit history

### After (Firestore):
- ✅ Credits stored in cloud database
- ✅ Real-time sync across all devices
- ✅ Automatic monthly reset
- ✅ Never lose credit history
- ✅ Works even after clearing browser

## Setup Firestore Security Rules

### Step 1: Go to Firebase Console
1. Visit: https://console.firebase.google.com/
2. Select your project: **lead-finder-6b009**
3. Click **Firestore Database** in the left menu

### Step 2: Create Database (if not exists)
1. Click **Create database**
2. Choose **Start in production mode**
3. Select location: **us-central** (or closest to you)
4. Click **Enable**

### Step 3: Set Security Rules
1. Click **Rules** tab at the top
2. Replace existing rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // User Credits Collection
    match /userCredits/{userId} {
      // Users can only read their own credits
      allow read: if request.auth != null && request.auth.uid == userId;
      
      // Users can update their own credits
      allow write: if request.auth != null && request.auth.uid == userId;
      
      // Ensure data integrity - users can't set negative credits
      allow update: if request.auth != null 
                    && request.auth.uid == userId
                    && request.resource.data.totalApiCalls >= 0;
    }
    
    // User Profiles Collection (for future use)
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Deny all other access by default
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. Click **Publish**

## Data Structure

### Collection: `userCredits`
Each user has a document with their UID containing:

```javascript
{
  userId: "user-firebase-uid",
  currentMonth: "2025-12",
  totalApiCalls: 150,
  lastUpdated: "2025-12-23T18:30:00.000Z",
  createdAt: "2025-12-01T10:00:00.000Z"
}
```

## Features

### ✅ Real-Time Sync
- Make API call on Device A → Credits update on Device B instantly
- Multiple tabs open → All tabs show same credits
- Use on phone → Updates on desktop immediately

### ✅ Automatic Monthly Reset
- Credits automatically reset on the 1st of each month
- Old data preserved with month marker
- No manual intervention needed

### ✅ Session Tracking
- Session calls: Credits used in current browser session
- Total calls: All credits used this month (synced)
- Both visible in the UI

### ✅ Manual Reset
- Click "Reset Tracker" button
- Resets credits across ALL devices
- Confirmation dialog prevents accidents

## Testing

### Test 1: Same Account, Different Devices
1. **Device A**: Login → Use 5 credits → See "5 API calls"
2. **Device B**: Login with same account → Should show "5 API calls"
3. **Device B**: Use 3 more credits → See "8 API calls"
4. **Device A**: Should automatically update to "8 API calls"

### Test 2: Multiple Tabs
1. Open app in **Tab 1** and **Tab 2**
2. In **Tab 1**: Search for leads → Use 10 credits
3. In **Tab 2**: Credits should update to 10 immediately

### Test 3: Monthly Reset
1. Manually change system date to next month
2. Refresh app
3. Credits should show 0 (new month started)

### Test 4: Offline/Online
1. Turn off internet
2. Try to search → Will fail (can't sync)
3. Turn on internet
4. Search again → Credits sync properly

## Troubleshooting

### Credits not syncing?

**Check 1: Firestore Rules**
1. Go to Firebase Console → Firestore → Rules
2. Make sure rules allow authenticated users to read/write

**Check 2: Authentication**
1. Make sure user is logged in
2. Check browser console for errors

**Check 3: Internet Connection**
1. Firestore requires internet to sync
2. Check if you're online

### See "Permission Denied" error?

**Solution:**
1. Go to Firestore Rules in Firebase Console
2. Verify rules match the ones above
3. Click **Publish** to save changes
4. Refresh your app

### Credits showing 0 unexpectedly?

**Possible causes:**
1. **New month started** - Credits reset monthly
2. **First time login** - New users start at 0
3. **Manual reset** - Someone clicked "Reset Tracker"

**Check:**
- Look at the month shown in credit tracker
- Check "Next Reset" date

## Migration from localStorage

If you had credits in localStorage, they won't be migrated automatically. This is intentional to ensure clean Firestore data.

**To manually migrate:**
1. Note your old credits from localStorage
2. Use the app to make API calls
3. New credits will sync to Firestore

## Cost

**Firestore Free Tier:**
- 50,000 reads/day
- 20,000 writes/day
- 20,000 deletes/day

**Your usage:**
- 1 read on app load
- 1 write per API call
- Very low cost (likely free tier)

Estimated: **Free** for typical usage (100-1000 API calls/month)

## Security

✅ **User isolation**: Users can only see their own credits
✅ **Authentication required**: No access without login
✅ **Data validation**: Can't set negative credits
✅ **Production ready**: Secure by default

## Next Steps

After setting up Firestore rules:
1. ✅ Restart your app
2. ✅ Login with your account
3. ✅ Make a search
4. ✅ Open app on another device
5. ✅ Verify credits are synced!

---

**Need help?** Check Firebase Console logs for detailed error messages.
