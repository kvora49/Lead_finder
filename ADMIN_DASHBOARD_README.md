# Admin Dashboard Documentation

## Overview
This is a comprehensive admin dashboard for the Lead Finder application with a premium dark theme design. It provides full control over users, credits, analytics, and system settings.

## Features

### 1. Dashboard Overview (`/admin`)
- **Real-time Metrics**: Total users, active users, API calls, current costs
- **Cost Trends Chart**: 6-month cost analysis with area chart visualization
- **Credit Usage Meter**: Real-time global credit consumption with circular progress
- **Recent Activity Feed**: Latest user actions and system events

### 2. User Management (`/admin/users`)
- **User Table**: Complete list with search and filters
- **Credit Control**: Set limits (Unlimited/Custom/Suspended)
- **User Actions**: View details, suspend, activate, export to CSV
- **Status Management**: Active, Suspended, Pending badges
- **Usage Statistics**: Searches, exports, login counts per user

### 3. Credit Analytics (`/admin/credits`)
- **Cost Monitoring**: Total cost, average per user, monthly trends
- **Top Spenders**: Rankings by credit usage
- **Credit Distribution**: Pie chart showing usage ranges
- **Alert System**: Warnings for users approaching limits
- **Export Reports**: Download analytics data

### 4. Search Analytics (`/admin/analytics`)
- **Search Trends**: Line chart showing search patterns over time
- **Top Keywords**: Most searched terms with success rates
- **Top Locations**: Most queried locations with result counts
- **Success Metrics**: Overall search success rate, average response time
- **Time Range Filters**: 7, 30, or 90 days

### 5. Access Control (`/admin/access`)
- **Pending Approvals**: Review new user registrations
- **User Status Management**: Approve, reject, or suspend users
- **Email Verification**: Send verification emails
- **Audit Trail**: Recent access control actions
- **Role-Based Actions**: Super Admin exclusive features

### 6. System Logs (`/admin/logs`)
- **Comprehensive Logging**: Authentication, searches, admin actions, system events
- **Advanced Filters**: By type, severity, search terms
- **Severity Levels**: Info, Warning, Error with color coding
- **Export Capability**: Download logs as CSV
- **Real-time Monitoring**: Latest system activities

### 7. Settings (`/admin/settings`)
- **API Configuration**: RapidAPI key, rate limits, max results
- **Credit Settings**: Default limits, cost per search, alert thresholds
- **Email Setup**: Provider selection, API keys, notification emails
- **Security Options**: Email verification, auto-approval, session timeout
- **System Controls**: Maintenance mode, debug mode
- **Super Admin Only**: Read-only for regular admins

## Access Levels

### Super Admin
- Full access to all features
- Can modify settings
- Can manage other admins
- Access control permissions

### Admin
- View all analytics and logs
- Manage users and credits
- Cannot modify system settings
- Limited access control

### Viewer
- Read-only access
- View dashboards and reports
- Cannot perform actions
- No user management

## Installation & Setup

### 1. Install Dependencies
```bash
npm install recharts
```

### 2. Create Admin User in Firestore

Navigate to Firebase Console → Firestore Database → Create collection:

**Collection**: `adminUsers`

**Document ID**: Your email (e.g., `admin@company.com`)

**Fields**:
```javascript
{
  email: "admin@company.com",
  role: "super_admin",  // or "admin" or "viewer"
  createdAt: <timestamp>,
  permissions: {
    canManageUsers: true,
    canViewAnalytics: true,
    canModifySettings: true,
    canAccessLogs: true
  }
}
```

### 3. Create System Config Collection

**Collection**: `systemConfig`

**Document ID**: `global`

**Fields**:
```javascript
{
  rapidApiKey: "your-api-key",
  apiRateLimit: 100,
  defaultCreditLimit: 1000,
  creditCostPerSearch: 5,
  creditAlertThreshold: 80,
  emailNotifications: true,
  emailProvider: "sendgrid",
  emailApiKey: "",
  notificationEmail: "admin@company.com",
  requireEmailVerification: true,
  autoApproveUsers: false,
  sessionTimeout: 30,
  maintenanceMode: false,
  debugMode: false,
  maxResultsPerSearch: 100,
  updatedAt: <timestamp>
}
```

