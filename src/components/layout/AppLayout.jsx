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
    <div className="min-h-screen bg-slate-50">

      {/* ── Fixed top header ─────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-white border-b border-slate-200
        flex items-center px-4 shadow-md">
        {/* 1 — Hamburger toggle */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-all flex-none active:scale-[0.97]"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* 2 — Brand immediately to the right */}
        <div className="flex items-center gap-2.5 ml-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600
            flex items-center justify-center shadow-md flex-none">
            <Search className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <p className="font-bold text-slate-900 text-base leading-none">Lead Finder</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Business Intelligence</p>
          </div>
        </div>
      </header>

      {/* ── Sidebar (slides in/out below the header) ─────────────────────── */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── Backdrop overlay when sidebar is open on mobile ─────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 top-16 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      {/* Always md:ml-64 — sidebar is always visible on desktop via CSS */}
      <div className="min-h-screen flex flex-col pt-16 transition-all duration-300 ml-0 md:ml-64">
        <main className="flex-1 px-4 md:px-8">
          <Outlet />
        </main>
      </div>

    </div>
  );
};

export default AppLayout;
