import React from 'react';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import type { ImageGenerationTask, ViewType } from '../../types';

interface MainLayoutProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  onOpenSettings: () => void;
  imageTasks?: ImageGenerationTask[];
  onOpenImageTask?: (task: ImageGenerationTask) => void;
  onCancelImageTask?: (taskId: string) => void;
  sidebarChildren: React.ReactNode;
  mainChildren: React.ReactNode;
}

export default function MainLayout({
  activeView,
  onViewChange,
  onOpenSettings,
  imageTasks,
  onOpenImageTask,
  onCancelImageTask,
  sidebarChildren,
  mainChildren,
}: MainLayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-transparent text-slate-100 overflow-hidden">
      <TopBar onOpenSettings={onOpenSettings} imageTasks={imageTasks} onOpenImageTask={onOpenImageTask} onCancelImageTask={onCancelImageTask} />
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
