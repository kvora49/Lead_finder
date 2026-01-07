# Admin Dashboard Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies
```bash
cd "c:\Project\Information extracter"
npm install recharts
```

### Step 2: Create Your First Admin User

#### Option A: Firebase Console (Recommended)
1. Open [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Firestore Database**
4. Click **Start Collection**
5. Collection ID: `adminUsers`
6. Click **Next**
7. Document ID: **Your Email** (e.g., `admin@yourcompany.com`)
8. Add these fields:

| Field | Type | Value |
|-------|------|-------|
| `email` | string | `admin@yourcompany.com` |
| `role` | string | `super_admin` |
| `createdAt` | timestamp | (click timestamp icon) |

9. Add a **Map** field called `permissions` with these sub-fields:

| Sub-field | Type | Value |
|-----------|------|-------|
| `canManageUsers` | boolean | `true` |
| `canViewAnalytics` | boolean | `true` |
| `canModifySettings` | boolean | `true` |
| `canAccessLogs` | boolean | `true` |

10. Click **Save**

#### Option B: Setup Script
```bash
# Edit scripts/setupAdmin.js and change the email
# Then run:
node scripts/setupAdmin.js
```

### Step 3: Create System Configuration

1. In Firestore, click **Start Collection** again
2. Collection ID: `systemConfig`
3. Document ID: `global`
4. Add these fields:

```javascript
{
  rapidApiKey: "",                      // Your RapidAPI key
  apiRateLimit: 100,                    // Requests per minute
  maxResultsPerSearch: 100,             // Max results per search
  defaultCreditLimit: 1000,             // Default credits per user
  creditCostPerSearch: 5,               // Credits per search
  creditAlertThreshold: 80,             // Alert at 80% usage
  emailNotifications: true,             // Enable email alerts
  emailProvider: "sendgrid",            // Email service
  emailApiKey: "",                      // Email API key
  notificationEmail: "admin@company.com", // Admin email
  requireEmailVerification: true,       // Require email verification
  autoApproveUsers: false,              // Manual user approval
  sessionTimeout: 30,                   // Minutes
  maintenanceMode: false,               // Maintenance mode
  debugMode: false,                     // Debug logging
  updatedAt: [timestamp],               // Current timestamp
  updatedBy: "admin"                    // Your email
}
```

### Step 4: Update Firestore Security Rules

1. In Firebase Console, go to **Firestore Database**
2. Click on **Rules** tab
3. Replace with these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is admin
    function isAdmin() {
      return request.auth != null && 
             exists(/databases/$(database)/documents/adminUsers/$(request.auth.token.email));
    }
    
    function isSuperAdmin() {
      return isAdmin() && 
             get(/databases/$(database)/documents/adminUsers/$(request.auth.token.email)).data.role == 'super_admin';
    }
    
    // Admin Users Collection
    match /adminUsers/{adminId} {
      allow read: if request.auth != null && request.auth.token.email == adminId;
      allow write: if isSuperAdmin();
    }
    
    // System Config
    match /systemConfig/{configId} {
      allow read: if isAdmin();
      allow write: if isSuperAdmin();
    }
    
    // User Credits (Admin can read/write, users can read their own)
    match /userCredits/{userId} {
      allow read: if request.auth != null && 
                     (request.auth.uid == userId || isAdmin());
      allow write: if isAdmin();
    }
    
    // Users Collection (Admin can read/write, users can read their own)
    match /users/{userId} {
      allow read: if request.auth != null && 
                     (request.auth.uid == userId || isAdmin());
      allow write: if isAdmin();
    }
    
    // User Profiles
    match /userProfiles/{userId} {
      allow read, write: if request.auth != null && 
                            (request.auth.uid == userId || isAdmin());
    }
    
    // Admin Logs (Admin only)
    match /adminLogs/{logId} {
      allow read: if isAdmin();
      allow write: if isAdmin();
    }
    
    // Search Analytics (Admin only)
    match /searchAnalytics/{analyticsId} {
      allow read, write: if isAdmin();
    }
  }
}
```

4. Click **Publish**

### Step 5: Start the Application

```bash
npm run dev
```

### Step 6: Access Admin Dashboard

1. Open your browser
2. Go to: `http://localhost:5173/login`
3. Login with your admin email
4. Navigate to: `http://localhost:5173/admin`

✅ **You're now in the admin dashboard!**

---

## 📊 Dashboard Features Overview

### Dashboard Home (`/admin`)
- Total users, active users, API calls, costs
- 6-month cost trend chart
- Credit usage gauge (real-time)
- Recent activity feed

