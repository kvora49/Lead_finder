import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { auth } from '../../firebase';
import ConfirmDangerModal from '../ConfirmDangerModal';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { 
  LayoutDashboard, 
  Users, 
  BarChart3, 
  Shield, 
  Search, 
  FileText, 
  Settings, 
  LogOut, 
  Bell,
  Menu,
  X,
  ChevronDown,
  User,
  CreditCard,
  Monitor
} from 'lucide-react';

const AdminLayoutNew = () => {
  const { adminUser, adminRole, isSuperAdmin, canEditSettings } = useAdminAuth();
  const navigate = useNavigate();

  // Ghost mask — never expose the word "owner" in the UI
  const displayRole = (adminRole === 'owner' ? 'super_admin' : adminRole)
    ?.replace(/_/g, ' ') || 'Admin';
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);

  useEffect(() => {
    const loadNotifications = async () => {
      setNotifLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, 'systemLogs'),
            orderBy('timestamp', 'desc'),
            limit(15)
          )
        );
        setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('[AdminLayout] notifications:', err);
      } finally {
        setNotifLoading(false);
      }
    };
    loadNotifications();
  }, []);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const menuItems = [
    { 
      icon: LayoutDashboard, 
      label: 'Dashboard', 
      path: '/admin/dashboard', 
      exact: true,
      description: 'System overview & stats'
    },
    { 
      icon: Users, 
      label: 'User Management', 
      path: '/admin/users',
      description: 'Manage users & access'
    },
    { 
      icon: CreditCard, 
      label: 'Platform Usage', 
      path: '/admin/credits',
      description: 'Global budget & allocations'
    },
    { 
      icon: CreditCard, 
      label: 'Credit Requests', 
      path: '/admin/requests',
      description: 'User credit top-up requests'
    },
    { 
      icon: Shield, 
      label: 'Access Control', 
      path: '/admin/access',
      description: 'Permissions & security'
    },
    { 
      icon: Search, 
      label: 'Search Analytics', 
      path: '/admin/analytics',
      description: 'Search trends & insights'
    },
    { 
      icon: FileText, 
      label: 'System Logs', 
      path: '/admin/logs',
      description: 'Audit trail & logs'
    },
    { 
      icon: Settings, 
      label: 'Settings', 
      path: '/admin/settings',
      description: 'System configuration',
      adminOnly: true
    }
  ];

  // Gate Settings by canEditSettings (super_admin + owner only; admin cannot access)
  const visibleMenuItems = menuItems.filter(item => !item.adminOnly || canEditSettings);

  const isActivePath = (path, exact = false) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-x-hidden">
      {/* Top Navigation Bar */}
      <header className="fixed inset-x-0 top-0 bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Menu Toggle */}
            <div className="flex items-center gap-4">
              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden text-gray-300 hover:text-white transition-colors"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>

              {/* Desktop Sidebar Toggle */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hidden lg:block text-gray-300 hover:text-white transition-colors"
              >
                <Menu className="w-6 h-6" />
              </button>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-lg">LF</span>
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-xl font-bold text-white">LEAD FINDER</h1>
                  <p className="text-xs text-gray-400">Admin Command Center</p>
                </div>
              </div>
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-4">
              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications((o) => !o)}
                  className="relative p-2 text-gray-300 hover:text-white
                    hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <Bell className="w-5 h-5" />
                  {notifications.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5
                      bg-red-500 rounded-full" />
                  )}
                </button>

                {showNotifications && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowNotifications(false)}
                    />
                    <div className="absolute right-0 mt-2 w-80 bg-slate-800
                      border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3
                        border-b border-slate-700">
                        <p className="text-sm font-semibold text-white">Recent activity</p>
                        <button
                          onClick={() => setShowNotifications(false)}
                          className="text-gray-400 hover:text-white transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        {notifLoading ? (
                          <div className="p-6 text-center text-xs text-gray-500">Loading...</div>
                        ) : notifications.length === 0 ? (
                          <div className="p-6 text-center text-xs text-gray-500">
                            No recent activity
                          </div>
                        ) : notifications.map((n) => (
                          <div
                            key={n.id}
                            className="px-4 py-3 border-b border-slate-700/50
                              hover:bg-slate-700/40 transition-colors"
                          >
                            <p className="text-xs font-medium text-white leading-snug">
                              {n.action || n.type || n.message || 'System event'}
                            </p>
                            {n.adminEmail && (
                              <p className="text-[10px] text-gray-500 mt-0.5">{n.adminEmail}</p>
                            )}
                            <p className="text-[10px] text-gray-600 mt-0.5">
                              {n.timestamp?.toDate?.()?.toLocaleString('en-IN') || '—'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* System Health */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-gray-300">Healthy</span>
              </div>

              {/* Admin Profile */}
              <div className="relative">
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="flex items-center gap-3 px-3 py-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">
                      {adminUser?.email?.[0]?.toUpperCase() || 'A'}
                    </span>
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-white">
                      {adminUser?.displayName || 'Admin'}
                    </p>
                    <p className="text-xs text-gray-400 capitalize">
                      {displayRole}
                    </p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                {/* Profile Dropdown */}
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
                    <div className="p-4 border-b border-slate-700">
                      <p className="text-sm font-medium text-white">{adminUser?.email}</p>
                      <p className="text-xs text-gray-400 mt-1 capitalize">Role: {displayRole}</p>
                    </div>
                    <div className="p-2">
                      <button
                        onClick={() => {
                          navigate('/admin/settings');
                          setProfileMenuOpen(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </button>
                      <button
                        onClick={() => setShowLogoutModal(true)}
                        className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex w-full max-w-full overflow-x-hidden pt-16">
        {/* Desktop Sidebar */}
        <aside className={`hidden lg:block fixed left-0 top-16 h-[calc(100vh-4rem)] bg-slate-900/50 backdrop-blur-xl border-r border-slate-700/50 transition-all duration-300 z-40 ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}>
          <nav className="p-4 space-y-2">
            {visibleMenuItems.map((item, idx) => {
              const Icon = item.icon;
              const isActive = item.exact ? isActivePath(item.path, true) : isActivePath(item.path);
              
              return (
                <NavLink
                  key={idx}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                      : 'text-gray-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : ''}`} />
                  <div className={`flex-1 min-w-0 overflow-hidden transition-all duration-200 ${
                    sidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0'
                  }`}>
                    <p className={`text-sm font-medium whitespace-nowrap ${isActive ? 'text-white' : ''}`}>
                      {item.label}
                    </p>
                    <p className={`text-xs truncate ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>
                      {item.description}
                    </p>
                  </div>
                </NavLink>
              );
            })}
          </nav>

          {/* Lead Finder App Link */}
          <div className="px-1 mb-2">
            <NavLink
              to="/"
              className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                text-emerald-400 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20
                border border-emerald-500/20 hover:border-emerald-500/40"
            >
              <Monitor className="w-5 h-5 flex-shrink-0" />
              <div className={`flex-1 min-w-0 overflow-hidden transition-all duration-200 ${
                sidebarOpen ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0'
              }`}>
                <p className="text-sm font-semibold whitespace-nowrap">Lead Finder App</p>
                <p className="text-xs text-emerald-500/70 truncate">Back to workspace</p>
              </div>
            </NavLink>
          </div>

          {/* Sidebar Footer */}
          {sidebarOpen && (
            <div className="absolute bottom-4 left-4 right-4 p-4 bg-slate-800/50 border border-slate-700/50 rounded-lg">
              <p className="text-xs text-gray-400 mb-2">System Status</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-300">Version</span>
                <span className="text-white font-medium">2.0.0</span>
              </div>
            </div>
          )}
        </aside>

        {/* Mobile Sidebar */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 top-16 z-40">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}></div>
            <aside className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 border-r border-slate-700 overflow-y-auto">
              <nav className="p-4 space-y-2">
                {visibleMenuItems.map((item, idx) => {
                  if (item.adminOnly && !canEditSettings) return null;
                  
                  const Icon = item.icon;
                  const isActive = item.exact ? isActivePath(item.path, true) : isActivePath(item.path);
                  
                  return (
                    <NavLink
                      key={idx}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-gray-500">{item.description}</p>
                      </div>
                    </NavLink>
                  );
                })}

                {/* Lead Finder App — back to main workspace */}
                <NavLink
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                    text-emerald-400 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20
                    border border-emerald-500/20"
                >
                  <Monitor className="w-5 h-5" />
                  <div>
                    <p className="text-sm font-semibold">Lead Finder App</p>
                    <p className="text-xs text-emerald-500/70">Back to workspace</p>
                  </div>
                </NavLink>
              </nav>
            </aside>
          </div>
        )}

        {/* Main Content */}
        <main className={`flex-1 transition-all duration-300 min-w-0 ${
          sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'
        }`}>
          <div className="min-h-[calc(100vh-4rem)]">
            <Outlet />
          </div>
        </main>
      </div>

      <ConfirmDangerModal
        isOpen={showLogoutModal}
        title="Sign out"
        message="Are you sure you want to sign out of the admin dashboard?"
        confirmLabel="Sign out"
        onConfirm={() => {
          setShowLogoutModal(false);
          handleLogout();
        }}
        onClose={() => setShowLogoutModal(false)}
      />
    </div>
  );
};

export default AdminLayoutNew;
