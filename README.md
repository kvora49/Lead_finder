# Lead Finder — Business Intelligence Platform

A premium full-stack SaaS application for discovering business leads worldwide. Built with **React 18 + Vite**, powered by the **Google Places API (New)** and **Firebase**, featuring a multi-keyword/multi-city search engine, credit-based usage tracking, and a full admin dashboard.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🔍 **Multi-Search Engine** | Comma-separate keywords AND cities — e.g. *Kurti, Hardware* in *Ahmedabad, Surat* runs all combinations concurrently |
| ⚡ **Dynamic Grid Search** | Viewport split into NxN grid cells; each cell searched in parallel for maximum coverage |
| 💾 **Zero-Cost Cache** | Firestore caches every search for 24 h — identical searches are instant and free |
| 💳 **Credit System** | Per-user credit balance; deducted by real API calls consumed (cached = free) |
| 📊 **Admin Dashboard** | Full RBAC with user management, credit analytics, system logs, and platform budget tracking |
| 🗂️ **My Lists** | Save selected leads into named lists; view, manage, and export from a dedicated page |
| 📤 **Export** | Download results as Excel/CSV or PDF with one click |
| 🔐 **Firebase Auth** | Email/password login with role-based access (user · admin · super_admin) |
| 🧭 **Collapsible Sidebar** | Enterprise SaaS layout — hamburger toggle, responsive drawer on mobile |

---

## 🛠️ Tech Stack

- **React 18** + **Vite 6** — lightning-fast HMR and production builds
- **Tailwind CSS v3** — utility-first styling
- **Firebase 10 (Modular SDK)** — Auth, Firestore, Cloud Functions
- **Google Places API v1** (`places.googleapis.com`) — CORS-safe browser fetch
- **Google Geocoding API** — location-to-viewport resolution
- **Lucide React** — icon library
- **jsPDF + jspdf-autotable** — PDF export
- **PapaParse** — CSV export
- **Cloudflare Pages** — deployment target

---

## 📁 Project Structure

```
├── src/
│   ├── App.jsx                        # Main dashboard (hero search screen)
│   ├── main.jsx                       # React Router entry point + route tree
│   ├── config.js                      # API keys + credit pricing constants
│   ├── firebase.js                    # Firebase app init
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.jsx          # Authenticated shell (header + sidebar + <Outlet>)
│   │   │   └── Sidebar.jsx            # Collapsible nav sidebar
│   │   ├── admin/
│   │   │   ├── AdminLayoutNew.jsx     # Dark admin shell with own nav
│   │   │   ├── DashboardNew.jsx       # Admin overview (real Firestore counts)
│   │   │   ├── UserManagementNew.jsx  # User list + credit adjustment
│   │   │   ├── CreditAnalyticsNew.jsx # Credit usage analytics
│   │   │   ├── SearchAnalyticsNew.jsx # Search trend charts
│   │   │   ├── SystemLogsNew.jsx      # Admin action log
│   │   │   ├── AccessControlNew.jsx   # RBAC management
│   │   │   ├── SettingsNew.jsx        # Platform settings
│   │   │   └── DataSeeder.jsx         # Dev: seed Firestore with test data
│   │   ├── SearchPanel.jsx            # Full-screen hero search UI + results grid
│   │   ├── LeadCard.jsx               # Business result card
│   │   ├── MyLists.jsx                # Saved leads page
│   │   ├── SaveLeadsModal.jsx         # Save-to-list modal
│   │   ├── CreditSyncStatus.jsx       # Realtime credit display
│   │   ├── RecentSearches.jsx         # Recent search history
│   │   ├── Login.jsx                  # Auth: login
│   │   ├── Register.jsx               # Auth: register
│   │   ├── ForgotPassword.jsx         # Auth: password reset
│   │   └── ProtectedRoute.jsx         # Auth guard HOC
│   ├── contexts/
│   │   ├── AuthContext.jsx            # currentUser, isAdmin, signOut
│   │   ├── AdminAuthContext.jsx       # Admin-scoped auth state
│   │   └── CreditContext.jsx          # Live credit balance + platform usage
│   ├── services/
│   │   ├── placesApi.js               # Multi-search engine + cache + dedup
│   │   ├── creditService.js           # Firestore credit read/write helpers
│   │   └── analyticsService.js        # Admin action + search event logging
│   └── pages/
│       └── PlatformUsagePage.jsx      # Global API budget + usage stats page
├── functions/
│   └── index.js                       # Firebase Cloud Functions
├── scripts/
│   ├── addAdmin.js                    # CLI: promote user to admin
│   ├── setupAdmin.js                  # CLI: first admin setup
│   └── seedData.js                    # CLI: seed Firestore test data
├── firestore.rules                    # Firestore security rules (RBAC)
├── firestore.indexes.json             # Composite index definitions
├── firebase.json                      # Firebase project config
└── vite.config.js                     # Vite / Rollup build config
```

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure API keys

