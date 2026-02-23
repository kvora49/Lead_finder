import { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { auth } from '../../firebase';
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
  CreditCard
} from 'lucide-react';

const AdminLayoutNew = () => {
  const { adminUser, adminRole } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      try {
        await auth.signOut();
        navigate('/login');
      } catch (error) {
        console.error('Logout error:', error);
      }
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
      label: 'Credit Analytics', 
      path: '/admin/credits',
      description: 'Credit usage & monitoring'
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

  const isActivePath = (path, exact = false) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Top Navigation Bar */}
      <header className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-50">
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
              <button className="relative p-2 text-gray-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>

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
                      {adminRole?.replace('_', ' ') || 'Admin'}
                    </p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>

                {/* Profile Dropdown */}
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
                    <div className="p-4 border-b border-slate-700">
                      <p className="text-sm font-medium text-white">{adminUser?.email}</p>
                      <p className="text-xs text-gray-400 mt-1 capitalize">Role: {adminRole?.replace('_', ' ')}</p>
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
                        onClick={handleLogout}
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

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className={`hidden lg:block fixed left-0 top-16 h-[calc(100vh-4rem)] bg-slate-900/50 backdrop-blur-xl border-r border-slate-700/50 transition-all duration-300 z-40 ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}>
          <nav className="p-4 space-y-2">
            {menuItems.map((item, idx) => {
              if (item.adminOnly && adminRole !== 'super_admin') return null;
              
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
                  {sidebarOpen && (
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${isActive ? 'text-white' : ''}`}>
                        {item.label}
                      </p>
                      <p className={`text-xs truncate ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>
                        {item.description}
                      </p>
                    </div>
                  )}
                </NavLink>
              );
            })}
          </nav>

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
                {menuItems.map((item, idx) => {
                  if (item.adminOnly && adminRole !== 'super_admin') return null;
                  
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
              </nav>
            </aside>
          </div>
        )}

        {/* Main Content */}
        <main className={`flex-1 transition-all duration-300 ${
          sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'
        }`}>
          <div className="min-h-[calc(100vh-4rem)]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayoutNew;