### User Management (`/admin/users`)
- Search and filter users
- View user details
- Set credit limits (Unlimited/Custom/Suspended)
- Suspend/activate users
- Export user data to CSV

### Credit Analytics (`/admin/credits`)
- Total cost monitoring
- Top spenders ranking
- Credit distribution chart
- Usage alerts

### Search Analytics (`/admin/analytics`)
- Search trends over time
- Top keywords with success rates
- Popular locations
- Time range filters (7/30/90 days)

### Access Control (`/admin/access`)
- Approve/reject new users
- Manage user status
- Send verification emails
- View recent access actions

### System Logs (`/admin/logs`)
- Comprehensive audit trail
- Filter by type/severity/search
- Export logs to CSV
- Real-time activity monitoring

### Settings (`/admin/settings`)
- API configuration (RapidAPI key, rate limits)
- Credit settings (limits, costs, alerts)
- Email setup (provider, notifications)
- Security options (verification, auto-approval)
- System controls (maintenance mode, debug)

---

## 🔐 User Roles

### Super Admin (`super_admin`)
- ✅ Full dashboard access
- ✅ User management
- ✅ Credit management
- ✅ View all analytics
- ✅ Access system logs
- ✅ **Modify settings**
- ✅ **Access control**

### Admin (`admin`)
- ✅ Dashboard access
- ✅ User management
- ✅ Credit management
- ✅ View analytics
- ✅ View system logs
- ❌ Cannot modify settings
- ⚠️ Limited access control

### Viewer (`viewer`)
- ✅ Dashboard access (read-only)
- ✅ View analytics
- ❌ Cannot manage users
- ❌ Cannot modify anything
- ❌ No access control

---

## 🎨 Customization

### Change Theme Colors
Edit `src/components/admin/AdminLayout.jsx`:

```javascript
// Primary color (blue)
className="bg-blue-600" → className="bg-purple-600"

// Background
className="bg-slate-900" → className="bg-gray-900"

// Accent colors in charts
stroke="#3b82f6" → stroke="#a855f7"
```

### Add New Admin User
Go to Firebase Console → Firestore → `adminUsers` collection → Add Document:

```javascript
{
  email: "newadmin@company.com",
  role: "admin",  // or "super_admin" or "viewer"
  createdAt: [timestamp],
  permissions: {
    canManageUsers: true,
    canViewAnalytics: true,
    canModifySettings: false,  // false for regular admin
    canAccessLogs: true
  }
}
```

### Customize Credit Costs
Go to `/admin/settings` (as Super Admin):
- Change "Credits Cost Per Search"
- Adjust "Default Credit Limit"
- Set "Alert Threshold"

---

## 🐛 Troubleshooting

### "Cannot access /admin" Error
**Solution**: Make sure you:
1. Created admin user in `adminUsers` collection
2. Email in Firestore matches your login email (case-sensitive)
3. Updated Firestore security rules

### Charts Not Showing
**Solution**: 
```bash
npm install recharts
npm run dev  # Restart dev server
```

### "Permission Denied" in Settings
**Solution**: Only Super Admins can modify settings. Check your `role` field in Firestore:
- Must be `super_admin` (not `admin` or `Super Admin`)

### User Credits Not Updating
**Solution**: Check Firestore security rules allow admin writes to `userCredits` collection

### Admin Dashboard is Blank
**Solution**: 
1. Open browser console (F12)
2. Look for errors
3. Common issues:
   - Firebase not initialized
   - Missing Firestore collections
   - Network errors

---

## 📧 Email Setup (Optional)

To enable email notifications:

### SendGrid Setup
1. Create account at [sendgrid.com](https://sendgrid.com)
2. Get API key
3. Go to `/admin/settings`
4. Enter API key in "Email API Key"
5. Set "Notification Email"
6. Toggle "Email Notifications" ON

### Mailgun Setup
1. Create account at [mailgun.com](https://mailgun.com)
2. Get API key
3. Select "Mailgun" as provider
4. Enter API key

---

## 🚀 Next Steps

1. **Set RapidAPI Key**: Go to Settings → API Configuration
2. **Configure Credits**: Adjust default limits in Settings
3. **Add Team Members**: Create additional admin users in Firestore
4. **Customize Dashboard**: Modify colors and branding
5. **Enable Email Alerts**: Configure email provider
6. **Review Security Rules**: Ensure proper access control

---

## 📞 Support

If you encounter issues:
1. Check `ADMIN_DASHBOARD_README.md` for detailed docs
2. Review Firestore security rules
3. Check browser console for errors
4. Verify Firebase configuration

---

**Happy Managing! 🎉**
