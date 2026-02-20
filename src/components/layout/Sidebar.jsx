import { NavLink, useNavigate } from 'react-router-dom';
import {
  FolderOpen,
  Shield,
  LogOut,
  Zap,
  Gauge,
  Activity,
} from 'lucide-react';
import { useAuth }   from '../../contexts/AuthContext';
import { useCredit } from '../../contexts/CreditContext';

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV = [
  { to: '/app',             icon: Gauge,      label: 'Dashboard',      end: true  },
  { to: '/app/lists',       icon: FolderOpen, label: 'My Lists',        end: false },
  { to: '/platform-usage',  icon: Activity,   label: 'Platform Usage', end: false },
];

// ─── Single nav link ──────────────────────────────────────────────────────────
const NavItem = ({ to, icon: Icon, label, end, onClick }) => (
  <NavLink
    to={to}
    end={end}
    onClick={onClick}
    className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 active:scale-[0.97] ${
        isActive
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`
    }
  >
    <Icon className="w-5 h-5 flex-none" strokeWidth={2} />
    <span className="truncate">{label}</span>
  </NavLink>
);

// ─── Sidebar inner content ────────────────────────────────────────────────────
const SidebarContent = () => {
  const navigate = useNavigate();
  const { currentUser, userProfile, signOut, isAdmin } = useAuth();
  const {
    totalApiCalls,
    remainingCalls,
    platformPctUsed,
    monthlyApiCost,
    monthlyCapUsd,
  } = useCredit();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const initial = (currentUser?.displayName || currentUser?.email || 'U')[0].toUpperCase();

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white overflow-hidden">

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
          Navigation
        </p>
        {NAV.map(item => (
          <NavItem key={item.to} {...item} />
        ))}

        {/* Admin link — only for admin / super_admin */}
        {isAdmin && (
          <>
            <p className="px-3 pt-4 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              Admin
            </p>
            <NavItem to="/admin" icon={Shield} label="Admin Dashboard" end={false} />
          </>
        )}
      </nav>

      {/* ── Credits mini-card ── */}
      <div className="mx-3 mb-3 rounded-xl bg-slate-800 border border-slate-700/60 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Platform Usage
          </span>
          <Zap className="w-3.5 h-3.5 text-indigo-400" />
        </div>

        <div className="w-full bg-slate-700 rounded-full h-1.5 mb-2 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${
              platformPctUsed >= 97 ? 'bg-red-500'
              : platformPctUsed >= 80 ? 'bg-amber-500'
              : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.max(platformPctUsed ?? 0, 1)}%` }}
          />
        </div>

        <div className="flex justify-between text-[11px]">
          <span className="text-slate-500">
            {(totalApiCalls ?? 0).toLocaleString()} calls used
          </span>
          <span className={`font-semibold ${
            platformPctUsed >= 80 ? 'text-amber-400' : 'text-emerald-400'
          }`}>
            ${(monthlyApiCost ?? 0).toFixed(2)} / ${monthlyCapUsd}
          </span>
        </div>

        {remainingCalls < 500 && (
          <p className="mt-1.5 text-[10px] text-amber-400 font-medium">
            ⚠ Less than 500 calls remaining
          </p>
        )}
      </div>

      {/* ── User + Sign out ── */}
      <div className="px-3 pb-4 border-t border-slate-800 pt-3">
        <div className="flex items-center gap-2.5 mb-2.5 px-1">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600
            flex items-center justify-center text-white text-sm font-bold flex-none select-none">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate">
              {currentUser?.displayName || currentUser?.email?.split('@')[0]}
            </p>
            <p className="text-[10px] text-slate-500 truncate">{currentUser?.email}</p>
            <p className="text-[10px] text-slate-600 capitalize">{userProfile?.role ?? 'user'}</p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm
            text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-[0.97]"
        >
          <LogOut className="w-4 h-4 flex-none" strokeWidth={2} />
          Sign out
        </button>
      </div>
    </div>
  );
};

// ─── Exported Sidebar ─────────────────────────────────────────────────────────
/**
 * @param {boolean}  isOpen   — when true the sidebar slides into view
 * @param {Function} onClose  — callback to close (used only by AppLayout overlay)
 */
const Sidebar = ({ isOpen }) => (
  <div
    className={`fixed top-16 left-0 bottom-0 z-40 w-64 flex flex-col
      transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
  >
    <SidebarContent />
  </div>
);

export default Sidebar;
