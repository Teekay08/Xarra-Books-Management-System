import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: 'default' | 'danger';
  hidden?: boolean;
  disabled?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
}

export function ActionMenu({ items }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;

  function handleToggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceOnRight = window.innerWidth - rect.right;
      setCoords({
        top: rect.bottom + 4,
        right: spaceOnRight >= 192 ? window.innerWidth - rect.right : 0,
        left: spaceOnRight < 192 ? rect.left : 0,
      });
    }
    setOpen((prev) => !prev);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        title="More actions"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: coords.top,
            right: coords.right || undefined,
            left: coords.right ? undefined : coords.left,
            zIndex: 9999,
          }}
          className="w-48 rounded-md bg-white shadow-lg border border-gray-200 py-1"
        >
          {visible.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { item.onClick(); setOpen(false); }}
              disabled={item.disabled}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50 ${
                item.variant === 'danger'
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
