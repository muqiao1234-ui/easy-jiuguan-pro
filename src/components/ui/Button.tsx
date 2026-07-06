import React from 'react';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

const variantStyles: Record<string, string> = {
  primary:
    'bg-amber-600 hover:bg-amber-500 text-slate-900 font-semibold shadow-lg shadow-amber-600/20',
  secondary:
    'bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600',
  ghost:
    'bg-transparent hover:bg-slate-800 text-slate-300',
  danger:
    'bg-red-700 hover:bg-red-600 text-white',
};

const sizeStyles: Record<string, string> = {
  sm: 'px-2.5 py-1 text-xs rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-xl',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  children,
  className = '',
  title,
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 transition-all duration-200 
        ${variantStyles[variant]} ${sizeStyles[size]} 
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
        ${className}`}
    >
      {loading && (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12" cy="12" r="10"
            stroke="currentColor" strokeWidth="4" fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
