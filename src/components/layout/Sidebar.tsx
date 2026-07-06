import React from 'react';
import type { ViewType } from '../../types';
import { useApp } from '../../hooks/useApp';
import Icon from '../ui/Icon';

interface SidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  children: React.ReactNode;
}

const tabs: { view: ViewType; label: string; icon: 'chat' | 'book' | 'users' | 'state' }[] = [
  { view: 'conversations', label: '对话', icon: 'chat' },
  { view: 'worldbook', label: '世界书', icon: 'book' },
  { view: 'characters', label: '角色', icon: 'users' },
  { view: 'statebook', label: '状态书', icon: 'state' },
];

export default function Sidebar({ activeView, onViewChange, children }: SidebarProps) {
  const { state } = useApp();
  if (!state.sidebarOpen) return null;

  return (
    <aside className="w-64 flex-shrink-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-r border-slate-200 dark:border-slate-800 flex flex-col">
      {/* Nav tabs */}
      <nav className="flex border-b border-slate-200 dark:border-slate-800">
        {tabs.map((tab) => (
          <button
            key={tab.view}
            onClick={() => onViewChange(tab.view)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors
              ${activeView === tab.view
                ? 'text-amber-400 border-b-2 border-amber-500 bg-amber-500/5'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50'
              }`}
          >
            <Icon name={tab.icon} size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
      {/* Content area */}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
