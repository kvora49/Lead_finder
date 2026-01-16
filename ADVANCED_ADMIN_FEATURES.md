# Advanced Admin Features - Implementation Guide

## Overview
This guide covers three powerful admin features added to enhance user management, debugging, and monitoring capabilities:

1. **Credit Management Controls** - Manually add/remove credits and configure credit modes
2. **Login As Feature** - Admin impersonation for debugging user issues
3. **Export Leads History** - View and export user search history

---

## 1. Credit Management Controls

### Manual Credit Adjustments

Admins can now manually grant or remove credits for individual users:

**Access:** User Management → Click $ (Dollar) icon next to any user

**Features:**
- Grant bonus credits (e.g., for feedback, compensation)
- Remove credits (e.g., for abuse, refunds)
- Provide reason for adjustment (required for audit trail)
- Real-time preview of changes
- All actions logged in System Logs

**Example Use Cases:**
```
✅ Grant 500 credits - "Bonus for beta testing feedback"
✅ Grant 1000 credits - "Compensation for API downtime"
✅ Remove 200 credits - "Refund for duplicate charges"
✅ Remove 500 credits - "Abuse prevention - excessive scraping"
```

**Technical Details:**
- Updates `userCredits` collection with `increment()` for atomic operations
- Uses negative creditsUsed values (e.g., -500) to "grant" credits
- Logs admin action with timestamp, reason, and admin email
- Real-time listeners automatically update UI across all sessions

**Code Location:**
- Component: `src/components/admin/CreditManagementModal.jsx`
- Usage: Imported in `src/components/admin/UserManagement.jsx`

---

### Credit System Configuration

Super Admins can toggle between two credit modes:

**Access:** Admin Settings → Credit System Configuration → Configure Credit Mode

#### Mode 1: Global Shared Credits
- **Best for:** Managed teams, internal tools
- **How it works:** All users draw from a single shared credit pool
- **Configuration:** Set total global credit limit (e.g., 10,000 credits)
- **Use case:** Company with 10 employees sharing 10,000 monthly credits

#### Mode 2: Individual User Limits
- **Best for:** Public platforms, SaaS products
- **How it works:** Each user has their own credit balance
- **Configuration:** Set default limit for new users (e.g., 1,000 credits)
- **Use case:** Public platform where each user gets 1,000 free credits

**Technical Details:**
- Settings stored in `systemConfig/creditSettings` document
- Fields:
  ```javascript
  {
    creditMode: 'global' | 'individual',
    globalCreditLimit: 10000,
    defaultUserCreditLimit: 1000,
    lastModified: Timestamp,
    lastModifiedBy: 'admin@example.com'
  }
  ```
- Changes logged with full audit trail
- Existing user balances remain unchanged when switching modes

**Code Location:**
- Component: `src/components/admin/CreditSettingsModal.jsx`
- Usage: Imported in `src/components/admin/Settings.jsx`

---

## 2. Login As Feature (Admin Impersonation)

### Purpose
Allows admins to see the application exactly as a specific user sees it, crucial for:
- Debugging user-reported issues
- Verifying permission problems
- Testing user-specific configurations
- Understanding user experience

### How to Use

1. **Start Impersonation:**
   - Go to User Management
   - Find the user you want to impersonate
   - Click the 👤✓ (UserCheck) icon
   - Confirm the dialog

2. **Impersonation Session:**
   - You'll be redirected to the main app
   - Yellow banner appears at top: "Admin Mode: Viewing as user@example.com"
   - You see exactly what the user sees:
     - Their search history
     - Their credit balance
     - Their permissions
     - Their dashboard

3. **Exit Impersonation:**
   - Click "Exit Admin Mode" button in banner
   - Returns to admin dashboard

### Security Features

**Session Storage:**
```javascript
{
  adminUid: 'admin-uid-123',
  adminEmail: 'admin@company.com',
  targetUserId: 'user-uid-456',
  targetUserEmail: 'user@example.com',
  timestamp: '2026-01-16T10:30:00Z'
}
```

**Audit Trail:**
- All actions during impersonation are logged
- Logs show which admin performed the action
- Impersonation start/end times recorded

**Limitations:**
- Cannot change user passwords
- Cannot delete user accounts
- Cannot approve/reject other users
- Session expires when browser closes

### Technical Implementation

**URL Parameter:**
```
/?impersonate=user-uid-456
```

**Code Flow:**
1. User clicks "Login As" button
2. Admin session data stored in `sessionStorage`
3. Redirect to `/?impersonate=userId`
4. `App.jsx` checks for impersonation parameter
5. Banner displayed with exit button
6. All API calls use target user's credentials

**Code Locations:**
- Button: `src/components/admin/UserManagement.jsx` (handleLoginAsUser)
- Banner: `src/App.jsx` (impersonationMode state)
- Exit logic: `src/App.jsx` (exitImpersonation function)

