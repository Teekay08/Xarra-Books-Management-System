import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  subtitle?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  onSearchChange?: (search: string) => void;
  selectedLabel?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  onCreateNew?: () => void;
  createNewLabel?: string;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  onSearchChange,
  selectedLabel,
  placeholder = 'Select...',
  required,
  disabled,
  onCreateNew,
  createNewLabel = 'Create new',
  className,
}: SearchableSelectProps) {
  const [isOpen,           setIsOpen]           = useState(false);
  const [search,           setSearch]           = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dropdownPos,      setDropdownPos]      = useState({ top: 0, left: 0, width: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef  = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const listRef      = useRef<HTMLUListElement>(null);

  const selectedOption = options.find(o => o.value === value)
    ?? (value && selectedLabel ? { value, label: selectedLabel } : undefined);

  const filtered = search
    ? options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        o.subtitle?.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setHighlightedIndex(0);
  }, []);

  // Calculate dropdown position from the trigger's bounding rect
  const updatePos = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownPos({
      top:   rect.bottom + window.scrollY,
      left:  rect.left   + window.scrollX,
      width: rect.width,
    });
  }, []);

  // Recompute position on open and on any scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [isOpen, updatePos]);

  // Close when clicking outside — must check both trigger container AND portal dropdown
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target))  return;
      close();
    }
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, close]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, isOpen]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightedIndex]) { onChange(filtered[highlightedIndex].value); close(); }
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  }

  function handleOpen() {
    if (disabled) return;
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function select(val: string) { onChange(val); close(); }

  const baseCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus-within:border-green-500 focus-within:ring-1 focus-within:ring-green-500';

  // Portal dropdown — renders into document.body so overflow:hidden never clips it
  const dropdown = isOpen ? createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top:      dropdownPos.top + 4,
        left:     dropdownPos.left,
        width:    dropdownPos.width,
        zIndex:   9999,
      }}
      className="rounded-md border border-gray-200 bg-white shadow-xl max-h-64 overflow-hidden flex flex-col"
    >
      <ul ref={listRef} className="overflow-y-auto flex-1" role="listbox">
        {filtered.length === 0 && (
          <li className="px-3 py-2.5 text-sm text-gray-400 italic">No results found</li>
        )}
        {filtered.map((opt, i) => (
          <li
            key={opt.value}
            role="option"
            aria-selected={opt.value === value}
            onMouseDown={e => { e.preventDefault(); select(opt.value); }}
            onMouseEnter={() => setHighlightedIndex(i)}
            className={`px-3 py-2 text-sm cursor-pointer select-none ${
              i === highlightedIndex ? 'bg-green-50 text-green-900' : 'text-gray-700 hover:bg-gray-50'
            } ${opt.value === value ? 'font-medium' : ''}`}
          >
            <span>{opt.label}</span>
            {opt.subtitle && <span className="block text-xs text-gray-400">{opt.subtitle}</span>}
          </li>
        ))}
      </ul>

      {onCreateNew && (
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); close(); onCreateNew(); }}
          className="w-full shrink-0 border-t border-gray-100 px-3 py-2.5 text-sm text-[#c0392b] hover:bg-red-50 font-semibold text-left flex items-center gap-1.5 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          {createNewLabel}
        </button>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      {/* Hidden native input for required validation */}
      {required && (
        <input
          tabIndex={-1} autoComplete="off"
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
          value={value} required onChange={() => {}}
        />
      )}

      {/* Trigger button or search input */}
      {!isOpen ? (
        <button
          type="button"
          onClick={handleOpen}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={`${baseCls} text-left flex items-center justify-between ${
            disabled ? 'bg-gray-50 cursor-not-allowed' : 'cursor-pointer bg-white hover:border-gray-400'
          }`}
        >
          <span className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <svg className="w-4 h-4 text-gray-400 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
      ) : (
        <div className={`${baseCls} flex items-center gap-1`}>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setHighlightedIndex(0); onSearchChange?.(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder="Type to search..."
            className="flex-1 outline-none bg-transparent text-sm"
          />
          <button type="button" onClick={close} className="text-gray-400 hover:text-gray-600 shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      )}

      {dropdown}
    </div>
  );
}
