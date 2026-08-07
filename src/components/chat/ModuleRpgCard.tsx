import React, { useEffect, useMemo, useState } from 'react';
import type { BodyPartId, BodyStatus, ModuleRpgBodySpecialConfig, ModuleRpgConfig, ModuleRpgData, ModuleRpgSnapshot } from '../../types';
import { DEFAULT_MODULE_RPG_CONFIG, getModuleRpgBodySpecialConfig, mergeModuleRpgSnapshot } from '../../utils/moduleRpg';
import { useApp } from '../../hooks/useApp';
import { BODY_PARTS } from './BodyStatusModule';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import maidOutfitUrl from './ModuleRpgMaidOutfit.svg';
import { isAuthorOutfitUnlocked, subscribeAuthorOutfit, tryUnlockAuthorOutfit } from '../../utils/easterEgg';

interface ModuleRpgCardProps {
  data: ModuleRpgData;
  config?: ModuleRpgConfig;
  onSave?: (next: ModuleRpgData) => void;
  showEasterEggChallenge?: boolean;
}

function enabled(config: ModuleRpgConfig, fieldId: ModuleRpgConfig['fields'][number]['id']): boolean {
  return config.fields.find((field) => field.id === fieldId)?.enabled !== false;
}

/* ---------- 内联实心小图标（Icon 组件没有的 RPG 语义图标） ---------- */

type MiniIconName = 'heart' | 'mood' | 'gem' | 'spark' | 'bag' | 'clock' | 'pin' | 'flag' | 'quest' | 'person' | 'users';

const MINI_ICON_PATHS: Record<MiniIconName, string> = {
  heart: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  mood: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z',
  gem: 'M6 3h12l4 6-10 13L2 9l4-6zm1.76 6L12 17.55 16.24 9H7.76z',
  spark: 'M12 2l2.1 6.9L21 11l-6.9 2.1L12 20l-2.1-6.9L3 11l6.9-2.1L12 2z',
  bag: 'M8 8V6a4 4 0 118 0v2h3l1.2 12.2a1 1 0 01-1 1.1H4.8a1 1 0 01-1-1.1L5 8h3zm2 0h4V6a2 2 0 10-4 0v2z',
  clock: 'M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10zm1-10.41V6h-2v6.41l4.29 4.29 1.42-1.42L13 11.59z',
  pin: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
  flag: 'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z',
  quest: 'M6 2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm8 1.5V8h4.5L14 3.5zM8 12h8v1.5H8V12zm0 4h8v1.5H8V16z',
  person: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  users: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
};

function MiniIcon({ name, size = 12, className = '' }: { name: MiniIconName; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" className={`inline-block shrink-0 ${className}`}>
      <path d={MINI_ICON_PATHS[name]} />
    </svg>
  );
}

/* ---------- 身体图：深色展示窗 + 玉色剪影 + 伤处发光 ---------- */

const BODY_DISPLAY_META: Record<BodyStatus, { label: string; fill: string; stroke: string; glow?: string; dot: string }> = {
  healthy: { label: '健康', fill: '#cbd5e1', stroke: '#94a3b8', dot: 'bg-slate-300' },
  minor: { label: '轻伤', fill: '#22d3ee', stroke: '#a5f3fc', glow: 'rgba(34,211,238,0.75)', dot: 'bg-cyan-400' },
  severe: { label: '重伤', fill: '#fb7185', stroke: '#fecdd3', glow: 'rgba(251,113,133,0.8)', dot: 'bg-rose-400' },
  missing: { label: '缺失', fill: 'rgba(100,116,139,0.25)', stroke: '#64748b', dot: 'bg-slate-500' },
};

