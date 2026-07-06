import React from 'react';
import type { GalgameData } from '../../types';

interface GalgameCardProps {
  data: GalgameData;
  isEditing?: boolean;
  onEdit?: (data: GalgameData) => void;
}

/* ════════════════════════════════════════════════════════
 *  Icon Mappers — UI 视觉框架层（静态图标，不受文本篡改影响）
 * ════════════════════════════════════════════════════════ */

/** 健康度 → 1~5 颗像素红心 */
function healthToHearts(health: string): { count: number; label: string } {
  const h = health.toLowerCase();
  let count = 3;
  let label = health;
  if (/濒危|垂死|critical|dying/i.test(h)) { count = 1; label = '濒危'; }
  else if (/重伤|虚弱|ill|weak|injured/i.test(h)) { count = 2; label = '虚弱'; }
  else if (/欠佳|疲惫|轻伤|tired|poor/i.test(h)) { count = 3; label = '欠佳'; }
  else if (/良好|健康|healthy|good/i.test(h)) { count = 4; label = '良好'; }
  else if (/极佳|满血|excellent|perfect/i.test(h)) { count = 5; label = '极佳'; }
  return { count, label };
}

/** 分数 (-100~100) → 1~5 颗星 */
function affinityToStars(score: number): number {
  if (score >= 70) return 5;
  if (score >= 40) return 4;
  if (score >= 10) return 3;
  if (score >= -30) return 2;
  return 1;
}

/** 警惕度 (0~100) → 图标 */
function vigilanceToIcon(v: number): { icon: string; tier: string } {
  if (v < 25) return { icon: '☀️', tier: '松懈' };
  if (v < 50) return { icon: '☁️', tier: '平和' };
  if (v < 75) return { icon: '🛡️', tier: '警觉' };
  return { icon: '🗡️', tier: '敌意' };
}

/** 心情文本 → 情绪小图标 */
function moodToIcon(mood: string): string {
  const m = mood.toLowerCase();
  if (/傲娇|tsundere|tsun/i.test(m)) return '💢';
  if (/欣喜|开心|快乐|happy|joy/i.test(m)) return '✨';
  if (/害羞|腼腆|shy|blush/i.test(m)) return '😊';
  if (/愤怒|生气|angry|mad/i.test(m)) return '🔥';
  if (/悲伤|难过|sad|cry/i.test(m)) return '💧';
  if (/恐惧|害怕|scared|fear/i.test(m)) return '😨';
  if (/冷漠|无感|cold| numb/i.test(m)) return '❄️';
  if (/感动|touch|moved/i.test(m)) return '🌟';
  if (/惊讶|surprise/i.test(m)) return '❓';
  if (/得意|smug|proud/i.test(m)) return '😏';
  return '💭';
}

/* ════════════════════════════════════════════════════════
 *  主卡片
 * ════════════════════════════════════════════════════════ */
export default function GalgameCard({ data, isEditing, onEdit }: GalgameCardProps) {
  if (isEditing && onEdit) {
    return <GalgameEditCard data={data} onSave={onEdit} />;
  }

  const health = healthToHearts(data.health);
  const vigil = vigilanceToIcon(data.vigilance);
  const moodIcon = moodToIcon(data.mood);
  const sStars = affinityToStars(data.surfaceAffinity);
  const hStars = affinityToStars(data.hiddenAffinity);

  return (
    <div className="mt-1.5 border-4 border-slate-900 dark:border-slate-950 bg-slate-950 dark:bg-black rounded-none p-2.5 font-mono text-sm tracking-wider shadow-[4px_4px_0_0_rgba(0,0,0,0.6)]">
      {/* Header — 明文角色名强绑定标记 */}
      <div className="flex items-center justify-between mb-2 border-b-2 border-slate-800 pb-1.5">
        <span className="text-emerald-400 font-bold text-xs whitespace-nowrap">
          ┌── 🎮 [ {data.name} · 状态面板 ] ──┐
        </span>
      </div>

      {/* 公开信息区 */}
      <div className="space-y-1">
        {/* 健康度 */}
        <div className="flex items-center gap-2">
          <span className="text-rose-400 w-20 shrink-0 text-xs">健康度：</span>
          <span className="text-yellow-400 text-xs">({health.label})</span>
          <span className="ml-auto tracking-tight">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={i < health.count ? 'opacity-100' : 'opacity-20 grayscale'}>
                ❤️
              </span>
            ))}
          </span>
        </div>

        {/* 外在心情 */}
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 w-20 shrink-0 text-xs">外在心情：</span>
          <span className="text-cyan-300 text-xs">({data.mood})</span>
          <span className="ml-auto text-base">{moodIcon}</span>
        </div>

        {/* 警惕度 */}
        <div className="flex items-center gap-2">
          <span className="text-orange-400 w-20 shrink-0 text-xs">警惕度：</span>
          <span className="text-yellow-400 text-xs">({data.vigilance})</span>
          <span className="ml-auto text-[10px] text-slate-400">{vigil.tier}</span>
          <span className="text-base">{vigil.icon}</span>
        </div>
      </div>

      {/* 分隔线 */}
      <div className="my-1.5 border-t-2 border-dashed border-slate-800" />

      {/* 里信息区（仅玩家可见） */}
      <div className="space-y-1">
        <div className="text-[9px] text-purple-500/70 mb-0.5">
          ✦ 里信息 (玩家可见 · AI不可见)
        </div>

        {/* 表好感度 */}
        <div className="flex items-center gap-2">
          <span className="text-amber-400 w-20 shrink-0 text-xs">表好感度：</span>
          <span className="text-yellow-400 text-xs">({data.surfaceAffinity > 0 ? '+' : ''}{data.surfaceAffinity})</span>
          <span className="ml-auto tracking-tight">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={i < sStars ? 'opacity-100' : 'opacity-20 grayscale'}>
                ⭐
              </span>
            ))}
          </span>
        </div>

        {/* 里好感度 */}
        <div className="flex items-center gap-2">
          <span className="text-fuchsia-400 w-20 shrink-0 text-xs">里好感度：</span>
          <span className="text-yellow-400 text-xs">({data.hiddenAffinity > 0 ? '+' : ''}{data.hiddenAffinity})</span>
          <span className="ml-auto tracking-tight">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={i < hStars ? 'opacity-100' : 'opacity-20 grayscale'}>
                ❤️
              </span>
            ))}
          </span>
        </div>
      </div>

      {/* 底部标记 */}
      <div className="mt-1.5 pt-1 border-t border-slate-800 text-[8px] text-slate-700 flex justify-between">
        <span>◈ 里信息·AI不可见</span>
        <span>✏️编辑气泡可篡改</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
 *  篡改编辑卡片
 * ════════════════════════════════════════════════════════ */
