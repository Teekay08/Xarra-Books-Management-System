import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useLocation } from 'react-router';

interface MobileSidebarProps {
  children: ReactNode;
}

export function MobileSidebar({ children }: MobileSidebarProps) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  return (
    <>
      {/* Hamburger – visible only on mobile */}
      <button
        onClick={toggle}
        aria-label="Toggle menu"
        className="lg:hidden fixed top-3 left-3 z-50 rounded-lg bg-white border border-gray-200 shadow-sm p-2 text-gray-700 hover:bg-gray-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar wrapper – slide in on mobile, always visible on desktop */}
      <div
        className={`
          fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200 ease-out
          lg:relative lg:translate-x-0 lg:transition-none
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {children}
      </div>
    </>
  );
}
