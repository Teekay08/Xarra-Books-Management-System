import { useState, useEffect } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar.js';
import { UserMenu } from './UserMenu.js';
import { NotificationBell } from './NotificationBell.js';
import { MobileSidebar } from './MobileSidebar.js';

const STORAGE_KEY = 'xarra_sidebar_open';

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(sidebarOpen)); } catch { /* ignore */ }
  }, [sidebarOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex shrink-0 transition-all duration-200 ease-in-out overflow-hidden ${
          sidebarOpen ? 'w-[220px]' : 'w-0'
        }`}
      >
        <div className="w-[220px] shrink-0 h-full">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      <div className="lg:hidden">
        <MobileSidebar>
          <Sidebar />
        </MobileSidebar>
      </div>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="h-12 shrink-0 border-b border-gray-200 bg-white flex items-center gap-2 px-4 z-10">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
          >
            {sidebarOpen ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4M9 3v18M15 9l-3 3 3 3" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h4M9 3v18M13 9l3 3-3 3" />
              </svg>
            )}
          </button>

          <div className="flex-1" />
          <NotificationBell />
          <UserMenu />
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-content mx-auto px-5 py-5 sm:px-6 sm:py-6">
            <Outlet />
          </div>
        </main>

        {/* Footer */}
        <footer className="shrink-0 border-t border-gray-100 bg-white px-5 py-2.5">
          <p className="text-[11px] text-gray-400 text-center">
            Powered by{' '}
            <a
              href="https://www.tsedemeko.africa"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-blue-500 hover:text-blue-700 transition-colors"
            >
              Tsedemeko
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
