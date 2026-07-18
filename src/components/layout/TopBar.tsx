import React from 'react';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { useApp } from '../../hooks/useApp';
import { LOGO_BASE64 } from '../../utils/logoBase64';

interface TopBarProps {
  onOpenSettings: () => void;
}

export default function TopBar({ onOpenSettings }: TopBarProps) {
  const { state, dispatch } = useApp();

  return (
    <header className="h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        {state.isMobile && (
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            className="text-slate-400 hover:text-slate-200 p-1"
          >
            <Icon name="menu" size={22} />
          </button>
        )}
        <h1 className="flex items-center gap-2 text-lg font-bold text-amber-500 tracking-tight select-none">
          <img
            src={LOGO_BASE64}
            alt="Easy酒馆Pro"
            className="h-8 w-8 rounded-lg object-cover shadow-sm"
          />
          <span>Easy酒馆Pro</span>
          <span className="rounded border border-amber-400/40 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            v1.2 公测版
          </span>
        </h1>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onOpenSettings}>
          <Icon name="settings" size={16} />
          <span className="hidden sm:inline">设置</span>
        </Button>
      </div>
    </header>
  );
}
