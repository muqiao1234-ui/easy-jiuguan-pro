import React from 'react';
import TopBar from './TopBar';
import Icon from '../ui/Icon';
import { useApp } from '../../hooks/useApp';
import type { ViewType } from '../../types';

interface MobileLayoutProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  onOpenSettings: () => void;
  sidebarChildren: React.ReactNode;
  mainChildren: React.ReactNode;
}

const tabs: { view: ViewType; label: string; icon: 'chat' | 'book' | 'users' | 'state' }[] = [
  { view: 'conversations', label: '对话', icon: 'chat' },
  { view: 'worldbook', label: '世界书', icon: 'book' },
  { view: 'characters', label: '角色', icon: 'users' },
  { view: 'statebook', label: '状态书', icon: 'state' },
];

export default function MobileLayout({
  activeView,
  onViewChange,
  onOpenSettings,
  sidebarChildren,
  mainChildren,
}: MobileLayoutProps) {
  const { state, dispatch } = useApp();

  const closeDrawer = () => dispatch({ type: 'TOGGLE_SIDEBAR' });

  return (
    <div className="h-screen flex flex-col bg-transparent text-slate-800 dark:text-slate-100 overflow-hidden">
      <TopBar onOpenSettings={onOpenSettings} />
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* 主内容区 — 始终全屏显示 */}
        <main className="flex-1 overflow-y-auto">{mainChildren}</main>

        {/* 抽屉式侧边栏 — 仅当 sidebarOpen 时显示 */}
        {state.sidebarOpen && (
          <>
            {/* 半透明遮罩 — 点击关闭 */}
            <div
              className="absolute inset-0 bg-black/50 z-40"
              onClick={closeDrawer}
            />
            {/* 侧边栏抽屉 — 从左侧滑出 */}
            <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[80%] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-r border-slate-200 dark:border-slate-800 z-50 flex flex-col shadow-2xl">
              {/* 导航 tab */}
              <nav className="flex border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
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
              {/* 内容区 */}
              <div className="flex-1 overflow-y-auto">{sidebarChildren}</div>
            </aside>
          </>
        )}

        {/* 底部 Tab Bar — 快速切换视图 */}
        <nav className="flex-shrink-0 flex bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          {tabs.map((tab) => (
            <button
              key={tab.view}
              onClick={() => onViewChange(tab.view)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors
                ${activeView === tab.view ? 'text-amber-400' : 'text-slate-500'}`}
            >
              <Icon name={tab.icon} size={18} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
