import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Shield, 
  Search, 
  FileText, 
  Settings, 
  LogOut, 
  Bell,
  Menu,
  X
} from 'lucide-react';

const AdminLayout = () => {
  const { adminUser, adminRole, isAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await auth.signOut();
      navigate('/login');
    }
  };

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin', exact: true },
    { icon: Users, label: 'User Management', path: '/admin/users' },
    { icon: CreditCard, label: 'Credit Analytics', path: '/admin/credits' },
    { icon: Shield, label: 'Access Control', path: '/admin/access' },
    { icon: Search, label: 'Search Analytics', path: '/admin/analytics' },
    { icon: FileText, label: 'System Logs', path: '/admin/logs' },
    { icon: Settings, label: 'Settings', path: '/admin/settings' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Top Navigation Bar */}
      <header className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Menu Toggle */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden text-gray-300 hover:text-white"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-lg">LF</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">LEAD FINDER</h1>
                  <p className="text-xs text-gray-400">Admin Command Center</p>
                </div>
              </div>
            </div>

            {/* Search Bar */}
            <div className="hidden md:flex flex-1 max-w-md mx-8">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search for User ID, Transaction..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
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
                <span className="text-sm text-gray-300">System Health</span>
              </div>

              {/* Admin Profile */}
              <div className="flex items-center gap-3 px-3 py-2 bg-slate-800 rounded-lg">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-semibold">
                    {adminUser?.email?.[0]?.toUpperCase() || 'A'}
                  </span>
                </div>
                <div className="hidden lg:block">
                  <p className="text-sm font-medium text-white">
                    {adminUser?.displayName || 'Admin'}
                  </p>
                  <p className="text-xs text-gray-400 capitalize">{adminRole?.replace('_', ' ')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-40 w-64 bg-slate-900/95 backdrop-blur-xl border-r border-slate-700/50
          transform transition-transform duration-300 ease-in-out mt-16 lg:mt-0
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <nav className="flex flex-col h-full p-4">
            {/* Menu Items */}
            <div className="flex-1 space-y-1">
              {menuItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.exact}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/50'
                        : 'text-gray-300 hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              ))}
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-red-600/20 hover:text-red-400 rounded-lg transition-colors mt-4"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Logout</span>
            </button>

            {/* Admin Info Footer */}
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <div className="flex items-center gap-3 px-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-semibold">
                    {adminUser?.email?.[0]?.toUpperCase() || 'A'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {adminUser?.displayName || 'Admin User'}
                  </p>
                  <p className="text-xs text-gray-400 capitalize">
                    {adminRole?.replace('_', ' ') || 'Administrator'}
                  </p>
                </div>
              </div>
            </div>
          </nav>
        </aside>

        {/* Mobile Overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden mt-16"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