function BodyFigure({
  body,
  bodySpecialStates,
  specialConfig,
  characterSlot,
  outfitUnlocked,
  selectedPart,
  onSelectPart,
}: {
  body: Partial<Record<BodyPartId, BodyStatus>>;
  bodySpecialStates: Partial<Record<BodyPartId, string[]>>;
  specialConfig: ModuleRpgBodySpecialConfig;
  characterSlot: 'charA' | 'charB';
  outfitUnlocked: boolean;
  selectedPart: BodyPartId | null;
  onSelectPart: (partId: BodyPartId) => void;
}) {
  const presetById = useMemo(() => new Map(specialConfig.presets.map((preset) => [preset.id, preset])), [specialConfig.presets]);
  return (
    <svg viewBox="0 0 200 365" role="img" aria-label="角色身体状态" className="mx-auto h-44 max-w-full sm:h-52">
      {BODY_PARTS.map((part) => {
        const status = body[part.id] || 'healthy';
        const meta = BODY_DISPLAY_META[status];
        const specialLabels = specialConfig.enabled
          ? (bodySpecialStates[part.id] || []).map((id) => presetById.get(id)).filter((preset) => preset?.characterSlot === characterSlot && preset.bodyPart === part.id).map((preset) => preset?.label).filter(Boolean) as string[]
          : [];
        const hasSpecial = specialLabels.length > 0;
        return (
          <g key={part.id}>
            <path
              d={part.path}
              fill={meta.fill}
              stroke={part.id === selectedPart ? '#f59e0b' : meta.stroke}
              strokeWidth={part.id === selectedPart ? 3 : 2}
              strokeLinejoin="round"
              strokeDasharray={status === 'missing' ? '5 3' : undefined}
              role="button"
              tabIndex={0}
              aria-label={`${part.label}，当前${meta.label}${hasSpecial ? `，特殊状态：${specialLabels.join('、')}` : ''}`}
              onClick={() => onSelectPart(part.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectPart(part.id);
                }
              }}
              style={meta.glow ? { filter: `drop-shadow(0 0 4px ${meta.glow})` } : undefined}
            >
              <title>{`${part.label}: ${meta.label}${hasSpecial ? `；${specialLabels.join('、')}` : ''}`}</title>
            </path>
            {hasSpecial && (
              <path
                d={part.path}
                fill="#f9a8d4"
                fillOpacity="0.42"
                stroke="#ec4899"
                strokeWidth="3"
                strokeLinejoin="round"
                pointerEvents="none"
                aria-hidden="true"
              />
            )}
          </g>
        );
      })}
      {characterSlot === 'charA' && outfitUnlocked && (
        <image
          href={maidOutfitUrl}
          x="-2"
          y="-4"
          width="204"
          height="373"
          preserveAspectRatio="xMidYMid meet"
          transform="translate(0 369) scale(1 1.05) translate(0 -369)"
          pointerEvents="none"
          aria-hidden="true"
        />
      )}
      {selectedPart && (
        <path
          d={BODY_PARTS.find((part) => part.id === selectedPart)?.path}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="3"
          strokeLinejoin="round"
          pointerEvents="none"
          aria-hidden="true"
        />
      )}
    </svg>
  );
}

