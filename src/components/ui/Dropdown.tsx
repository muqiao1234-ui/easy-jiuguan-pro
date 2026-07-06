import React, { useState, useRef, useEffect } from 'react';

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function Dropdown({
  options,
  value,
  onChange,
  placeholder = '请选择...',
  className = '',
  disabled = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-slate-800 border border-slate-700 
          rounded-lg text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-50"
      >
        <span className={selected ? 'text-slate-100' : 'text-slate-500'}>
          {selected?.label || placeholder}
        </span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors
                ${opt.value === value ? 'bg-amber-600/20 text-amber-400' : 'text-slate-300 hover:bg-slate-700'}`}
            >
              {opt.label}
            </button>
          ))}
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-500">无可用选项</div>
          )}
        </div>
      )}
    </div>
  );
}
