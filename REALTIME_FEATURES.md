# Admin Dashboard - Real-Time Features Implementation

## Overview
The admin dashboard has been fully upgraded with real-time data tracking and monitoring capabilities. All components now use Firestore real-time listeners to display live data without page refreshes.

## Real-Time Features Implemented

### 1. **Dashboard Component** (`Dashboard.jsx`)
**Real-Time Metrics:**
- Total registered users (live count)
- Active users in last 30 days (auto-updates)
- Global API calls tracking
- Current month cost calculation
- Credit usage percentage (live updates)
- Recent activity feed (last 10 activities)

**Features:**
- Auto-refreshing stats cards
- Live cost trend graphs
- Real-time circular credit usage indicator
- Activity stream with timestamps

**Firestore Collections Used:**
- `users` - User count and active users
- `userCredits` - API calls and credit usage
- `systemLogs` - Recent activity feed
- `monthlyAnalytics` - Monthly cost trends

---

### 2. **User Management** (`UserManagement.jsx`)
**Real-Time Features:**
- Live user list updates
- Instant status changes (active/suspended)
- Real-time credit usage per user
- Auto-updating last active timestamps

**Actions Tracked:**
- User suspensions/activations
- Account status changes
- Credit limit modifications

**No More Manual Refreshes:**
- Changes reflect immediately across all admin sessions
- User status updates propagate in real-time

---

### 3. **Credit Analytics** (`CreditAnalytics.jsx`)
**Real-Time Tracking:**
- Total cost calculations (live)
- Average cost per user
- Top 10 spenders ranking (auto-updates)
- Credit distribution by usage ranges
- Active alerts for credit limits

**Analytics:**
- Cost trends over last 6 months
- Credit usage distribution pie chart
- User-by-user cost breakdown
- Automatic alert generation for users approaching limits

**Alert Types:**
- Warning: 80-99% of credit limit
- Critical: 100%+ of credit limit

---

### 4. **Search Analytics** (`SearchAnalytics.jsx`)
**Real-Time Data:**
- Total search count (live)
- Success rate percentage
- Average search response time
- Unique keywords tracking

**Analytics Dashboards:**
- Top 10 keywords with success rates
- Top 10 locations by search volume
- Search trends over time (7/30/90 days)
- Successful vs failed searches

**Data Sources:**
- `searchLogs` collection with real-time updates
- Automatic aggregation of keywords and locations
- Performance metrics tracking

---

### 5. **System Logs** (`SystemLogs.jsx`)
**Real-Time Activity Monitoring:**
- Live log stream (last 500 entries)
- Auto-categorized by type and severity
- Real-time filtering and search
- Activity statistics dashboard

**Log Categories:**
- `auth` - Authentication events
- `search` - Search activities
- `admin` - Admin actions
- `credit` - Credit usage events
- `export` - Data exports
- `system` - System errors

**Severity Levels:**
- Info (blue)
- Warning (yellow)
- Error (red)

---

## Analytics Service (`analyticsService.js`)

### Purpose
Centralized service for tracking all user activities and system events in real-time.

### Available Functions:

#### 1. **logActivity(activityData)**
General-purpose activity logger
```javascript
logActivity({
  type: 'general',
  severity: 'info',
  action: 'User Action',
  user: 'user@example.com',
  details: 'Description of action'
});
```

#### 2. **logAuthEvent(userId, userEmail, eventType, details)**
Track authentication events
```javascript
logAuthEvent(user.uid, user.email, 'User Login', {
  method: 'Email/Password'
});
```

#### 3. **logSearch(userId, userEmail, searchData)**
Track search activities
```javascript
logSearch(user.uid, user.email, {
  keyword: 'software engineer',
  location: 'New York',
  resultCount: 127,
  responseTime: 1240
});
```

#### 4. **updateCreditUsage(userId, creditsUsed)**
Update user credit consumption
```javascript
updateCreditUsage(user.uid, 5);
```

#### 5. **logExport(userId, userEmail, exportData)**
Track data exports
```javascript
logExport(user.uid, user.email, {
  recordCount: 250,
  format: 'CSV'
});
```

#### 6. **logAdminAction(adminId, adminEmail, action, targetUserId, details)**
Track admin actions
```javascript
logAdminAction(admin.uid, admin.email, 'User Suspended', targetUserId, 'Reason: Policy violation');
```

#### 7. **logError(errorData)**
Log system errors
```javascript
logError({
  action: 'API Request Failed',
  message: error.message,
  code: error.code,
  userId: user.uid
});
```