function BodyPanel({
  body,
  bodySpecialStates,
  config,
  characterSlot,
  outfitUnlocked,
}: {
  body: Partial<Record<BodyPartId, BodyStatus>>;
  bodySpecialStates: Partial<Record<BodyPartId, string[]>>;
  config: ModuleRpgConfig;
  characterSlot: 'charA' | 'charB';
  outfitUnlocked: boolean;
}) {
  const [selectedPart, setSelectedPart] = useState<BodyPartId | null>(null);
  const specialConfig = getModuleRpgBodySpecialConfig(config);
  const presetById = useMemo(() => new Map(specialConfig.presets.map((preset) => [preset.id, preset])), [specialConfig.presets]);
  const usedStatuses = useMemo(() => {
    const set = new Set<BodyStatus>();
    BODY_PARTS.forEach((part) => set.add(body[part.id] || 'healthy'));
    return (Object.keys(BODY_DISPLAY_META) as BodyStatus[]).filter((status) => set.has(status));
  }, [body]);
  const selectedStates = selectedPart && specialConfig.enabled
    ? (bodySpecialStates[selectedPart] || []).map((id) => presetById.get(id)).filter((preset) => preset?.characterSlot === characterSlot && preset.bodyPart === selectedPart)
    : [];
  const specialCount = specialConfig.enabled
    ? Object.entries(bodySpecialStates).reduce((total, [part, states]) => total + (states?.filter((id) => {
      const preset = presetById.get(id);
      return preset?.characterSlot === characterSlot && preset.bodyPart === part;
    }).length || 0), 0)
    : 0;
  return (
    <div className="relative self-start overflow-hidden rounded-xl border border-slate-700/80 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 px-1 pb-1.5 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
      <span className="absolute left-1.5 top-1.5 rounded bg-white/10 px-1.5 py-px text-[8px] font-bold tracking-[0.25em] text-slate-300 ring-1 ring-white/10">体魄</span>
      <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400/90 shadow-[0_0_5px_rgba(52,211,153,0.9)]" />
      <BodyFigure
        body={body}
        bodySpecialStates={bodySpecialStates}
        specialConfig={specialConfig}
        characterSlot={characterSlot}
        outfitUnlocked={outfitUnlocked}
        selectedPart={selectedPart}
        onSelectPart={setSelectedPart}
      />
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
        {usedStatuses.map((status) => (
          <span key={status} className="flex items-center gap-1 text-[8px] font-medium text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${BODY_DISPLAY_META[status].dot}`} />
            {BODY_DISPLAY_META[status].label}
          </span>
        ))}
        {specialCount > 0 && <span className="flex items-center gap-1 text-[8px] font-medium text-pink-300"><span className="h-1.5 w-1.5 rounded-full bg-pink-400" />特殊</span>}
      </div>
      {specialConfig.enabled && selectedPart && (
        <div className="mx-1 mt-2 rounded-lg border border-pink-400/70 bg-pink-950/35 px-2 py-1.5 text-[9px] leading-relaxed text-pink-100" aria-live="polite">
          <div className="font-bold text-pink-200">{BODY_PARTS.find((part) => part.id === selectedPart)?.label || '部位'} · 特殊状态</div>
          {selectedStates.length > 0 ? selectedStates.map((preset) => preset && (
            <div key={preset.id} className="mt-1"><span className="font-semibold text-pink-200">{preset.label}：</span>{preset.displayText}</div>
          )) : <div className="mt-1 text-pink-200/70">此部位暂无特殊状态。</div>}
        </div>
      )}
    </div>
  );
}

/* ---------- 数值卡：左色条 + 图标 + 大数字 + 角落水印 ---------- */

type StatTone = 'rose' | 'cyan' | 'amber';

const STAT_TONE_STYLES: Record<StatTone, { box: string; icon: string; label: string; watermark: string }> = {
  rose: {
    box: 'border-rose-200/90 border-l-rose-400 bg-gradient-to-br from-rose-50 to-rose-100/60 dark:border-rose-900/50 dark:border-l-rose-500 dark:from-rose-950/40 dark:to-rose-900/10',
    icon: 'text-rose-500 dark:text-rose-400',
    label: 'text-rose-600/90 dark:text-rose-300/90',
    watermark: 'text-rose-400 dark:text-rose-300',
  },
  cyan: {
    box: 'border-cyan-200/90 border-l-cyan-400 bg-gradient-to-br from-cyan-50 to-cyan-100/60 dark:border-cyan-900/50 dark:border-l-cyan-500 dark:from-cyan-950/40 dark:to-cyan-900/10',
    icon: 'text-cyan-600 dark:text-cyan-400',
    label: 'text-cyan-700/90 dark:text-cyan-300/90',
    watermark: 'text-cyan-400 dark:text-cyan-300',
  },
  amber: {
    box: 'border-amber-200/90 border-l-amber-400 bg-gradient-to-br from-amber-50 to-amber-100/60 dark:border-amber-900/50 dark:border-l-amber-500 dark:from-amber-950/40 dark:to-amber-900/10',
    icon: 'text-amber-600 dark:text-amber-400',
    label: 'text-amber-700/90 dark:text-amber-300/90',
    watermark: 'text-amber-400 dark:text-amber-300',
  },
};

