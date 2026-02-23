import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider }      from './contexts/AuthContext.jsx';
import { AdminAuthProvider } from './contexts/AdminAuthContext.jsx';
import { CreditProvider }    from './contexts/CreditContext.jsx';
import ProtectedRoute         from './components/ProtectedRoute.jsx';
import AdminRoute             from './components/admin/AdminRoute.jsx';
import AdminGatekeeper        from './components/admin/AdminGatekeeper.jsx';
import AdminLayoutNew         from './components/admin/AdminLayoutNew.jsx';
import DashboardNew           from './components/admin/DashboardNew.jsx';
import UserManagementNew      from './components/admin/UserManagementNew.jsx';
import SystemLogsNew          from './components/admin/SystemLogsNew.jsx';
import CreditAnalyticsNew     from './components/admin/CreditAnalyticsNew.jsx';
import SearchAnalyticsNew     from './components/admin/SearchAnalyticsNew.jsx';
import SettingsNew            from './components/admin/SettingsNew.jsx';
import DataSeeder             from './components/admin/DataSeeder.jsx';
import AccessControlNew       from './components/admin/AccessControlNew.jsx';
import AppLayout              from './components/layout/AppLayout.jsx';
import App                    from './App.jsx';
import Login                 from './components/Login.jsx';
import Register              from './components/Register.jsx';
import ForgotPassword        from './components/ForgotPassword.jsx';
import MyLists               from './components/MyLists.jsx';
import PlatformUsagePage     from './pages/PlatformUsagePage.jsx';
import './index.css';

// ── Environment variable guard ───────────────────────────────────────────────
// Shows a readable error instead of a blank screen when VITE_* vars are missing.
// Set these in Cloudflare Pages → Settings → Environment Variables.
const REQUIRED_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_GOOGLE_API_KEY',
];
const missingEnv = REQUIRED_ENV.filter((k) => !import.meta.env[k]);
if (missingEnv.length > 0) {
  document.getElementById('root').innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#f8fafc;font-family:system-ui,sans-serif;padding:24px;">
      <div style="max-width:540px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;
        padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.1);">
        <h2 style="color:#dc2626;margin:0 0 12px;font-size:18px;">⚙️ Missing Environment Variables</h2>
        <p style="color:#475569;font-size:14px;margin:0 0 16px;">
          The following environment variables are not set. Add them in
          <strong>Cloudflare Pages → Settings → Environment Variables</strong>:
        </p>
        <pre style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;
          padding:12px;font-size:13px;color:#b91c1c;white-space:pre-wrap;">${missingEnv.join('\n')}</pre>
        <p style="color:#64748b;font-size:12px;margin:16px 0 0;">
          See the README for the full list of required variables.
        </p>
      </div>
    </div>`;
  throw new Error(`Missing env vars: ${missingEnv.join(', ')}`);
}

// ── Error Boundary ──────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#f8fafc', fontFamily: 'sans-serif', padding: 24 }}>
          <div style={{ maxWidth: 540, background: '#fff', borderRadius: 12,
            border: '1px solid #e2e8f0', padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,.1)' }}>
            <h2 style={{ color: '#dc2626', marginBottom: 12, fontSize: 18 }}>Something went wrong</h2>
            <pre style={{ fontSize: 12, color: '#64748b', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              background: '#f1f5f9', padding: 12, borderRadius: 6 }}>
              {this.state.error?.message ?? String(this.state.error)}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{ marginTop: 16, padding: '8px 20px', background: '#4f46e5', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}



ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <AdminAuthProvider>
          <CreditProvider>
          <Routes>
            {/* ── Public ─────────────────────────────────── */}
            <Route path="/login"           element={<Login />} />
            <Route path="/register"        element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* ── Protected user area (nested inside AppLayout sidebar shell) ── */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/app"              element={<App />} />
              <Route path="/app/lists"        element={<MyLists />} />
              <Route path="/platform-usage"   element={<PlatformUsagePage />} />
            </Route>
            {/* ── Admin Gatekeeper (/admin exact) ──────────────── */}
            {/* Public route: handles role-based routing internally. */}
            {/* Redirects admins → /admin/dashboard (index below).   */}
            <Route path="/admin" element={<AdminGatekeeper />} />

            {/* ── Admin Dashboard area ─────────────────────────── */}
            {/* /admin/users, /admin/credits, etc. go here.          */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayoutNew />
                </AdminRoute>
              }
            >
              <Route path="dashboard"  element={<DashboardNew />} />
              <Route path="users"      element={<UserManagementNew />} />
              <Route path="logs"       element={<SystemLogsNew />} />
              <Route path="credits"    element={<CreditAnalyticsNew />} />
              <Route path="analytics"  element={<SearchAnalyticsNew />} />
              <Route path="settings"   element={<SettingsNew />} />
              <Route path="seeder"     element={<DataSeeder />} />
              <Route path="access"     element={<AccessControlNew />} />
            </Route>

            {/* ── Catch-all → /app ───────────────────────── */}
            <Route path="/"  element={<Navigate to="/app"  replace />} />
            <Route path="*"  element={<Navigate to="/app"  replace />} />
          </Routes>
          </CreditProvider>
        </AdminAuthProvider>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
