import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Search } from 'lucide-react';
import Sidebar from './Sidebar';

/**
 * AppLayout — shell for all authenticated user routes.
 *
 * A fixed top header contains the hamburger toggle + "Lead Finder" brand.
 * The sidebar panel slides below the header using translate transforms.
 * Main content shifts right (ml-64) when the sidebar is open.
 */
const AppLayout = () => {
  // Default closed — sidebar auto-shows on desktop via md:translate-x-0 in Sidebar.jsx
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A0A] transition-colors duration-300">

      {/* ── Mobile-only top navbar (hidden on md+) ──────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-white/90 dark:bg-[#171717]/90
        backdrop-blur-md border-b border-slate-200 dark:border-white/10
        flex items-center px-4 shadow-sm md:hidden">
        {/* Hamburger toggle */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 transition-all flex-none active:scale-[0.97]"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" strokeWidth={1.5} />
        </button>

        {/* Brand */}
        <div className="flex items-center gap-2.5 ml-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600
            flex items-center justify-center shadow-md flex-none">
            <Search className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
          <div className="leading-tight">
            <p className="font-bold text-slate-900 dark:text-white text-base leading-none">Lead Finder</p>
            <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-0.5">Business Intelligence</p>
          </div>
        </div>
      </header>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── Mobile backdrop overlay ──────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main content — shifts right on desktop via md:ml-64 ──────────── */}
      <div className="min-h-screen flex flex-col pt-16 md:pt-0 transition-all duration-300 ml-0 md:ml-64">
        <main className="flex-1 px-4 md:px-8">
          <Outlet />
        </main>
      </div>

    </div>
  );
};

export default AppLayout;
