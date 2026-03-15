import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Search } from 'lucide-react';
import Sidebar from './Sidebar';

/**
 * AppLayout — shell for all authenticated user routes.
 *
 * A fixed top header contains the hamburger toggle + "Lead Finder" brand.
 * The sidebar panel slides below the header using translate transforms.
 * Sidebar overlays content as a fixed panel — no content shift on any screen size.
 */
const AppLayout = () => {
  // Default closed — sidebar auto-shows on desktop via md:translate-x-0 in Sidebar.jsx
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0A0A0A] transition-colors duration-300">

      {/* ── Top navbar — visible on ALL screens ──────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-white/90 dark:bg-[#171717]/90
        backdrop-blur-md border-b border-slate-200 dark:border-white/10
        flex items-center px-4 shadow-sm">
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

      {/* ── Backdrop overlay — all screen sizes ──────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="min-h-screen flex flex-col pt-16">
        <main className="flex-1 px-4 md:px-8 w-full max-w-screen-2xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

    </div>
  );
};

export default AppLayout;