const STAT_TONE_ICONS: Record<StatTone, MiniIconName> = { rose: 'heart', cyan: 'mood', amber: 'gem' };

function StatTile({ label, value, tone }: { label: string; value: string; tone: StatTone }) {
  const styles = STAT_TONE_STYLES[tone];
  const icon = STAT_TONE_ICONS[tone];
  return (
    <div className={`relative min-w-0 overflow-hidden rounded-lg border border-l-[3px] px-2 py-1.5 shadow-sm ${styles.box}`}>
      <MiniIcon name={icon} size={28} className={`pointer-events-none absolute -right-1.5 -top-1.5 opacity-[0.12] ${styles.watermark}`} />
      <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${styles.label}`}>
        <MiniIcon name={icon} size={10} className={styles.icon} />
        {label}
      </div>
      <div className="mt-0.5 break-words text-xs font-bold leading-snug text-slate-800 dark:text-slate-100">{value}</div>
    </div>
  );
}

/* ---------- 分区小标题：图标 + 大写标签 + 渐隐装饰线 ---------- */

function SectionTitle({ icon, label }: { icon: MiniIconName; label: string }) {
  return (
    <div className="mt-2.5 flex items-center gap-1.5 border-t border-slate-200/80 pt-2 dark:border-slate-700/60">
      <MiniIcon name={icon} size={11} className="text-amber-600 dark:text-amber-400" />
      <span className="text-[10px] font-bold tracking-[0.2em] text-slate-500 dark:text-slate-400">{label}</span>
      <span className="h-px min-w-4 flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-700" />
    </div>
  );
}

/* ---------- 角色面板 ---------- */

function CharacterBlock({ character, config, outfitUnlocked }: { character: ModuleRpgSnapshot['characters'][number]; config: ModuleRpgConfig; outfitUnlocked: boolean }) {
  const showBody = enabled(config, 'character.body');
  const stats = [
    enabled(config, 'character.health') && character.health && { label: '生命', value: character.health, tone: 'rose' as const },
    enabled(config, 'character.mood') && character.mood && { label: '心情', value: character.mood, tone: 'cyan' as const },
    enabled(config, 'character.currency') && character.currency.value && { label: character.currency.label || '货币', value: character.currency.value, tone: 'amber' as const },
  ].filter(Boolean) as Array<{ label: string; value: string; tone: StatTone }>;
  return (
    <div className={`min-w-0 border-t border-slate-200/80 py-3 first:border-t-0 dark:border-slate-700/60 ${showBody ? 'grid grid-cols-[7.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[9.25rem_minmax(0,1fr)]' : ''}`}>
      {showBody && <BodyPanel body={character.body} bodySpecialStates={character.bodySpecialStates || {}} config={config} characterSlot={character.id} outfitUnlocked={outfitUnlocked} />}
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="h-5 w-1 shrink-0 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
          <h4 className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{character.name}</h4>
          <span className="h-px min-w-4 flex-1 bg-gradient-to-r from-slate-300/80 to-transparent dark:from-slate-600/60" />
        </div>
        {stats.length > 0 && <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">{stats.map((stat) => <StatTile key={stat.label} {...stat} />)}</div>}
        {enabled(config, 'character.buffs') && character.buffs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-[10px] font-bold text-cyan-700 dark:text-cyan-300">
              <MiniIcon name="spark" size={11} />
              状态
            </span>
            {character.buffs.map((buff) => (
              <span key={buff} className="inline-flex items-center gap-1 rounded-full border border-cyan-300/70 bg-gradient-to-b from-cyan-50 to-cyan-100/60 px-2 py-0.5 text-[10px] font-medium text-cyan-800 shadow-sm dark:border-cyan-700/60 dark:from-cyan-950/50 dark:to-cyan-900/20 dark:text-cyan-200">
                <span className="h-1 w-1 rounded-full bg-cyan-500 shadow-[0_0_3px_rgba(6,182,212,0.9)]" />
                {buff}
              </span>
            ))}
          </div>
        )}
        {enabled(config, 'character.inventory') && character.inventory.length > 0 && (
          <div className="relative mt-4 rounded-xl border-2 border-amber-300/80 bg-gradient-to-b from-amber-50/90 to-amber-100/50 px-2.5 pb-2 pt-2.5 shadow-sm dark:border-amber-700/60 dark:from-amber-950/25 dark:to-amber-900/10">
            <div className="absolute -top-2.5 left-1/2 h-3 w-12 -translate-x-1/2 rounded-t-lg border-2 border-b-0 border-amber-300/80 bg-amber-100 dark:border-amber-700/60 dark:bg-amber-900/40" />
            <div className="flex items-center gap-1 text-[10px] font-bold text-amber-800 dark:text-amber-200">
              <MiniIcon name="bag" size={11} />
              随身背包
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {character.inventory.map((item) => (
                <span key={item} className="inline-flex items-center gap-1 rounded-md border border-amber-200/90 bg-white px-1.5 py-1 text-[10px] font-medium text-amber-950 shadow-sm dark:border-amber-800/70 dark:bg-slate-900 dark:text-amber-100">
                  <span className="h-1 w-1 rotate-45 rounded-[1px] bg-amber-500" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
        {enabled(config, 'character.relationships') && (character.relationshipToUser || character.relationships.length > 0) && (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {character.relationshipToUser && (
              <div className="flex items-center gap-1.5 rounded-lg border border-rose-200/80 bg-gradient-to-br from-rose-50 to-rose-100/40 px-2 py-1.5 text-[10px] text-rose-800 shadow-sm dark:border-rose-900/50 dark:from-rose-950/30 dark:to-rose-900/10 dark:text-rose-200">
                <MiniIcon name="heart" size={11} className="shrink-0 text-rose-500 dark:text-rose-400" />
                <span className="min-w-0"><span className="font-bold">对主角</span><span className="mx-1 text-rose-300 dark:text-rose-600">|</span>{character.relationshipToUser}</span>
              </div>
            )}
            {character.relationships.length > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border border-violet-200/80 bg-gradient-to-br from-violet-50 to-violet-100/40 px-2 py-1.5 text-[10px] text-violet-800 shadow-sm dark:border-violet-900/50 dark:from-violet-950/30 dark:to-violet-900/10 dark:text-violet-200">
                <MiniIcon name="users" size={11} className="shrink-0 text-violet-500 dark:text-violet-400" />
                <span className="min-w-0"><span className="font-bold">人物关系</span><span className="mx-1 text-violet-300 dark:text-violet-600">|</span>{character.relationships.map((item) => `${item.target} ${item.value}`).join('；')}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 世界横幅：深色石板 + 光晕 + 金印章 ---------- */

function WorldBanner({ date, location, faction }: { date: string; location: string; faction: string }) {
  return (
    <div className="relative mb-2.5 overflow-hidden rounded-xl border border-slate-700/60 bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 p-2.5 shadow-md dark:border-slate-600/50">
      <div className="relative grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <div className="flex items-center gap-1.5 self-start rounded-lg bg-white/10 px-2 py-1.5 ring-1 ring-white/15 sm:self-auto">
          <MiniIcon name="clock" size={11} className="text-amber-300" />
          <span className="text-[10px] font-bold text-amber-200">{date || '时间未知'}</span>
        </div>
        <div className="min-w-0 px-0.5">
          <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.18em] text-amber-400/90">
            <MiniIcon name="pin" size={9} />
            当前地点
          </div>
          <div className="truncate text-sm font-bold text-white">{location || '地点未知'}</div>
        </div>
        <div className="flex items-center gap-1 self-start rounded-md bg-gradient-to-br from-amber-300 to-amber-500 px-2 py-1 shadow dark:from-amber-400 dark:to-amber-600 sm:self-auto">
          <MiniIcon name="flag" size={10} className="text-slate-900" />
          <span className="text-[10px] font-bold text-slate-900">{faction || '无所属势力'}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- 主卡片 ---------- */

export default function ModuleRpgCard({ data, config, onSave, showEasterEggChallenge = false }: ModuleRpgCardProps) {
  const app = useApp();
  const activeConfig = config || app?.state?.moduleRpgConfig || DEFAULT_MODULE_RPG_CONFIG;
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [outfitUnlocked, setOutfitUnlocked] = useState(isAuthorOutfitUnlocked);
  const [authorAnswer, setAuthorAnswer] = useState('');
  const [authorError, setAuthorError] = useState('');
  const snapshot = data.snapshot;
  const visibleWorld = {
    date: enabled(activeConfig, 'world.date') ? snapshot.world.date : '',
    location: enabled(activeConfig, 'world.location') ? snapshot.world.location : '',
    faction: enabled(activeConfig, 'world.faction') ? snapshot.world.faction : '',
  };
  const title = [visibleWorld.date, visibleWorld.location, visibleWorld.faction].filter(Boolean).join(' · ') || '当前状态';
  const hasContent = snapshot.characters.length > 0 || (enabled(activeConfig, 'note') && snapshot.note) || (enabled(activeConfig, 'events') && snapshot.events.length > 0) || (enabled(activeConfig, 'supportingCharacters') && snapshot.supportingCharacters.length > 0);
  const diagnostics = useMemo(() => data.diagnostics?.filter(Boolean) || [], [data.diagnostics]);

  useEffect(() => subscribeAuthorOutfit(() => setOutfitUnlocked(true)), []);

  const confirmAuthorAnswer = () => {
    if (!tryUnlockAuthorOutfit(authorAnswer)) {
      setAuthorError('答案不对，再想想作者的名字。');
      return;
    }
    setOutfitUnlocked(true);
    setAuthorAnswer('');
    setAuthorError('');
  };

  const startEdit = () => {
    setDraft(JSON.stringify(snapshot, null, 2));
    setError('');
    setEditing(true);
  };
  const saveEdit = () => {
    try {
      const parsed = JSON.parse(draft);
      const merged = mergeModuleRpgSnapshot(parsed, snapshot, activeConfig);
      onSave?.({ ...data, snapshot: merged.snapshot, source: 'module', diagnostics: merged.diagnostics, editedAt: Date.now() });
      setEditing(false);
    } catch {
      setError('JSON 格式无效，未保存，原状态保持不变。');
    }
  };

  return (
    <div className="border-t-2 border-dashed border-amber-300/70 bg-gradient-to-b from-amber-50/60 via-slate-50/80 to-slate-100/50 dark:border-amber-700/40 dark:from-amber-950/15 dark:via-slate-950/35 dark:to-slate-900/20">
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-expanded={open}>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm">
            <Icon name="state" size={12} />
          </span>
          <span className="truncate text-[11px] font-bold text-slate-900 dark:text-slate-100">模块化 Gal/RPG</span>
          <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">{title}</span>
          <Icon name="chevron" size={13} className={`ml-auto shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {onSave && <button type="button" onClick={startEdit} title="编辑模块字段" className="shrink-0 rounded p-1 text-slate-500 hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-500/20 dark:hover:text-amber-300"><Icon name="edit" size={13} /></button>}
      </div>
      {open && <div className="px-3 pb-3 text-xs">
        {!hasContent && <p className="py-2 text-slate-500">书记尚未写入可显示字段。</p>}
        {(visibleWorld.date || visibleWorld.location || visibleWorld.faction) && <WorldBanner {...visibleWorld} />}
        {snapshot.characters.map((character) => <CharacterBlock key={character.id} character={character} config={activeConfig} outfitUnlocked={outfitUnlocked} />)}
        {enabled(activeConfig, 'events') && snapshot.events.length > 0 && (
          <>
            <SectionTitle icon="quest" label="事件" />
            {snapshot.events.map((event) => (
              <div key={`${event.title}-${event.status}`} className="mt-1.5 flex items-start gap-2 rounded-lg border border-slate-200/90 bg-white/85 px-2.5 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${event.status?.includes('进行中') ? 'animate-pulse bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)]' : 'bg-slate-400 dark:bg-slate-500'}`} />
                <div className="min-w-0 text-[10px] leading-relaxed">
                  <span className="font-bold text-slate-800 dark:text-slate-100">{event.title}</span>
                  {event.status && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-px font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{event.status}</span>}
                  {event.detail && <span className="ml-1.5 text-slate-500 dark:text-slate-400">{event.detail}</span>}
                </div>
              </div>
            ))}
          </>
        )}
        {enabled(activeConfig, 'supportingCharacters') && snapshot.supportingCharacters.length > 0 && (
          <>
            <SectionTitle icon="person" label="配角" />
            {snapshot.supportingCharacters.map((person) => (
              <div key={person.name} className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-slate-200/90 bg-white/85 px-2.5 py-2 text-[10px] shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                <span className="flex items-center gap-1 font-bold text-slate-800 dark:text-slate-100">
                  <MiniIcon name="person" size={11} className="text-slate-400" />
                  {person.name}
                </span>
                {person.role && <span className="rounded-full bg-cyan-100 px-1.5 py-px font-medium text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">{person.role}</span>}
                {person.location && <span className="flex items-center gap-0.5 text-slate-500 dark:text-slate-400"><MiniIcon name="pin" size={9} />{person.location}</span>}
                {person.attitude && <span className="rounded-full bg-rose-100 px-1.5 py-px font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{person.attitude}</span>}
              </div>
            ))}
          </>
        )}
        {enabled(activeConfig, 'note') && snapshot.note && (
          <p className="mt-2.5 border-l-2 border-amber-300 pl-2 text-[10px] italic leading-relaxed text-slate-500 dark:border-amber-700 dark:text-slate-400">{snapshot.note}</p>
        )}
        {showEasterEggChallenge && (
          <div className="mt-3 rounded-lg border border-dashed border-amber-300/80 bg-amber-50/70 p-2.5 dark:border-amber-700/60 dark:bg-amber-950/20">
            {outfitUnlocked ? (
              <p className="text-[10px] font-medium text-amber-800 dark:text-amber-200">彩蛋已解锁：角色 A 获得作者设计的 SVG 装扮。</p>
            ) : (
              <>
                <label htmlFor="module-rpg-author-answer" className="text-[10px] font-semibold text-slate-800 dark:text-slate-100">彩蛋问题：作者是？</label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="module-rpg-author-answer"
                    value={authorAnswer}
                    onChange={(event) => {
                      setAuthorAnswer(event.target.value);
                      if (authorError) setAuthorError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        confirmAuthorAnswer();
                      }
                    }}
                    maxLength={24}
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    aria-describedby={authorError ? 'module-rpg-author-error' : undefined}
                  />
                  <button type="button" onClick={confirmAuthorAnswer} className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400">确认</button>
                </div>
                {authorError && <p id="module-rpg-author-error" className="mt-1.5 text-[10px] text-red-600 dark:text-red-300">{authorError}</p>}
              </>
            )}
          </div>
        )}
        {diagnostics.map((message) => <p key={message} className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">{message}</p>)}
      </div>}
      <Modal open={editing} onClose={() => setEditing(false)} title="编辑模块化 Gal/RPG 字段">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={18} className="w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p>}
        <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">取消</button><button type="button" onClick={saveEdit} className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400">保存合法字段</button></div>
      </Modal>
    </div>
  );
}
