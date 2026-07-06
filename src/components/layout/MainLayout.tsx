import React from 'react';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import type { ViewType } from '../../types';

interface MainLayoutProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  onOpenSettings: () => void;
  sidebarChildren: React.ReactNode;
  mainChildren: React.ReactNode;
}

export default function MainLayout({
  activeView,
  onViewChange,
  onOpenSettings,
  sidebarChildren,
  mainChildren,
}: MainLayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-transparent text-slate-100 overflow-hidden">
      <TopBar onOpenSettings={onOpenSettings} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={onViewChange}>
          {sidebarChildren}
        </Sidebar>
        <main className="flex-1 flex flex-col overflow-hidden">
          {mainChildren}
        </main>
      </div>
    </div>
  );
}
