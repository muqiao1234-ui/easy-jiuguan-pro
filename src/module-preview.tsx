import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import ModuleRpgCard from './components/chat/ModuleRpgCard';
import Toggle from './components/ui/Toggle';
import { DEFAULT_MODULE_RPG_CONFIG } from './utils/moduleRpg';
import type { ModuleRpgSnapshot } from './types';

const snapshot: ModuleRpgSnapshot = {
  schemaVersion: 1,
  revision: 1,
  world: { date: '第 12 天 · 傍晚', location: '云岚城 · 客栈前厅', faction: '青岚剑宗' },
  characters: [
    {
      id: 'charA',
      name: '李道劫',
      body: { leftForearm: 'minor', rightCalf: 'severe' },
      bodySpecialStates: { head: ['poison'], torso: ['gu_pain', 'fire_pill_warmth'] },
      health: '轻伤，行动正常',
      mood: '警惕而安心',
      buffs: ['灵力护体', '夜行增益'],
      currency: { label: '灵石', value: '86' },
      inventory: ['疗伤丹', '城镇地图', '灵木令牌'],
      relationshipToUser: '信赖，愿意同行',
      relationships: [{ target: '客栈掌柜', value: '初次见面' }],
    },
    {
      id: 'charB',
      name: '天意说书人',
      body: { rightHand: 'minor' },
      bodySpecialStates: {},
      health: '轻伤，行动正常',
      mood: '好奇，略显紧张',
      buffs: ['灵力护体', '夜行增益'],
      currency: { label: '灵石', value: '14' },
      inventory: ['疗伤丹', '城镇地图', '灵木令牌'],
      relationshipToUser: '信赖，愿意同行',
      relationships: [{ target: '客栈掌柜', value: '初次见面' }],
    },
  ],
  events: [{ title: '夜探旧城', status: '进行中', detail: '等待城门守卫换班' }],
  supportingCharacters: [{ name: '沈掌柜', role: '客栈掌柜', location: '前厅柜台', attitude: '谨慎友善' }],
  note: '此处展示的是最终气泡的示例排版；真实对话会替换为书记 AI 的合法状态数据。',
};

const previewConfig = {
  ...DEFAULT_MODULE_RPG_CONFIG,
  bodySpecialStates: {
    ...DEFAULT_MODULE_RPG_CONFIG.bodySpecialStates!,
    enabled: true,
  },
};

function SlotCard({ index, name, enabledSlot, placeholder }: { index: number; name: string; enabledSlot: boolean; placeholder: string }) {
  return (
    <div className={`space-y-2 rounded-lg border p-2.5 transition-colors ${enabledSlot ? 'border-amber-300/80 bg-amber-50/50 shadow-sm dark:border-amber-700/50 dark:bg-amber-950/15' : 'border-slate-200 dark:border-slate-700'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold ${enabledSlot ? 'text-amber-800 dark:text-amber-200' : 'text-slate-800 dark:text-slate-100'}`}>角色面板 {index + 1}</span>
        <Toggle checked={enabledSlot} onChange={() => undefined} label={enabledSlot ? '维护' : '关闭'} />
      </div>
      <input
        value={name}
        readOnly
        placeholder={placeholder}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
      />
    </div>
  );
}

function PreviewSection({ dark }: { dark?: boolean }) {
  return (
    <div className={dark ? 'dark' : ''}>
      <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-950">
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/35">
          <div>
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">组装预览{dark ? '（暗色）' : '（亮色）'}</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">最多启用两块角色面板。名称会写入书记 AI 的匹配规则，用来定位应更新的 JSON 角色栏。</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <SlotCard index={0} name="李道劫" enabledSlot placeholder="填写角色名，例如：李道劫" />
            <SlotCard index={1} name="天意说书人" enabledSlot placeholder="填写第二角色名，例如：柳条条" />
          </div>
          <div className="overflow-hidden rounded-xl border border-amber-300/60 shadow-md dark:border-amber-800/40">
            <ModuleRpgCard data={{ snapshot, source: 'module' }} config={previewConfig} />
          </div>
        </section>
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="min-h-screen space-y-6 bg-slate-200 p-6">
      <h1 className="text-lg font-bold text-slate-800">模块化 Gal/RPG · 新 UI 预览</h1>
      <div className="mx-auto max-w-[860px] space-y-6">
        <PreviewSection />
        <PreviewSection dark />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
