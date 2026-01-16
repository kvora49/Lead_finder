# 📚 User Features Guide - Save & Export Leads + Search History

## 🎯 Overview

This guide covers two powerful new features designed to enhance user experience and add monetization opportunities:

1. **Save & Export Leads** - Persistent storage of search results with Excel export
2. **Recent Searches** - Quick access to previous searches for easy re-running

---

## ✨ Feature 1: Save & Export Leads to "My Lists"

### Purpose
Users can now save their search results into named lists that persist across sessions. This prevents data loss on page refresh and allows users to build organized collections of leads for different purposes.

### How It Works

#### Saving Leads
1. **Search for leads** using the main search form
2. **Click "Save to My Lists"** button in the results section
3. **Enter a list name** (e.g., "Mumbai Wholesalers", "Delhi Retailers")
4. **Review lead count** shown in the modal
5. **Click Save** to store the list

#### Viewing Saved Lists
1. **Click "My Lists"** button in the header (green button with bookmark icon)
2. View all saved lists in a **grid layout**
3. Each card shows:
   - List name
   - Creation date
   - Search query details (keyword, location, category)
   - Number of leads
   - **View** and **Delete** buttons

#### Viewing List Details
1. **Click "View"** on any list card
2. Modal opens showing **all leads** in that list
3. Scrollable list with:
   - Business name
   - Address
   - Phone
   - Rating & total ratings
   - Status (Open/Closed)
   - Website link

#### Exporting to Excel
1. In "My Lists" page, **click "Export"** on any list card
2. Professional Excel file downloads automatically with:
   - **8 columns**: Name, Address, Phone, Rating, Total Ratings, Website, Status, Place ID
   - **Professional styling**: Blue headers, alternating row colors, borders
   - **Filename**: `{list-name}-{date}.xlsx`

#### Deleting Lists
1. **Click "Delete"** on any list card
2. **Confirm deletion** in dialog
3. List is permanently removed

### Technical Details

**Firestore Structure:**
```javascript
savedLists/{userId}/lists/{listId}
  - name: string           // User-defined list name
  - createdAt: Timestamp   // When list was created
  - totalLeads: number     // Count of leads
  - searchQuery: {
      keyword: string      // Original search keyword
      location: string     // Original search location
      category: string     // Original category
    }
  - leads: [               // Array of lead objects
      {
        name: string
        address: string
        phone: string
        rating: number
        totalRatings: number
        website: string
        status: string
        placeId: string
      }
    ]
```

**Security Rules:**
```javascript
match /savedLists/{userId}/lists/{listId} {
  allow read, write, delete: if request.auth.uid == userId;
}
```

**Components:**
- `SaveLeadsModal.jsx` - Modal for saving search results
- `MyLists.jsx` - Full page displaying all saved lists
- Integrated in `App.jsx` with state management

**Libraries Used:**
- ExcelJS v4.x - Professional Excel file generation
- Lucide React - Icons (Save, BookmarkCheck, Download, etc.)

---

## 🕐 Feature 2: Recent Searches

### Purpose
Users can quickly re-run previous searches without re-typing, improving workflow efficiency and user experience.

### How It Works

#### Viewing Recent Searches
1. **10 most recent searches** appear below the header
2. Shows:
   - Search keyword
   - Location
   - Category (if used)
   - **Time ago** (e.g., "Just now", "5m ago", "3h ago", "2d ago")
3. **Show All / Show Less** toggle when more than 5 searches exist

#### Re-running a Search
1. **Click on any recent search** card
2. Form fields **auto-populate** with:
   - Keyword
   - Location
   - Category
3. Page **auto-scrolls** smoothly to the search button
4. **Click "Search"** to re-run the query

#### Time Formatting
- **< 1 minute**: "Just now"
- **< 1 hour**: "5m ago", "15m ago"
- **< 1 day**: "3h ago", "12h ago"
- **< 1 week**: "2d ago", "5d ago"
- **≥ 1 week**: Full date (e.g., "01/15/2025")

### Technical Details

**Firestore Collection:**
```javascript
searchLogs/{logId}
  - userId: string         // User who performed search
  - keyword: string        // Search keyword
  - location: string       // Search location
  - category: string       // Category (optional)
  - timestamp: Timestamp   // When search was performed
  - resultsCount: number   // Number of leads found
```