---

## 3. Export Leads History

### Purpose
Monitor user activity, detect abuse, and analyze search patterns by viewing and exporting complete search history.

### Features

**Access:** User Management → Click 📜 (History) icon next to any user

**Dashboard Stats:**
- Total Searches
- Total Results Found
- Total Credits Used
- Success Rate (%)

**Time Filters:**
- All Time
- Today
- Last 7 Days
- Last 30 Days

**Data Displayed Per Search:**
- Timestamp
- Keywords searched
- Location queried
- Number of results
- Credits consumed
- Response time (ms)
- Success/Failed status

**Excel Export:**
- One-click export to `.xlsx` format
- Formatted with:
  - Color-coded headers (blue background)
  - Alternating row colors for readability
  - Borders on all cells
  - Auto-sized columns
- Filename: `search-history-{email}-{date}.xlsx`

### Use Cases

**Quality Monitoring:**
```
✓ Review what keywords users search
✓ Identify poor-quality searches
✓ Provide search optimization guidance
```

**Abuse Detection:**
```
⚠ User making 1000+ searches per day
⚠ Same keyword repeated 500 times
⚠ Excessive failed searches (possible scraping)
```

**Analytics:**
```
📊 Most popular search terms
📊 Peak usage times
📊 Average credits per search
📊 Success/failure patterns
```

### Technical Details

**Data Source:**
- Collection: `searchLogs`
- Query: 
  ```javascript
  where('userId', '==', targetUserId)
  orderBy('timestamp', 'desc')
  limit(100) // Last 100 searches
  ```

**Search Log Schema:**
```javascript
{
  userId: 'user-uid-123',
  keyword: 'wholesaler kurti',
  location: 'Mumbai, India',
  resultCount: 47,
  creditsUsed: 15,
  responseTime: 2340, // milliseconds
  success: true,
  timestamp: Timestamp,
  userEmail: 'user@example.com'
}
```

**Excel Generation:**
- Library: `exceljs@4.x`
- Features:
  - Workbook with single sheet
  - 7 columns (Timestamp, Keywords, Location, Results, Credits, Response Time, Success)
  - Professional styling with borders and colors
  - Proper column widths
  - Date formatting

**Code Location:**
- Component: `src/components/admin/UserSearchHistory.jsx`
- Excel library: Already installed (`npm install exceljs`)
- Usage: Imported in `src/components/admin/UserManagement.jsx`

---

## Installation & Dependencies

### New Dependencies
```bash
npm install exceljs
```

All other dependencies already installed.

### New Files Created
```
src/components/admin/
  ├── CreditManagementModal.jsx      (Credit adjustment UI)
  ├── CreditSettingsModal.jsx        (Credit mode configuration)
  └── UserSearchHistory.jsx          (Search history viewer)
```

### Modified Files
```
src/components/admin/
  ├── UserManagement.jsx             (Added 3 action buttons)
  └── Settings.jsx                   (Added credit config section)

src/
  └── App.jsx                        (Added impersonation banner)
```

---

## Firestore Collections Used

### New Collection
```
systemConfig/creditSettings (Document)
  ├── creditMode: string
  ├── globalCreditLimit: number
  ├── defaultUserCreditLimit: number
  ├── lastModified: Timestamp
  └── lastModifiedBy: string
```

### Existing Collections (Updated)
```
userCredits/* (Documents)
  └── creditsUsed: number (updated via increment)

searchLogs/* (Documents)
  └── (Read for history export)

systemLogs/* (Documents)
  └── (New logs for credit adjustments)
```

---

## Security Considerations

### Firestore Rules Required

Add to `firestore.rules`:

```javascript
// Allow admins to read/write credit settings
match /systemConfig/{document} {
  allow read: if isAdmin();
  allow write: if isSuperAdmin();
}

// Allow admins to view all user search logs
match /searchLogs/{logId} {
  allow read: if isAdmin();
  allow write: if request.auth != null;
}
```

### Role Permissions

| Feature | User | Admin | Super Admin |
|---------|------|-------|-------------|
| View Search History | ❌ | ✅ | ✅ |
| Export Search History | ❌ | ✅ | ✅ |
| Manual Credit Adjustment | ❌ | ✅ | ✅ |
| Configure Credit Mode | ❌ | ❌ | ✅ |
| Login As User | ❌ | ✅ | ✅ |

---

## Testing Guide

### 1. Test Credit Management

**Manual Adjustment:**
```
1. Go to User Management
2. Click $ icon next to test user
3. Grant 500 credits with reason "Testing"
4. Verify credit balance updates
5. Check System Logs for entry
6. Try removing 200 credits
7. Verify subtraction works
```

**Credit Mode Toggle:**
```
1. Go to Settings as Super Admin
2. Click "Configure Credit Mode"
3. Switch from Global to Individual
4. Set limits: Global=10000, Individual=1000
5. Save and verify in Firestore
6. Check System Logs for change
```

