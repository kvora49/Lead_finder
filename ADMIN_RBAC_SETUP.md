# Admin RBAC (Role-Based Access Control) Setup Guide

## 🎯 Overview

Your system has a 3-tier admin hierarchy:
- **Super Admin**: Full control (settings, users, analytics)
- **Admin**: User management + analytics (no settings access)
- **Viewer**: Read-only access to analytics

---

## 📋 Step-by-Step: Add Regular Admin User

### **Method 1: Using Script (Automated)**

#### Step 1: Update Admin Email
Edit `scripts/addAdmin.js` line 32:
```javascript
const adminEmail = 'newadmin@company.com'; // Change to actual email
```

#### Step 2: Run Script
```bash
cd "c:\Project\Information extracter"
node scripts/addAdmin.js
```

✅ **Done!** The admin user is created with RBAC permissions.

---

### **Method 2: Firebase Console (Manual)**

#### Step 1: Open Firebase Console
1. Go to https://console.firebase.google.com/
2. Select project: **lead-finder-6b009**
3. Navigate to **Firestore Database**

#### Step 2: Create Admin Document
1. Click on **adminUsers** collection (or create it if it doesn't exist)
2. Click **Add document**
3. **Document ID**: Enter the admin's email (e.g., `admin@company.com`)
   - ⚠️ **Important**: Must match their Firebase Auth email exactly

#### Step 3: Add Fields

**Basic Fields:**
```
Field Name: email
Type: string
Value: admin@company.com
```

```
Field Name: role
Type: string
Value: admin
```

```
Field Name: createdAt
Type: timestamp
Value: (Click timestamp icon to use current time)
```

**Permissions Map:**
```
Field Name: permissions
Type: map
Add these 4 sub-fields:
```

**Sub-fields inside permissions map:**
```
canManageUsers
Type: boolean
Value: true
```

```
canViewAnalytics
Type: boolean
Value: true
```

```
canModifySettings
Type: boolean
Value: false
```

```
canAccessLogs
Type: boolean
Value: true
```

#### Step 4: Save
Click **Save** button

---

## 🔐 RBAC Permission Matrix

| Feature | Super Admin | Admin | Viewer |
|---------|-------------|-------|--------|
| **Dashboard** | ✅ Full Access | ✅ Full Access | ✅ Full Access |
| **User Management** | ✅ CRUD All Users | ✅ CRUD All Users | ❌ Read Only |
| **Credit Analytics** | ✅ Full Access | ✅ Full Access | ✅ View Only |
| **Search Analytics** | ✅ Full Access | ✅ Full Access | ✅ View Only |
| **Access Control** | ✅ Approve/Reject | ✅ Approve/Reject | ❌ No Access |
| **System Logs** | ✅ Full Access | ✅ Full Access | ✅ View Only |
| **System Settings** | ✅ Edit All | ❌ Read Only | ❌ Read Only |
| **Modify Credits** | ✅ Yes | ✅ Yes | ❌ No |
| **Export Data** | ✅ Yes | ✅ Yes | ✅ Yes |

---

## 🔍 How RBAC Works

### 1. **Authentication Check**
File: `src/contexts/AdminAuthContext.jsx`
```javascript
// Checks if user exists in adminUsers collection
const adminDoc = await getDoc(doc(db, 'adminUsers', user.email));
```

### 2. **Role Verification**
```javascript
// Retrieves role from Firestore document
const adminData = adminDoc.data();
const role = adminData.role; // 'super_admin', 'admin', or 'viewer'
```

### 3. **Permission Checks**
Each component checks permissions:

**Settings Page** (`src/components/admin/Settings.jsx`):
```javascript
const isSuperAdmin = adminUser?.role === 'super_admin';

// Only super_admin can edit settings
<input disabled={!isSuperAdmin} />
```

**User Management** (`src/components/admin/UserManagement.jsx`):
```javascript
const canManage = adminUser?.permissions?.canManageUsers;

// Admin and super_admin can manage users
{canManage && (
  <button onClick={handleSuspend}>Suspend</button>
)}
```

**Access Control** (`src/components/admin/AccessControl.jsx`):
```javascript
// Only admin+ can approve users
if (adminUser?.role === 'viewer') {
  return <div>Access Denied</div>;
}
```

---

## 🧪 Testing RBAC

### Test 1: Admin Login
1. Create Firebase Auth account with email `admin@company.com`
2. Add to `adminUsers` collection with `role: 'admin'`
3. Log in at `/admin/dashboard`
4. ✅ Should see all pages except Settings edit
5. ✅ Should be able to manage users
6. ❌ Should NOT be able to edit system settings

### Test 2: Settings Access
1. Navigate to `/admin/settings`
2. ✅ Super Admin: All inputs enabled
3. ❌ Admin: All inputs disabled (read-only)
4. ❌ Viewer: All inputs disabled (read-only)

### Test 3: User Management
1. Navigate to `/admin/users`
2. ✅ Super Admin: Can suspend/activate/edit
3. ✅ Admin: Can suspend/activate/edit
4. ❌ Viewer: Cannot perform actions

---

## 🔧 Troubleshooting

### Issue: "Access Denied" after login

**Solution:**
1. Check Firestore `adminUsers` collection
2. Document ID must **exactly match** the Firebase Auth email
3. Verify `role` field is set correctly

### Issue: Admin can edit settings

**Solution:**
Check `role` field is `'admin'` not `'super_admin'`

### Issue: Admin cannot manage users

**Solution:**
Verify `permissions.canManageUsers` is `true`

---

## 🚀 Quick Commands

**Add Admin:**
```bash
node scripts/addAdmin.js
```

**View all admins:**
```javascript
// Firebase Console > Firestore > adminUsers collection
```

**Check user permissions:**
```javascript
// Look at document: adminUsers/{email}
```

---

## 📚 Related Files

- **Auth Context**: `src/contexts/AdminAuthContext.jsx`
- **Admin Route Guard**: `src/components/admin/AdminRoute.jsx`
- **Settings (RBAC)**: `src/components/admin/Settings.jsx`
- **User Management (RBAC)**: `src/components/admin/UserManagement.jsx`
- **Access Control (RBAC)**: `src/components/admin/AccessControl.jsx`

---

## ✨ Pro Tips

1. **Always use email as document ID** - Makes lookup faster
2. **Test with multiple roles** - Create test accounts for each role
3. **Document permissions** - Keep track of who has what access
4. **Audit logs** - Check `adminLogs` collection for admin actions
5. **Least privilege** - Start with `viewer`, upgrade as needed

---

## 🎯 Next Steps

1. ✅ Create your first admin user
2. ✅ Test login at `/admin/dashboard`
3. ✅ Verify permissions work correctly
4. ✅ Add more admins as needed
5. ✅ Monitor via System Logs page

Need to add **Viewer** role? Use same process but set `role: 'viewer'`