**Query:**
```javascript
query(
  collection(db, 'searchLogs'),
  where('userId', '==', currentUser.uid),
  orderBy('timestamp', 'desc'),
  limit(10)
)
```

**Deduplication Logic:**
- Removes duplicate searches based on unique `keyword + location` combinations
- Only shows most recent instance of each unique search
- Prevents cluttered history

**Component:**
- `RecentSearches.jsx` - Self-contained widget
- Integrated in `App.jsx` above search form

---

## 💰 Monetization Opportunities

### Premium Features
1. **Save Limits**
   - Free users: 3 saved lists
   - Premium users: Unlimited lists
   
2. **Export Limits**
   - Free users: 10 exports per month
   - Premium users: Unlimited exports
   
3. **List Sharing**
   - Premium feature: Share lists with team members
   - Collaborative lead management

4. **Advanced Filters**
   - Premium: Save searches with rating filters, review count filters
   - Auto-refresh saved lists with new data

### Implementation Guide
```javascript
// In SaveLeadsModal.jsx - Add limit check
const checkSaveLimit = async (userId) => {
  const listsRef = collection(db, 'savedLists', userId, 'lists');
  const snapshot = await getDocs(listsRef);
  const userDoc = await getDoc(doc(db, 'users', userId));
  const isPremium = userDoc.data()?.isPremium || false;
  
  if (!isPremium && snapshot.size >= 3) {
    alert('Free users can save up to 3 lists. Upgrade to Premium for unlimited lists!');
    return false;
  }
  return true;
};
```

---

## 📊 User Benefits

### Save & Export Leads
- ✅ **No data loss** on page refresh
- ✅ **Organized collections** for different campaigns
- ✅ **Professional exports** for CRM import
- ✅ **Quick access** to frequently used lists
- ✅ **Backup** of valuable lead data

### Recent Searches
- ✅ **Faster workflow** - No re-typing
- ✅ **Easy comparison** - Re-run searches to check new results
- ✅ **Pattern recognition** - See search history at a glance
- ✅ **Time-saving** - One click to restore search parameters

---

## 🧪 Testing Checklist

### Save & Export Leads
- [ ] Search for leads successfully
- [ ] Click "Save to My Lists" opens modal
- [ ] Enter list name and save successfully
- [ ] Navigate to "My Lists" page
- [ ] Verify list appears with correct metadata
- [ ] Click "View" to see all leads in modal
- [ ] Export to Excel with proper formatting
- [ ] Delete list and confirm removal
- [ ] Test with empty search results (should disable save button)
- [ ] Test with duplicate list names (should allow)
- [ ] Test Firestore security (can't access other users' lists)

