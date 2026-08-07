import React, { useMemo, useState } from 'react';
import type { BodyPartId, BodyStatus } from '../../types';

export interface BodyPartDefinition {
  id: BodyPartId;
  label: string;
  path: string;
}

export const BODY_STATUS_META: Record<BodyStatus, { label: string; fill: string; stroke: string }> = {
  healthy: { label: '健康', fill: '#f8fafc', stroke: '#94a3b8' },
  minor: { label: '轻伤', fill: '#67e8f9', stroke: '#0891b2' },
  severe: { label: '重伤', fill: '#fb7185', stroke: '#e11d48' },
  missing: { label: '缺失', fill: '#0f172a', stroke: '#475569' },
};

export const BODY_PARTS: BodyPartDefinition[] = [
  { id: 'head', label: '头部', path: 'M100 15a25 25 0 1 0 0 50a25 25 0 1 0 0-50Z' },
  { id: 'torso', label: '躯干', path: 'M69 73L84 61h32l15 12l9 108H60Z' },
  { id: 'leftUpperArm', label: '左大臂', path: 'M67 77L52 81L31 127l15 8l24-38Z' },
  { id: 'leftForearm', label: '左小臂', path: 'M31 129L16 174l14 9l17-48Z' },
  { id: 'leftHand', label: '左手', path: 'M16 176l-7 21l12 13l14-10l-5-18Z' },
  { id: 'rightUpperArm', label: '右大臂', path: 'M133 77l15 4l21 46l-15 8l-24-38Z' },
  { id: 'rightForearm', label: '右小臂', path: 'M169 129l15 45l-14 9l-17-48Z' },
  { id: 'rightHand', label: '右手', path: 'M184 176l7 21l-12 13l-14-10l5-18Z' },
  { id: 'leftThigh', label: '左大腿', path: 'M65 181h29l-4 72l-25 5l-8-55Z' },
  { id: 'leftCalf', label: '左小腿', path: 'M65 257l25-5l-5 70l-21 3l-9-42Z' },
  { id: 'leftFoot', label: '左脚', path: 'M64 325l22-3l9 13l-8 15H48l-3-9Z' },
  { id: 'rightThigh', label: '右大腿', path: 'M106 181h29l8 22l-8 55l-25-5Z' },
  { id: 'rightCalf', label: '右小腿', path: 'M110 252l25 5l10 26l-9 42l-21-3Z' },
  { id: 'rightFoot', label: '右脚', path: 'M114 322l22 3l19 16l-3 9h-39l-8-15Z' },
];

const INITIAL_STATUSES: Record<BodyPartId, BodyStatus> = {
  head: 'healthy',
  torso: 'healthy',
  leftUpperArm: 'healthy',
  leftForearm: 'minor',
  leftHand: 'healthy',
  rightUpperArm: 'healthy',
  rightForearm: 'healthy',
  rightHand: 'healthy',
  leftThigh: 'healthy',
  leftCalf: 'severe',
  leftFoot: 'healthy',
  rightThigh: 'healthy',
  rightCalf: 'healthy',
  rightFoot: 'missing',
};

export default function BodyStatusModule() {
  const [selectedStatus, setSelectedStatus] = useState<BodyStatus>('minor');
  const [activePart, setActivePart] = useState<BodyPartId>('leftForearm');
  const [statuses, setStatuses] = useState<Record<BodyPartId, BodyStatus>>(INITIAL_STATUSES);

  const activeLabel = useMemo(() => {
    const part = BODY_PARTS.find((item) => item.id === activePart);
    return `${part?.label || '部位'} · ${BODY_STATUS_META[statuses[activePart]].label}`;
  }, [activePart, statuses]);

  const updatePart = (partId: BodyPartId) => {
    setActivePart(partId);
    setStatuses((current) => ({ ...current, [partId]: selectedStatus }));
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGPathElement>, partId: BodyPartId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      updatePart(partId);
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">角色身体状态</h3>
          <p className="text-[11px] text-slate-600 dark:text-slate-400">{activeLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800" aria-label="身体状态">
          {(Object.keys(BODY_STATUS_META) as BodyStatus[]).map((status) => {
            const meta = BODY_STATUS_META[status];
            const active = status === selectedStatus;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setSelectedStatus(status)}
                title={`选择${meta.label}状态`}
                aria-pressed={active}
                className={`flex h-7 items-center gap-1 rounded px-1.5 text-[10px] font-medium transition-colors ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                    : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-700/60'
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full border" style={{ backgroundColor: meta.fill, borderColor: meta.stroke }} />
                <span className="hidden sm:inline">{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <svg
          viewBox="0 0 200 365"
          role="group"
          aria-label="可编辑的角色身体状态图"
          className="mx-auto h-[19rem] max-w-full sm:h-[22rem]"
        >
          <title>选择状态后点击身体部位</title>
          <g strokeWidth="2.5" strokeLinejoin="round">
            {BODY_PARTS.map((part) => {
              const meta = BODY_STATUS_META[statuses[part.id]];
              const isActive = part.id === activePart;
              return (
                <path
                  key={part.id}
                  d={part.path}
                  fill={meta.fill}
                  stroke={isActive ? '#f59e0b' : meta.stroke}
                  strokeWidth={isActive ? 4 : 2.5}
                  strokeDasharray={statuses[part.id] === 'missing' ? '5 3' : undefined}
                  className="cursor-pointer transition-[fill,stroke] duration-150 focus:outline-none"
                  role="button"
                  tabIndex={0}
                  aria-label={`${part.label}，当前${meta.label}`}
                  onClick={() => updatePart(part.id)}
                  onKeyDown={(event) => handleKeyDown(event, part.id)}
                >
                  <title>{`${part.label}: ${meta.label}`}</title>
                </path>
              );
            })}
          </g>
        </svg>

        <div className="space-y-1.5 border-l border-slate-200 pl-2 dark:border-slate-700">
          {BODY_PARTS.map((part) => {
            const meta = BODY_STATUS_META[statuses[part.id]];
            const active = part.id === activePart;
            return (
              <button
                key={part.id}
                type="button"
                onClick={() => updatePart(part.id)}
                className={`flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[10px] transition-colors ${
                  active
                    ? 'bg-amber-100 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full border" style={{ backgroundColor: meta.fill, borderColor: meta.stroke }} />
                <span className="min-w-0 truncate">{part.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
