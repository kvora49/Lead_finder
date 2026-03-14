import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  FolderOpen,
  Shield,
  LogOut,
  Zap,
  Gauge,
  Activity,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth }   from '../../contexts/AuthContext';
import { useCredit } from '../../contexts/CreditContext';

// â”€â”€â”€ Nav items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const NAV = [
  { to: '/app',             icon: Gauge,      label: 'Dashboard',      end: true  },
  { to: '/app/lists',       icon: FolderOpen, label: 'My Lists',       end: false },
  { to: '/platform-usage',  icon: Activity,   label: 'My Usage',       end: false },
];

// â”€â”€â”€ Single nav link â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const NavItem = ({ to, icon: Icon, label, end, onClick }) => (
  <NavLink
    to={to}
    end={end}
    onClick={onClick}
    className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 active:scale-[0.97] ${
        isActive
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/40'
          : 'text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white'
      }`
    }
  >
    <Icon className="w-4.5 h-4.5 flex-none" strokeWidth={1.5} />
    <span className="truncate">{label}</span>
  </NavLink>
);

// â”€â”€â”€ Sidebar inner content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SidebarContent = ({ onClose }) => {
  const navigate = useNavigate();
  const { currentUser, userProfile, signOut, isAdmin } = useAuth();
  const {
    myMonthlyUsdUsed,
    myMonthlyLimitUsd,
    myCreditRemainingUsd,
    myCreditPctUsed,
    myCreditIsUnlimited,
  } = useCredit();

  // â”€â”€ Dark mode toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const initial = (currentUser?.displayName || currentUser?.email || 'U')[0].toUpperCase();

  // Ghost Owner Mask — "owner" is never shown in the UI
  const rawRole = userProfile?.role ?? 'user';
  const displayRole =
    rawRole === 'owner'       ? 'Super Admin' :
    rawRole === 'super_admin' ? 'Super Admin' :
    rawRole === 'admin'       ? 'Admin' :
                                'User';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#171717] text-slate-900 dark:text-white overflow-hidden">


      {/* â”€â”€ Navigation â”€â”€ */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-600">
          Navigation
        </p>
        {NAV.map(item => (
          <NavItem key={item.to} {...item} onClick={onClose} />
        ))}

        {/* Admin link â€” only for admin / super_admin */}
        {isAdmin && (
          <>
            <p className="px-3 pt-4 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-600">
              Admin
            </p>
            <NavItem to="/admin" icon={Shield} label="Admin Dashboard" end={false} onClick={onClose} />
          </>
        )}
      </nav>

      {/* â”€â”€ Credits mini-card â”€â”€ */}
      <div className="mx-3 mb-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
            My Credit Usage
          </span>
          <Zap className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.5} />
        </div>

        <div className="w-full bg-slate-200 dark:bg-white/10 rounded-full h-1.5 mb-2 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all duration-500 ${
              myCreditPctUsed >= 97 ? 'bg-red-500'
              : myCreditPctUsed >= 80 ? 'bg-amber-500'
              : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.max(myCreditIsUnlimited ? 100 : (myCreditPctUsed ?? 0), 1)}%` }}
          />
        </div>

        <div className="flex justify-between text-[11px]">
          <span className="text-slate-400 dark:text-gray-500">
            {myCreditIsUnlimited ? 'Unlimited allocation' : `${Number(myCreditPctUsed ?? 0).toFixed(1)}% used`}
          </span>
          <span className={`font-semibold ${
            myCreditPctUsed >= 80 ? 'text-amber-500' : 'text-emerald-500'
          }`}>
            {myCreditIsUnlimited
              ? 'Unlimited'
              : `$${(myMonthlyUsdUsed ?? 0).toFixed(2)} / $${(myMonthlyLimitUsd ?? 0).toFixed(2)}`}
          </span>
        </div>

        {!myCreditIsUnlimited && (myCreditRemainingUsd ?? 0) < 5 && (
          <p className="mt-1.5 text-[10px] text-amber-500 font-medium">
            Low remaining monthly credits
          </p>
        )}
      </div>

      {/* â”€â”€ User + Dark toggle + Sign out â”€â”€ */}
      <div className="px-3 pb-4 border-t border-slate-200 dark:border-white/10 pt-3 space-y-1">

        {/* User info */}
        <div className="flex items-center gap-2.5 px-1 mb-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600
            flex items-center justify-center text-white text-sm font-bold flex-none select-none">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
              {currentUser?.displayName || currentUser?.email?.split('@')[0]}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-gray-500 truncate">{currentUser?.email}</p>
            <p className="text-[10px] text-slate-400 dark:text-gray-600">{displayRole}</p>
          </div>
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={() => setIsDark(d => !d)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm
            text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/10
            hover:text-slate-900 dark:hover:text-white transition-all active:scale-[0.97]"
        >
          {isDark
            ? <Sun  className="w-4 h-4 flex-none" strokeWidth={1.5} />
            : <Moon className="w-4 h-4 flex-none" strokeWidth={1.5} />
          }
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm
            text-slate-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-500/10
            hover:text-red-600 dark:hover:text-red-400 transition-all active:scale-[0.97]"
        >
          <LogOut className="w-4 h-4 flex-none" strokeWidth={1.5} />
          Sign out
        </button>
      </div>
    </div>
  );
};

// â”€â”€â”€ Exported Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const Sidebar = ({ isOpen, onClose }) => (
  <div
    className={`fixed top-16 left-0 bottom-0 z-40 w-64 flex flex-col
      border-r border-slate-200 dark:border-white/10
      shadow-xl dark:shadow-2xl dark:shadow-black/50
      transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
  >
    <SidebarContent onClose={onClose} />
  </div>
);

export default Sidebar;