function GalgameEditCard({ data, onSave }: { data: GalgameData; onSave: (d: GalgameData) => void }) {
  const [edit, setEdit] = React.useState<GalgameData>({ ...data });

  return (
    <div className="mt-1.5 border-4 border-amber-500 bg-slate-950 rounded-none p-2.5 font-mono text-sm tracking-wider shadow-[4px_4px_0_0_rgba(0,0,0,0.6)] space-y-1.5">
      <div className="text-amber-400 font-bold mb-1 border-b-2 border-amber-600/50 pb-1 text-xs">
        🎮 篡改数值面板
      </div>

      <div className="flex items-center gap-2">
        <span className="text-rose-400 w-20 text-xs">健康度：</span>
        <input
          value={edit.health}
          onChange={(e) => setEdit({ ...edit, health: e.target.value })}
          className="flex-1 bg-black/60 text-yellow-300 border border-slate-700 px-2 py-0.5 rounded-none text-xs"
          placeholder="良好/欠佳/虚弱..."
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-cyan-400 w-20 text-xs">外在心情：</span>
        <input
          value={edit.mood}
          onChange={(e) => setEdit({ ...edit, mood: e.target.value })}
          className="flex-1 bg-black/60 text-cyan-300 border border-slate-700 px-2 py-0.5 rounded-none text-xs"
          placeholder="傲娇/欣喜/感动..."
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-orange-400 w-20 text-xs">警惕度：</span>
        <input
          type="number" min={0} max={100}
          value={edit.vigilance}
          onChange={(e) => setEdit({ ...edit, vigilance: Number(e.target.value) })}
          className="w-20 bg-black/60 text-yellow-300 border border-slate-700 px-2 py-0.5 rounded-none text-xs"
        />
        <span className="text-[10px] text-slate-500">0-100</span>
      </div>

      <div className="my-1 border-t border-dashed border-slate-800" />

      <div className="text-[9px] text-purple-500/70 mb-0.5">✦ 里信息</div>

      <div className="flex items-center gap-2">
        <span className="text-amber-400 w-20 text-xs">表好感度：</span>
        <input
          type="number" min={-100} max={100}
          value={edit.surfaceAffinity}
          onChange={(e) => setEdit({ ...edit, surfaceAffinity: Number(e.target.value) })}
          className="w-20 bg-black/60 text-yellow-300 border border-slate-700 px-2 py-0.5 rounded-none text-xs"
        />
        <span className="text-[10px] text-slate-500">-100~100</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-fuchsia-400 w-20 text-xs">里好感度：</span>
        <input
          type="number" min={-100} max={100}
          value={edit.hiddenAffinity}
          onChange={(e) => setEdit({ ...edit, hiddenAffinity: Number(e.target.value) })}
          className="w-20 bg-black/60 text-yellow-300 border border-slate-700 px-2 py-0.5 rounded-none text-xs"
        />
        <span className="text-[10px] text-slate-500">-100~100</span>
      </div>

      <button
        onClick={() => onSave(edit)}
        className="w-full mt-2 bg-amber-600 hover:bg-amber-500 text-white py-1.5 rounded-none text-xs font-bold tracking-widest border-2 border-amber-400"
      >
        ▶ 保存篡改
      </button>
    </div>
  );
}