### 2. Test Login As Feature

**Basic Flow:**
```
1. Go to User Management
2. Click 👤✓ icon next to test user
3. Confirm dialog
4. Verify yellow banner appears
5. Check if you see user's data
6. Click "Exit Admin Mode"
7. Verify return to admin dashboard
```

**Security Check:**
```
1. During impersonation, check:
   - Cannot access /admin routes
   - Search works with user's credits
   - User's email shown in profile
2. Close browser tab
3. Reopen - impersonation should NOT persist
```

### 3. Test Search History Export

**View History:**
```
1. Go to User Management
2. Click 📜 icon next to user with searches
3. Verify stats display correctly
4. Apply "Today" filter
5. Verify filtered results
```

**Export Excel:**
```
1. Click "Export to Excel"
2. Verify file downloads
3. Open in Excel/Google Sheets
4. Check formatting:
   - Blue headers
   - Alternating row colors
   - Proper data in all columns
5. Verify filename format
```

---

## Troubleshooting

### Issue: Credit adjustment not working

**Solution:**
```javascript
// Check Firestore rules allow admin write access
match /userCredits/{userId} {
  allow read, write: if isAdmin();
}

// Verify admin role in adminUsers collection
// Verify user document exists in userCredits
```

### Issue: Login As redirects to login page

**Solution:**
```javascript
// Check sessionStorage persists
console.log(sessionStorage.getItem('adminImpersonation'));

// Verify URL parameter passed correctly
// Check AuthContext doesn't clear session
```

### Issue: Search history empty

**Solution:**
```javascript
// Verify searchLogs collection has data
// Check userId matches exactly
// Ensure logSearch() called in App.jsx:
await logSearch(currentUser.uid, keyword, location, leads.length, apiCalls);
```

### Issue: Excel export fails

**Solution:**
```bash
# Reinstall exceljs
npm install exceljs

# Check browser console for errors
# Verify ExcelJS import in component
import ExcelJS from 'exceljs';
```

---

## API Reference

### Credit Management Modal

```jsx
<CreditManagementModal
  user={selectedUser}        // User object with id, email, creditsUsed
  adminUser={currentAdmin}   // Admin object with uid, email
  onClose={() => {}}         // Callback when modal closes
  onSuccess={() => {}}       // Callback when credits updated
/>
```

### Credit Settings Modal

```jsx
<CreditSettingsModal
  adminUser={currentAdmin}   // Admin object with uid, email
  onClose={() => {}}         // Callback when modal closes
  onUpdate={() => {}}        // Callback when settings saved
/>
```

### User Search History

```jsx
<UserSearchHistory
  user={selectedUser}        // User object with id, email
  onClose={() => {}}         // Callback when modal closes
/>
```

---

## Performance Optimization

### Search History Query Limits

```javascript
// Current: Last 100 searches per user
limit(100)

// To show more:
limit(500)  // Increase limit

// To paginate:
const lastVisible = snapshot.docs[snapshot.docs.length - 1];
query(..., startAfter(lastVisible), limit(50))
```

### Excel Export File Size

```javascript
// Current: No limit
// Recommendation: Limit to 1000 rows
const searches = allSearches.slice(0, 1000);
worksheet.addRows(searches);
```

---

## Future Enhancements

### Planned Features

1. **Bulk Credit Operations**
   - Select multiple users
   - Grant credits to all at once
   - Export credit audit report

2. **Advanced Impersonation**
   - Time-limited sessions (auto-expire)
   - Two-factor approval required
   - Detailed impersonation logs

3. **Search Analytics Dashboard**
   - Most searched keywords (all users)
   - Geographic heatmap
   - Time-series graphs
   - Conversion funnel

4. **Automated Abuse Detection**
   - Alert when user exceeds thresholds
   - Auto-suspend suspicious accounts
   - ML-based pattern recognition

---

## Support

For issues or questions:

1. Check Firestore Console for data integrity
2. Review browser console for errors
3. Check System Logs for audit trail
4. Verify admin permissions in `adminUsers` collection

**Common Admin Actions:**
- Grant credits: User Management → $ icon
- View searches: User Management → 📜 icon
- Debug as user: User Management → 👤✓ icon
- Configure credits: Settings → Credit System Configuration

---

## Summary

These three features provide comprehensive admin control:

✅ **Credit Management** - Full control over user credits (individual and global)
✅ **Login As** - Debug user issues by seeing their exact view
✅ **Search History** - Monitor usage and detect abuse with Excel export

All features include:
- Real-time updates
- Comprehensive logging
- Professional UI
- Security controls
- Audit trails

**Total new files:** 3 components
**Total modified files:** 3 components
**New dependencies:** exceljs (already installed)
**Firestore rules:** Updated (deploy required)

Implementation complete and production-ready! 🚀