#### 8. **logCreditAlert(userId, userEmail, alertData)**
Log credit limit alerts
```javascript
logCreditAlert(user.uid, user.email, {
  severity: 'warning',
  message: 'User approaching credit limit',
  usage: 850,
  limit: 1000
});
```

---

## Firestore Collections Structure

### `users`
```javascript
{
  uid: string,
  email: string,
  displayName: string,
  accountStatus: 'active' | 'suspended',
  creditLimit: number,
  lastActive: timestamp,
  createdAt: timestamp
}
```

### `userCredits`
```javascript
{
  userId: string (document ID),
  creditsUsed: number,
  totalApiCalls: number,
  lastUsed: timestamp
}
```

### `systemLogs`
```javascript
{
  timestamp: timestamp,
  type: 'auth' | 'search' | 'admin' | 'credit' | 'export' | 'system',
  severity: 'info' | 'warning' | 'error',
  action: string,
  user: string,
  userEmail: string,
  userId: string,
  details: string,
  metadata: object
}
```

### `searchLogs`
```javascript
{
  timestamp: timestamp,
  userId: string,
  userEmail: string,
  keyword: string,
  searchQuery: string,
  location: string,
  resultCount: number,
  responseTime: number,
  success: boolean,
  filters: object
}
```

### `monthlyAnalytics`
```javascript
{
  month: string (YYYY-MM),
  monthLabel: string (Jan, Feb, etc.),
  totalCost: number,
  totalApiCalls: number,
  totalSearches: number,
  activeUsers: number,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

---

## Integration Guide

### Step 1: Import Analytics Service
```javascript
import { logAuthEvent, logSearch, updateCreditUsage } from '../services/analyticsService';
```

### Step 2: Track User Login
```javascript
const handleLogin = async () => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  await logAuthEvent(userCredential.user.uid, userCredential.user.email, 'User Login', {
    method: 'Email/Password'
  });
};
```

### Step 3: Track Search Activity
```javascript
const performSearch = async (keyword, location) => {
  const startTime = Date.now();
  const results = await searchAPI(keyword, location);
  const responseTime = Date.now() - startTime;
  
  await logSearch(user.uid, user.email, {
    keyword,
    location,
    resultCount: results.length,
    responseTime,
    creditsUsed: 5
  });
  
  await updateCreditUsage(user.uid, 5);
};
```

### Step 4: Track Data Export
```javascript
import { logExport } from '../services/analyticsService';

const exportData = async (data) => {
  // Export logic...
  await logExport(user.uid, user.email, {
    recordCount: data.length,
    format: 'CSV'
  });
};
```

---

## Real-Time Listener Pattern

All admin components use this pattern for real-time updates:

```javascript
useEffect(() => {
  // Set up real-time listener
  const unsubscribe = onSnapshot(
    query(collection(db, 'collectionName'), orderBy('timestamp', 'desc')),
    (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setData(data);
    }
  );
  
  // Cleanup listener on unmount
  return () => unsubscribe();
}, []);
```

---

## Benefits

### 1. **No Manual Refreshes**
- All data updates automatically
- Changes visible immediately across all admin sessions

### 2. **Live Monitoring**
- Watch user activity in real-time
- Instant alerts for critical events
- Track system performance live

### 3. **Better Decision Making**
- Real-time insights into user behavior
- Instant visibility into system issues
- Accurate, up-to-date analytics

### 4. **Improved User Experience**
- Faster response to user issues
- Proactive monitoring and alerts
- Better resource management

### 5. **Comprehensive Audit Trail**
- Every action is logged
- Complete activity history
- Easy troubleshooting

---

## Performance Considerations

1. **Listener Limits**: Real-time listeners are limited to active admin sessions
2. **Data Limits**: System logs limited to last 500 entries for performance
3. **Cleanup**: All listeners properly cleaned up on component unmount
4. **Batching**: Analytics updates are batched when possible

---

## Next Steps

To fully utilize the real-time features:

1. **Integrate analytics service** in your main app components (search, export, etc.)
2. **Add error logging** throughout the application
3. **Set up monthly analytics aggregation** (cron job or Cloud Function)
4. **Configure credit limit alerts** for automated notifications
5. **Add admin notifications** for critical events

---

## Testing Real-Time Features

1. **Open admin dashboard in two browser windows**
2. **Perform actions in one window** (create user, search, etc.)
3. **Watch updates appear in both windows** without refresh
4. **Verify activity logs** appear in real-time
5. **Check credit usage** updates immediately

---

## Support

For issues or questions about the real-time features:
- Check Firestore console for data structure
- Verify Firebase rules allow read/write access
- Ensure analytics service is properly imported
- Check browser console for errors
