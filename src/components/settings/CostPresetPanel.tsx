import React from 'react';
import { useApp } from '../../hooks/useApp';

type CostPreset = 'low' | 'medium' | 'high';

export default function CostPresetPanel() {
  const { state, dispatch } = useApp();

  const isLowPreset =
    state.contextConfig.recentRounds === 5 &&
    state.distillationConfig.autoTrigger === false &&
    state.distillationConfig.triggerThreshold === 12 &&
    state.distillationConfig.retainRecentCount === 1 &&
    state.scribeEnabled === false &&
    state.contextConfig.worldBookScanDepth === 3 &&
    state.contextConfig.maxWorldBookEntries === 3;
  const isMediumPreset =
    state.contextConfig.recentRounds === 12 &&
    state.distillationConfig.autoTrigger === true &&
    state.distillationConfig.triggerThreshold === 10 &&
    state.distillationConfig.retainRecentCount === 3 &&
    state.contextConfig.worldBookScanDepth === 3 &&
    state.contextConfig.maxWorldBookEntries === 4;
  const isHighPreset =
    state.contextConfig.recentRounds === 20 &&
    state.distillationConfig.autoTrigger === true &&
    state.distillationConfig.triggerThreshold === 10 &&
    state.distillationConfig.retainRecentCount === 3 &&
    state.contextConfig.worldBookScanDepth === 3 &&
    state.contextConfig.maxWorldBookEntries === 8;
  const activePreset: CostPreset | null = isLowPreset
    ? 'low'
    : isMediumPreset
      ? 'medium'
      : isHighPreset
        ? 'high'
        : null;

  const applyCostPreset = (preset: CostPreset) => {
    const config = preset === 'low'
      ? {
          recentRounds: 5,
          worldBookScanDepth: 3,
          maxWorldBookEntries: 3,
          autoTrigger: false,
          triggerThreshold: 12,
          retainRecentCount: 1,
        }
      : preset === 'medium'
        ? {
            recentRounds: 12,
            worldBookScanDepth: 3,
            maxWorldBookEntries: 4,
            autoTrigger: true,
            triggerThreshold: 10,
            retainRecentCount: 3,
          }
        : {
            recentRounds: 20,
            worldBookScanDepth: 3,
            maxWorldBookEntries: 8,
            autoTrigger: true,
            triggerThreshold: 10,
            retainRecentCount: 3,
          };

    dispatch({
      type: 'UPDATE_CONTEXT_CONFIG',
      config: {
        recentRounds: config.recentRounds,
        worldBookScanDepth: config.worldBookScanDepth,
        maxWorldBookEntries: config.maxWorldBookEntries,
      },
    });
    dispatch({
      type: 'UPDATE_DISTILLATION_CONFIG',
      config: {
        autoTrigger: config.autoTrigger,
        triggerThreshold: config.triggerThreshold,
        retainRecentCount: config.retainRecentCount,
      },
    });

    if (preset === 'low') {
      dispatch({ type: 'SET_SCRIBE_ENABLED', enabled: false });
      dispatch({ type: 'SET_SCRIBE_CACHE_WORLDBOOK_ENABLED', enabled: false });
    }
  };

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 space-y-3 border border-amber-700/30">
      <div>
        <h3 className="text-sm font-semibold text-amber-400">🎚️ 预设挡位（新手）</h3>
        <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed mt-1">
          不太懂详细参数时，直接选择一个挡位即可。挡位只调整上下文、蒸馏和世界书开支；中、高耗挡位保留你当前的状态书开关。
        </p>
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="API 消耗挡位">
        {([
          ['low', '低耗', '更低 API 消耗，记忆较简单，轻松玩'],
          ['medium', '中耗', '上下文与自动蒸馏均衡'],
          ['high', '高耗', '上下文更长，世界书覆盖更高'],
        ] as const).map(([preset, label, description]) => (
          <button
            key={preset}
            type="button"
            aria-pressed={activePreset === preset}
            onClick={() => applyCostPreset(preset)}
            className={`min-h-[58px] rounded-md border px-2 py-1.5 text-left transition-colors ${
              activePreset === preset
                ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                : 'border-slate-700 bg-slate-900/40 text-slate-700 dark:text-slate-300 hover:border-amber-500/60'
            }`}
          >
            <span className="block text-xs font-semibold">{label}</span>
            <span className="mt-0.5 block text-[9px] leading-tight opacity-80">{description}</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-slate-700 dark:text-slate-300 leading-relaxed">
        低耗：上下文 5、自动蒸馏关闭、蒸馏阈值 12、滑动窗口 1、状态书关闭、世界书深度 3/最多 3 条。中耗：上下文 12、自动蒸馏 10 轮、滑动窗口 3、世界书深度 3/最多 4 条。高耗：在中耗基础上，上下文 20、世界书深度 3/最多 8 条。当前世界书按扫描深度匹配，不再使用轮次冷却。
      </p>
    </div>
  );
}
