import React, { useState } from 'react';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { useApp } from '../../hooks/useApp';
import { LOGO_BASE64 } from '../../utils/logoBase64';
import type { ImageGenerationTask } from '../../types';

interface TopBarProps {
  onOpenSettings: () => void;
  imageTasks?: ImageGenerationTask[];
  onOpenImageTask?: (task: ImageGenerationTask) => void;
  onCancelImageTask?: (taskId: string) => void;
}

const taskLabel: Record<ImageGenerationTask['status'], string> = {
  queued: '准备提交',
  generating: '生图中',
  downloading: '下载图片',
  retry_wait: '等待重试',
  failed: '生成失败',
};

export default function TopBar({ onOpenSettings, imageTasks = [], onOpenImageTask, onCancelImageTask }: TopBarProps) {
  const { state, dispatch } = useApp();
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);
  const newestTask = imageTasks[imageTasks.length - 1];
  const failedCount = imageTasks.filter((task) => task.status === 'failed').length;

  return (
    <header className="relative z-40 h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {state.isMobile && (
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 p-1"
          >
            <Icon name="menu" size={22} />
          </button>
        )}
        <h1 className="flex items-center gap-2 text-lg font-bold text-amber-500 tracking-tight select-none min-w-0">
          <img src={LOGO_BASE64} alt="Easy酒馆Pro" className="h-8 w-8 rounded-lg object-cover shadow-sm" />
          <span className="truncate">Easy酒馆Pro</span>
          <span title="1.40 为最终稳定版，后续仅进行 Debug 维护" className="inline max-w-28 shrink-0 truncate rounded border border-amber-400/40 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">v1.39 早鸟测试</span>
          <span title="1.40 为最终稳定版，后续仅进行 Debug 维护" className="hidden lg:inline max-w-64 truncate text-[10px] text-slate-500 dark:text-slate-400">1.40 为最终稳定版，后续仅进行 Debug 维护</span>
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {newestTask && <div className="relative">
          <button
            type="button"
            onClick={() => setTaskPanelOpen((open) => !open)}
            title="查看后台生图任务"
            className={`flex h-8 max-w-40 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors ${failedCount ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800/70 dark:bg-red-950/30 dark:text-red-200' : 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800/70 dark:bg-sky-950/30 dark:text-sky-100'}`}
          >
            <Icon name="image" size={14} />
            <span className="truncate">{failedCount ? `${failedCount} 个生图失败` : taskLabel[newestTask.status]}</span>
            <span className="rounded-full bg-black/10 px-1 text-[10px] dark:bg-white/10">{imageTasks.length}</span>
          </button>
          {taskPanelOpen && <div className="absolute right-0 top-10 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100">后台生图任务</div>
            <div className="max-h-72 overflow-y-auto">
              {imageTasks.slice().reverse().map((task) => <div key={task.id} className="flex gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 dark:border-slate-800">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setTaskPanelOpen(false); onOpenImageTask?.(task); }}>
                  <div className="flex items-center justify-between gap-2 text-xs"><span className="truncate font-medium text-slate-900 dark:text-slate-100">{task.generation.userHint}</span><span className={task.status === 'failed' ? 'shrink-0 text-red-600 dark:text-red-300' : 'shrink-0 text-sky-700 dark:text-sky-300'}>{taskLabel[task.status]}</span></div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className={`h-full rounded-full ${task.status === 'failed' ? 'w-full bg-red-500/80' : task.status === 'retry_wait' ? 'w-1/3 bg-amber-500/80' : 'w-2/3 animate-pulse bg-sky-500/80'}`} /></div>
                  <p className="mt-1 truncate text-[10px] text-slate-600 dark:text-slate-400">{task.error || `${task.generation.style} · ${task.generation.aspectRatio} · 点击编辑提示词`}</p>
                </button>
                <div className="flex shrink-0 items-start gap-1">
                  {task.status === 'failed' && <button type="button" title="编辑提示词并重新生成" aria-label="编辑提示词并重新生成" onClick={() => { setTaskPanelOpen(false); onOpenImageTask?.(task); }} className="h-6 rounded px-1.5 text-[10px] text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40">编辑</button>}
                  <button type="button" title={task.status === 'failed' ? '删除失败任务' : '取消后台任务'} aria-label={task.status === 'failed' ? '删除失败任务' : '取消后台任务'} onClick={() => onCancelImageTask?.(task.id)} className="h-6 w-6 rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"><Icon name="close" size={14} /></button>
                </div>
              </div>)}
            </div>
          </div>}
        </div>}
        <Button variant="ghost" size="sm" onClick={onOpenSettings}>
          <Icon name="settings" size={16} />
          <span className="hidden sm:inline">设置</span>
        </Button>
      </div>
    </header>
  );
}
