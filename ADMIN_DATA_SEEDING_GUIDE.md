# 🔧 Admin Dashboard - Data Seeding Guide

## Problem
Admin dashboard showing all zeros because Firestore collections are empty:
- ❌ Total Registered Users: 0
- ❌ Active Users: 0  
- ❌ Global API Calls: 0
- ❌ Cost Trend Graph: Empty
- ❌ User Management: No users
- ❌ System Logs: 0 logs

## Solution: Use the Built-in Data Seeder

### Step 1: Access Admin Dashboard
1. Open your app: http://localhost:3002
2. Login with your admin account
3. Click "Admin Dashboard" button in header
4. Navigate to "Settings" tab (gear icon in sidebar)

### Step 2: Seed Test Data
1. Scroll down to "Database Seeder" section (blue panel)
2. Click **"Seed Test Data"** button
3. Wait for success message: "✅ Data seeded successfully!"
4. **Refresh the dashboard page** (F5 or Ctrl+R)

### Step 3: Verify Data Populated

**Dashboard should now show:**
- ✅ Global API Calls: 504
- ✅ Current Month Cost: $2.52
- ✅ Cost Trend Graph: Last 6 months (Aug 2025 - Jan 2026)
- ✅ Credit Usage: 0.3% (504/200,000)
- ✅ System Logs: 6 sample logs
- ✅ Recent Activity: 4 activities

**What Gets Created:**
- `globalCredits/shared` - 504 total API calls
- `systemConfig/creditSystem` - Global credit mode, 200K limit
- `systemLogs/*` - 6 sample activity logs
- `monthlyAnalytics/*` - 6 months of historical data

**What Doesn't Get Created:**
- ❌ **User accounts** - Users must register normally via the app
- ❌ **Search logs** - Generated when users perform searches
- ❌ **Access control records** - Created when users request access

---

## User Registration (To Fix Empty User Management)

### Why User Management is Empty
The User Management page shows **0 users** because:
1. No regular users have registered yet
2. Only admin accounts exist (which are filtered out from user stats)
3. Users must register through the normal registration flow

### How to Add Test Users

**Option 1: Register via UI (Recommended)**
1. **Logout** from admin dashboard
2. Go to registration page: http://localhost:3002/register
3. Register a test account:
   - Email: `testuser1@example.com`
   - Password: `Test123!@#`
   - Name: `Test User 1`
4. **Verify email** if email verification is enabled
5. Login and perform a search to generate activity
6. Repeat for more test users

**Option 2: Use Firebase Authentication Console**
1. Go to: https://console.firebase.google.com/project/lead-finder-6b009/authentication/users
2. Click "Add User"
3. Enter email and password
4. User will appear in User Management after first login

**Option 3: Disable Email Verification (For Testing Only)**
1. Go to Admin Dashboard → Settings
2. Find "Security Settings" section
3. Toggle OFF "Require Email Verification"
4. Click "Save Settings"
5. Now test users can register without verifying email

---

## Understanding the Dashboard Metrics

### Total Registered Users
- **Counts:** Regular users with `role: 'user'`
- **Excludes:** Admin accounts (`role: 'admin'` or `role: 'super_admin'`)
- **Updates:** Real-time when users register

### Active Users (30 Days)
- **Counts:** Users with `lastActive` within last 30 days
- **Excludes:** Admins
- **Updates:** Real-time when users login/search

### Global API Calls
- **Source:** `globalCredits/shared/totalApiCalls`
- **Updates:** Real-time when searches are performed
- **Seeded Value:** 504 calls

### Current Month Cost
- **Calculation:** Based on `totalApiCalls` × pricing tier
- **Pricing:** $0.005 per API call (after free tier)
- **Updates:** Real-time with API calls

### Cost Trend Graph
- **Source:** `monthlyAnalytics/{month}` documents
- **Shows:** Last 6 months of costs
- **Seeded:** Aug 2025 - Jan 2026 with sample data