Open `src/config.js` and fill in:

```js
export const GOOGLE_API_KEY = 'YOUR_GOOGLE_API_KEY';
```

Ensure these APIs are enabled in [Google Cloud Console](https://console.cloud.google.com/):
- **Places API (New)**
- **Geocoding API**

Restrict the API key to your domain (HTTP referrer) in production.

### 3. Firebase setup

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** (Email/Password provider)
3. Enable **Firestore Database**
4. Copy your Firebase config into `src/firebase.js`
5. Deploy Firestore rules: `npx firebase deploy --only firestore:rules`

### 4. Run the dev server

```bash
npm run dev
```

Runs at `http://localhost:5173`

### 5. Build for production

```bash
npm run build
```

---

## 🗺️ Route Map

| Path | Component | Access |
|---|---|---|
| `/login` | Login | Public |
| `/register` | Register | Public |
| `/forgot-password` | ForgotPassword | Public |
| `/app` | App (SearchPanel) | Authenticated |
| `/app/lists` | MyLists | Authenticated |
| `/platform-usage` | PlatformUsagePage | Authenticated |
| `/admin` | Admin Dashboard | Admin only |
| `/admin/users` | User Management | Admin only |
| `/admin/credits` | Credit Analytics | Admin only |
| `/admin/analytics` | Search Analytics | Admin only |
| `/admin/logs` | System Logs | Admin only |
| `/admin/access` | Access Control | Super Admin only |
| `/admin/settings` | Settings | Admin only |

---

## 🔎 Search Engine Details

### Multi-Search Algorithm

```
Input: "Kurti, Saree" in "Ahmedabad, Surat"
→ 4 concurrent searches: (Kurti/Ahmedabad), (Saree/Ahmedabad), (Kurti/Surat), (Saree/Surat)
→ Each search: cache check → geocode → 10 query variants × N pages (parallel)
→ Flatten + deduplicate all results by place_id
```

### Search Scopes

| Scope | Query Variants | Pages | Coverage |
|---|---|---|---|
| City | 10 | 3 | ~600 raw → 200-300 unique |
| Neighbourhood | 10 | 2 | ~400 raw → 150-200 unique |
| Specific Area | 6 | 1 | ~120 raw → 60-100 unique |

### Cache

- Stored in Firestore `public_search_cache/{cacheKey}`
- TTL: 24 hours
- Cached results cost **0 credits**

---

## 👤 Roles & Permissions

| Role | Capabilities |
|---|---|
| `user` | Search, save leads, view own credits |
| `admin` | All user capabilities + admin dashboard, user management, credit adjustments |
| `super_admin` | All admin capabilities + access control, role changes |

### Promote a user to admin

```bash
node scripts/addAdmin.js user@example.com
```

---

## 💳 Credit System

- Each Google Places API call costs **1 credit**
- Cached hits cost **0 credits**
- Admins can adjust individual user balances from the Admin → User Management screen
- Platform-wide budget is tracked against a configurable USD cap in `src/config.js`

---

## ☁️ Deployment (Cloudflare Pages)

```bash
npm run build
# Deploy the dist/ folder to Cloudflare Pages
```

Set the following environment variable in Cloudflare dashboard if using server-side key injection:
- `VITE_GOOGLE_API_KEY`

---

## 📄 License

MIT
