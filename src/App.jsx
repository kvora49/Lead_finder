// Lead Finder — Phase 3 Main App
import { useAuth }   from './contexts/AuthContext';
import { useCredit } from './contexts/CreditContext';
import { Navigate } from 'react-router-dom';
import SearchPanel from './components/SearchPanel';
import { Database, Zap, Search, ShieldCheck, MapPin } from 'lucide-react';

const App = () => {
  const { currentUser, userProfile, signOut, isAdmin } = useAuth();
  const { totalApiCalls, remainingCalls, monthlyApiCost, monthlyCapUsd, platformPctUsed, mySearchCount } = useCredit();

  if (!currentUser) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Top Navigation ─────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">

          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600
              flex items-center justify-center shadow-sm flex-none">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <span className="text-base font-bold text-slate-900 tracking-tight">Lead Finder</span>
          </div>

          {/* Nav links — hidden on mobile */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
            <a href="/app"
              className="px-3 py-1.5 text-indigo-600 bg-indigo-50 rounded-md">
              Dashboard
            </a>
            <a href="/app/lists"
              className="px-3 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors">
              My Lists
            </a>
            {isAdmin && (
              <a href="/admin"
                className="px-3 py-1.5 text-violet-600 hover:bg-violet-50 rounded-md transition-colors">
                Admin
              </a>
            )}
          </nav>

          {/* User area */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-sm font-semibold text-slate-800">
                {currentUser?.displayName || 'User'}
              </span>
              <span className="text-xs text-slate-400">{currentUser?.email}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600
              flex items-center justify-center text-white text-sm font-bold shadow-sm select-none">
              {(currentUser?.displayName || currentUser?.email || 'U')[0].toUpperCase()}
            </div>
            <button
              onClick={signOut}
              className="text-sm font-medium text-slate-500 hover:text-slate-900 px-2 py-1
                hover:bg-slate-100 rounded-md transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Two-column layout on large screens: search takes 2/3, sidebar 1/3 */}
        <div className="flex flex-col lg:flex-row gap-8">

          {/* ── Search column ──────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <SearchPanel />
          </div>

          {/* ── Sidebar ─────────────────────────────────────────────── */}
          <aside className="w-full lg:w-72 flex-none space-y-4">

            {/* Platform usage card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Platform Usage</p>

              {/* Budget bar at top */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs text-slate-400">Monthly budget</span>
                  <span className={`text-xs font-semibold ${platformPctUsed >= 80 ? 'text-amber-600' : 'text-slate-500'}`}>
                    ${monthlyApiCost?.toFixed(2) ?? '0.00'} / ${monthlyCapUsd}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      platformPctUsed >= 97 ? 'bg-red-500'
                      : platformPctUsed >= 80 ? 'bg-amber-500'
                      : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.max(platformPctUsed, 1)}%` }}
                  />
                </div>
                {platformPctUsed >= 97 && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium">
                    Platform budget almost exhausted!
                  </p>
                )}
              </div>

              <div className="space-y-3">
                {[
                  { icon: <Zap className="w-4 h-4 text-indigo-400" />,        label: 'Calls this month', value: totalApiCalls,  color: 'text-indigo-600' },
                  { icon: <Database className="w-4 h-4 text-emerald-400" />,  label: 'Calls remaining',  value: remainingCalls, color: remainingCalls < 500 ? 'text-amber-600' : 'text-emerald-600' },
                  { icon: <Search className="w-4 h-4 text-violet-400" />,     label: 'My searches',      value: mySearchCount,  color: 'text-violet-600' },
                  { icon: <ShieldCheck className="w-4 h-4 text-slate-400" />, label: 'Role',             value: userProfile?.role ?? 'user', color: 'text-slate-700' },
                ].map(({ icon, label, value, color }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      {icon}{label}
                    </div>
                    <span className={`text-sm font-bold ${color}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* How it works */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">How Search Works</p>
              <ol className="space-y-3">
                {[
                  { icon: <Database className="w-4 h-4 text-emerald-500" />, text: 'Cache checked first — free if hit' },
                  { icon: <MapPin className="w-4 h-4 text-indigo-500" />,    text: 'Location geocoded to viewport' },
                  { icon: <Search className="w-4 h-4 text-violet-500" />,    text: 'Viewport split into NxN grid cells' },
                  { icon: <Zap className="w-4 h-4 text-amber-500" />,        text: 'Cells searched in parallel batches' },
                ].map(({ icon, text }, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="flex-none mt-0.5">{icon}</span>
                    <span className="text-xs text-slate-600 leading-relaxed">{text}</span>
                  </li>
                ))}
              </ol>
            </div>

          </aside>
        </div>
      </main>
    </div>
  );
};

export default App;