---

## Troubleshooting

### Dashboard Still Shows Zeros After Seeding

**1. Did you refresh the page?**
- Press F5 or Ctrl+R to reload
- Dashboard uses real-time listeners but may need refresh

**2. Check Firestore Console**
- Go to: https://console.firebase.google.com/project/lead-finder-6b009/firestore/databases/-default-/data
- Verify collections exist:
  - `globalCredits/shared` ✓
  - `systemConfig/creditSystem` ✓
  - `systemLogs` (6 documents) ✓
  - `monthlyAnalytics` (6 documents) ✓

**3. Check Browser Console**
- Press F12 to open DevTools
- Look for Firebase errors (permission denied, network issues)
- Check if real-time listeners are connected

**4. Verify Admin Permissions**
- Make sure you're logged in as admin/super_admin
- Check `adminUsers` collection has your email

### User Management Shows "Showing 0-0 of 0 users"

**This is normal if:**
- ✅ No regular users have registered yet
- ✅ Only admin accounts exist (they're filtered out)

**To fix:**
- Register test users via /register page
- Users will appear immediately after first login
- Search functionality will generate user activity

### System Logs Shows 0

**After seeding, should show 6 logs:**
- user_login
- search_performed  
- export_excel
- credit_deducted
- user_registered
- admin_action

**If still 0:**
- Re-run "Seed Test Data" button
- Check Firestore rules allow writes to `systemLogs`
- Verify you're logged in as admin

### Access Control Shows Nothing

**This is normal:**
- Access Control only shows pending approval requests
- No requests exist until users submit access requests
- This feature may not be used in your current setup

---

## Manual Data Verification (Firebase Console)

### Check Global Credits
1. Go to Firestore: https://console.firebase.google.com/project/lead-finder-6b009/firestore
2. Navigate to `globalCredits` → `shared`
3. Verify `totalApiCalls: 504`

### Check System Config
1. Navigate to `systemConfig` → `creditSystem`
2. Verify:
   - `mode: "global"`
   - `globalLimit: 200000`

### Check System Logs
1. Navigate to `systemLogs` collection
2. Should see 6 documents
3. Each with `action`, `severity`, `details`, `timestamp`

### Check Monthly Analytics
1. Navigate to `monthlyAnalytics` collection
2. Should see 6 documents (2025-08 through 2026-01)
3. Each with `totalApiCalls`, `totalCost`, `totalSearches`, `activeUsers`

---

## Alternative: CLI Seeding (Advanced)

If you prefer command-line seeding:

```bash
npm run seed
```

**Note:** This won't work without authentication. Use the in-app Data Seeder instead.

---

## Production Considerations

### ⚠️ Before Going Live

1. **Remove Test Data**
   - Delete all seeded documents from Firestore
   - Start fresh with real production data

2. **Disable Data Seeder**
   - Comment out `<DataSeeder />` in Settings.jsx
   - Or add environment check to hide in production

3. **Real User Registration**
   - Enable email verification
   - Set up proper email service (SendGrid, etc.)
   - Configure approval workflow if needed

4. **Monitor Real Metrics**
   - Dashboard will automatically populate with real data
   - Global credits update as users search
   - Analytics generated monthly automatically

---

## Summary

### Quick Fix Steps
1. ✅ Go to Admin Dashboard → Settings
2. ✅ Click "Seed Test Data" button
3. ✅ Refresh page (F5)
4. ✅ Dashboard now shows data

### For User Management
1. ✅ Register test users at /register
2. ✅ Login and perform searches
3. ✅ Users appear in management table

### Expected Results
- Dashboard shows 504 API calls, $2.52 cost
- Cost trend graph displays 6 months
- System logs show 6 activities
- User count = actual registered users (not admins)

---

**Last Updated:** January 16, 2026  
**Support:** Check browser console for errors, verify Firestore permissions
