import React, { useMemo, useState } from 'react';
import type { MvuNodeData } from '../../types';
import Icon from '../ui/Icon';

interface MvuBubbleProps {
  data: MvuNodeData;
}

interface StateRow {
  path: string;
  value: string;
}

const MAX_ROWS = 36;
const MAX_DEPTH = 5;

function displayValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value || '""';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 280 ? `${serialized.slice(0, 277)}...` : serialized;
  } catch {
    return String(value);
  }
}

function collectStateRows(value: unknown, path = '', depth = 0, rows: StateRow[] = []): StateRow[] {
  if (rows.length >= MAX_ROWS) return rows;
  if (value === null || typeof value !== 'object' || depth >= MAX_DEPTH) {
    rows.push({ path: path || 'state', value: displayValue(value) });
    return rows;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) rows.push({ path: path || 'state', value: '[]' });
    value.forEach((item, index) => collectStateRows(item, `${path}[${index}]`, depth + 1, rows));
    return rows;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !key.startsWith('$'));
  if (entries.length === 0) rows.push({ path: path || 'state', value: '{}' });
  entries.forEach(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    collectStateRows(child, childPath, depth + 1, rows);
  });
  return rows;
}

export default function MvuBubble({ data }: MvuBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const state = data.displayState || data.checkpoint?.statData;
  const rows = useMemo(() => state ? collectStateRows(state) : [], [state]);
  const changes = data.displayChanges || [];
  const diagnostics = data.diagnostics || [];
  const fieldCount = rows.length || changes.length;

  return (
    <section className="border-t border-dashed border-cyan-300/60 bg-cyan-50/70 dark:border-cyan-800/50 dark:bg-cyan-950/20">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3.5 py-2 text-left transition-colors hover:bg-cyan-100/60 dark:hover:bg-cyan-900/25"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-cyan-500/15 text-[10px] font-bold text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-200">MV</span>
        <span className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-200">MVU 状态</span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-cyan-700/70 dark:text-cyan-300/70">
          {fieldCount > 0 ? `${fieldCount} 个核心字段` : '本轮没有可展示的状态字段'}
          {changes.length > 0 ? `，${changes.length} 项更新` : ''}
        </span>
        <Icon name="chevron" size={14} className={`text-cyan-600 transition-transform dark:text-cyan-300 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-cyan-200/70 px-3.5 py-2.5 dark:border-cyan-800/50">
          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-cyan-200/80 dark:border-cyan-800/60">
              <table className="min-w-full text-left text-[11px] leading-relaxed">
                <thead className="bg-cyan-100/70 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-100">
                  <tr>
                    <th className="w-[36%] px-2 py-1.5 font-semibold">字段</th>
                    <th className="px-2 py-1.5 font-semibold">当前数据</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cyan-100 dark:divide-cyan-900/50">
                  {rows.map((row, index) => (
                    <tr key={`${row.path}-${index}`}>
                      <td className="break-all px-2 py-1.5 align-top font-mono text-cyan-800 dark:text-cyan-200">{row.path}</td>
                      <td className="break-all px-2 py-1.5 align-top text-slate-700 dark:text-slate-200">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : changes.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-cyan-200/80 dark:border-cyan-800/60">
              <table className="min-w-full text-left text-[11px] leading-relaxed">
                <thead className="bg-cyan-100/70 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-100">
                  <tr><th className="px-2 py-1.5 font-semibold">字段</th><th className="px-2 py-1.5 font-semibold">本轮更新后</th></tr>
                </thead>
                <tbody className="divide-y divide-cyan-100 dark:divide-cyan-900/50">
                  {changes.map((change, index) => (
                    <tr key={`${change.path}-${index}`}>
                      <td className="break-all px-2 py-1.5 align-top font-mono text-cyan-800 dark:text-cyan-200">{change.path}</td>
                      <td className="break-all px-2 py-1.5 align-top text-slate-700 dark:text-slate-200">{displayValue(change.newValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">该回复未产生 MVU 初始数据或状态更新。</p>
          )}

          {diagnostics.length > 0 && (
            <p className="text-[10px] leading-relaxed text-rose-600 dark:text-rose-300">解析提示：{diagnostics.join('；')}</p>
          )}
        </div>
      )}
    </section>
  );
}
