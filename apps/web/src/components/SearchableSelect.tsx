import { useState, useRef, useEffect, useCallback } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  subtitle?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
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
  placeholder = 'Select...',
  required,
  disabled,
  onCreateNew,
  createNewLabel = 'Create new',
  className,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const filtered = search
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        (o.subtitle?.toLowerCase().includes(search.toLowerCase()))
      )
    : options;

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setHighlightedIndex(0);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
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
        return;
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightedIndex]) {
          onChange(filtered[highlightedIndex].value);
          close();
        }
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

  function select(val: string) {
    onChange(val);
    close();
  }

  const baseCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus-within:border-green-500 focus-within:ring-1 focus-within:ring-green-500';

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      {/* Hidden native input for form validation */}
      {required && (
        <input
          tabIndex={-1}
          autoComplete="off"
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
          value={value}
          required
          onChange={() => {}}
        />
      )}

      {/* Trigger */}
      {!isOpen ? (
        <button
          type="button"
          onClick={handleOpen}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={`${baseCls} text-left flex items-center justify-between ${disabled ? 'bg-gray-50 cursor-not-allowed' : 'cursor-pointer bg-white hover:border-gray-400'}`}
        >
          <span className={selectedOption ? 'text-gray-900' : 'text-gray-400'}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <svg className="w-4 h-4 text-gray-400 shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      ) : (
        <div className={baseCls}>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setHighlightedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Type to search..."
            className="w-full outline-none bg-transparent text-sm"
          />
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-60 overflow-hidden flex flex-col">
          <ul ref={listRef} className="overflow-y-auto flex-1" role="listbox">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400">No results found</li>
            )}
            {filtered.map((opt, i) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                onClick={() => select(opt.value)}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={`px-3 py-2 text-sm cursor-pointer ${
                  i === highlightedIndex ? 'bg-green-50 text-green-900' : 'text-gray-700 hover:bg-gray-50'
                } ${opt.value === value ? 'font-medium' : ''}`}
              >
                <span>{opt.label}</span>
                {opt.subtitle && (
                  <span className="block text-xs text-gray-400">{opt.subtitle}</span>
                )}
              </li>
            ))}
          </ul>

          {/* Create new button */}
          {onCreateNew && (
            <button
              type="button"
              onClick={() => { close(); onCreateNew(); }}
              className="w-full border-t border-gray-100 px-3 py-2.5 text-sm text-green-700 hover:bg-green-50 font-medium text-left flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {createNewLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