### Recent Searches
- [ ] Perform 3-4 searches with different parameters
- [ ] Verify searches appear in Recent Searches section
- [ ] Check time formatting ("Just now", "5m ago", etc.)
- [ ] Click recent search to auto-populate form
- [ ] Verify smooth scroll to search button
- [ ] Test "Show All" / "Show Less" toggle
- [ ] Verify deduplication (no duplicate keyword+location combos)
- [ ] Test with 0 searches (should show empty state)
- [ ] Test after logout/login (should load user's searches only)

---

## 🔧 Configuration

### Environment Variables
No additional environment variables needed - uses existing Firebase config.

### Firebase Setup
1. Deploy Firestore rules: `firebase deploy --only firestore:rules`
2. Rules already include `savedLists` collection permissions
3. `searchLogs` collection already exists from previous features

### Dependencies
All dependencies already installed:
- `exceljs`: "^4.4.0" - Excel file generation
- `lucide-react`: Latest - Icons
- `firebase`: "^11.2.0" - Firestore database

---

## 📱 UI/UX Design

### Color Scheme
- **Save Button**: Blue (`bg-blue-600 hover:bg-blue-700`)
- **My Lists Button**: Green gradient (`bg-gradient-to-r from-green-500 to-green-600`)
- **Export Button**: Green (`bg-green-600 hover:bg-green-700`)
- **Recent Searches**: Light gray cards with hover effects

### Icons
- **Save**: `Save` icon from Lucide
- **My Lists**: `BookmarkCheck` icon
- **Export**: `Download` icon
- **View**: `Eye` icon
- **Delete**: `Trash2` icon
- **Close**: `X` icon

### Responsive Design
- **Desktop**: Grid layout (3 columns for saved lists)
- **Tablet**: Grid adapts to 2 columns
- **Mobile**: Single column, stacked layout
- All modals responsive with max-width constraints

---

## 🚀 Future Enhancements

1. **List Folders**
   - Organize lists into folders/categories
   - Nested structure: "Mumbai → Wholesalers", "Delhi → Retailers"

2. **List Sharing**
   - Share lists via email or link
   - Team collaboration features

3. **Auto-Refresh**
   - Scheduled updates for saved lists
   - Email notifications for new leads

4. **Advanced Filters**
   - Save searches with rating thresholds
   - Minimum review count filters
   - Open hours filters

5. **Export Formats**
   - CSV export option
   - PDF export with formatting
   - Direct CRM integration (Salesforce, HubSpot)

6. **Merge Lists**
   - Combine multiple lists
   - Deduplicate across lists

7. **Search Templates**
   - Save search parameters as templates
   - Quick-run with one click

---

## 📞 Support

### Common Issues

**Q: "Save to My Lists" button is disabled**
A: Button is only enabled when there are search results. Run a search first.

**Q: My Lists page is empty**
A: You haven't saved any lists yet. Search for leads and click "Save to My Lists".

**Q: Excel export not downloading**
A: Check browser pop-up blocker settings. Allow downloads from the application.

**Q: Recent Searches not showing**
A: Recent Searches only appear after you've performed at least one search in the current session.

**Q: Can't see other users' saved lists**
A: By design - lists are private and scoped to each user's account for data privacy.

### Troubleshooting

1. **Clear browser cache** if changes don't appear
2. **Check Firestore rules** are deployed: `firebase deploy --only firestore:rules`
3. **Verify user authentication** - must be logged in
4. **Check browser console** for error messages

---

## 📄 API Reference

### SaveLeadsModal Props
```typescript
interface SaveLeadsModalProps {
  leads: Array<any>;           // Array of lead objects to save
  searchQuery: {               // Original search parameters
    keyword: string;
    location: string;
    category: string;
  };
  onClose: () => void;         // Close modal handler
  onSuccess: () => void;       // Success callback (shows alert)
}
```

### MyLists Component
```typescript
// No props - uses useAuth() for currentUser
// Automatically fetches user's saved lists from Firestore
```

### RecentSearches Props
```typescript
interface RecentSearchesProps {
  onSearchSelect: (search: {
    keyword: string;
    location: string;
    category: string;
  }) => void;                  // Called when user clicks a recent search
}
```

---

## 🎓 Best Practices

1. **Naming Lists**: Use descriptive names like "Mumbai Kurti Wholesalers Q1 2025"
2. **Regular Cleanup**: Delete old/unused lists to keep organized
3. **Export Regularly**: Download Excel files for offline access and backup
4. **Combine Features**: Use Recent Searches → Save to Lists → Export workflow
5. **Data Privacy**: Don't share exported files with sensitive business data

---

## 📝 Changelog

### Version 2.0 - User Features Release
- ✅ Added "Save to My Lists" functionality
- ✅ Created "My Lists" page with grid layout
- ✅ Implemented Excel export with professional formatting
- ✅ Added Recent Searches widget
- ✅ Integrated auto-populate and auto-scroll
- ✅ Deployed Firestore security rules
- ✅ Added responsive design for mobile

### Previous Versions
- Version 1.0: Basic search functionality
- Version 1.5: Admin dashboard and credit system
- Version 1.7: Advanced admin features (credit management, login as, search history export)

---

## 🔐 Security

### Firestore Rules
```javascript
// Users can only access their own saved lists
match /savedLists/{userId}/lists/{listId} {
  allow read, write, delete: if request.auth.uid == userId;
}

// Search logs readable by admins only
match /searchLogs/{logId} {
  allow read: if isAdmin();
  allow write: if request.auth != null;
}
```

### Data Privacy
- ✅ Lists are private and scoped per user
- ✅ No cross-user data access
- ✅ Secure Firebase Authentication required
- ✅ Search history only accessible to user and admins
- ✅ Export files generated client-side (no server storage)

---

**Built with ❤️ using React, Firebase, and ExcelJS**

**Last Updated**: January 2025