### 4. Update Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Admin Users Collection
    match /adminUsers/{adminId} {
      allow read: if request.auth != null && request.auth.token.email == adminId;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/adminUsers/$(request.auth.token.email)).data.role == 'super_admin';
    }
    
    // System Config
    match /systemConfig/{configId} {
      allow read: if request.auth != null && 
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.token.email));
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/adminUsers/$(request.auth.token.email)).data.role == 'super_admin';
    }
    
    // User Credits (Admin can read/write)
    match /userCredits/{userId} {
      allow read: if request.auth != null && (
        request.auth.uid == userId || 
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.token.email))
      );
      allow write: if request.auth != null && 
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.token.email));
    }
    
    // Users Collection (Admin can read/write)
    match /users/{userId} {
      allow read: if request.auth != null && (
        request.auth.uid == userId || 
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.token.email))
      );
      allow write: if request.auth != null && 
        exists(/databases/$(database)/documents/adminUsers/$(request.auth.token.email));
    }
  }
}
```

### 5. Access the Admin Dashboard

1. Make sure you're logged in with an admin account
2. Navigate to: `http://localhost:5173/admin`
3. You'll be redirected to login if not authenticated

## Design System

### Colors
- **Background**: `slate-900` (#0f172a)
- **Card Background**: `slate-800/50` with backdrop blur
- **Borders**: `slate-700/50`
- **Primary Blue**: `#3b82f6`
- **Success Green**: `#10b981`
- **Warning Yellow**: `#f59e0b`
- **Error Red**: `#ef4444`
- **Purple Accent**: `#a855f7`

### Typography
- **Headings**: Font weight 700 (bold)
- **Body**: Font weight 400 (regular)
- **UI Elements**: Font weight 500 (medium)

### Components
- **Cards**: Rounded corners (xl), soft shadows, glass morphism effect
- **Buttons**: Primary blue, rounded (lg), hover transitions
- **Icons**: Lucide React icons, 20px (w-5 h-5)
- **Charts**: Recharts library with custom styling

## Responsive Breakpoints

- **Mobile**: < 768px (1 column layouts)
- **Tablet**: 768px - 1024px (2 column layouts)
- **Desktop**: > 1024px (3-4 column layouts)

## File Structure

```
src/
├── components/
│   └── admin/
│       ├── AdminLayout.jsx          # Main layout with navigation
│       ├── AdminRoute.jsx           # Protected route wrapper
│       ├── Dashboard.jsx            # Dashboard overview
│       ├── UserManagement.jsx       # User table & management
│       ├── UserDetailsModal.jsx     # User edit modal
│       ├── CreditAnalytics.jsx      # Credit monitoring
│       ├── SearchAnalytics.jsx      # Search insights
│       ├── AccessControl.jsx        # User approvals
│       ├── SystemLogs.jsx           # Audit trail
│       └── Settings.jsx             # Global settings
└── contexts/
    └── AdminAuthContext.jsx         # Admin authentication
```

## API Integrations

### Firestore Collections Used:
- `adminUsers` - Admin user profiles
- `users` - All user accounts
- `userCredits` - Credit tracking
- `userProfiles` - Extended user data
- `systemConfig` - Global settings
- `searchAnalytics` - Search data (optional)
- `adminLogs` - Audit trail (optional)

### RapidAPI:
- LinkedIn Data Scraper
- Rate limiting configured in settings
- API key stored securely in Firestore

## Security Considerations

1. **Role-Based Access**: Three-tier permission system
2. **Protected Routes**: AdminRoute wrapper checks authentication
3. **Firestore Rules**: Restrict access to admin collections
4. **API Keys**: Never expose in frontend, store in Firestore
5. **Session Management**: Configurable timeout
6. **Audit Logging**: Track all admin actions

## Troubleshooting

### Admin Dashboard Not Loading
- Check if user exists in `adminUsers` collection
- Verify email matches authenticated user
- Check browser console for errors

### Cannot Save Settings
- Ensure user has `super_admin` role
- Check Firestore security rules
- Verify network connection

### Charts Not Rendering
- Ensure Recharts is installed: `npm install recharts`
- Check data format matches chart requirements
- Look for console errors

### User Management Actions Failing
- Verify Firestore permissions
- Check if user document exists
- Ensure admin has proper role

## Future Enhancements

1. **Real-time Updates**: Use Firestore snapshots for live data
2. **Email Notifications**: Integrate SendGrid/Mailgun
3. **Scheduled Reports**: Automated analytics emails
4. **Advanced Filters**: Date ranges, custom queries
5. **Bulk Actions**: Multi-user operations
6. **Export Formats**: PDF, Excel support
7. **Custom Dashboards**: User-configurable widgets
8. **Mobile App**: React Native admin app

## Support

For issues or questions:
- Check Firebase Console logs
- Review browser console errors
- Verify Firestore security rules
- Test with different admin roles

---

**Last Updated**: December 2024
**Version**: 1.0.0
**Author**: Lead Finder Team
