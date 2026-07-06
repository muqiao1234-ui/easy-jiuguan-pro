import React, { useState } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
}

export default function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className={`absolute z-50 px-2 py-1 text-xs text-slate-200 bg-slate-800 border border-slate-600 
            rounded-md whitespace-nowrap pointer-events-none animate-[fadeIn_0.15s_ease-out]
            ${position === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} left-1/2 -translate-x-1/2`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
