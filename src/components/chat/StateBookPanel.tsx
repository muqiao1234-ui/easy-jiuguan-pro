import React, { useCallback, useEffect, useState } from 'react';
import type { BodyPartId, ModelConfig, ModuleRpgBodySpecialPreset, ModuleRpgConfig, ModuleRpgSnapshot } from '../../types';
import { useApp } from '../../hooks/useApp';
import { useGlobalStates, type ScribeConfig } from '../../hooks/useGlobalStates';
import { buildSamplingParams } from '../../utils/constants';
import {
  applyModuleRpgCharacterSlots,
  buildModuleRpgPrompt,
  createModuleRpgSnapshot,
  findLatestModuleRpgData,
  getModuleRpgBodySpecialConfig,
  getModuleRpgCharacterSlots,
  mergeModuleRpgSnapshot,
  parseModuleRpgResponse,
} from '../../utils/moduleRpg';
import Button from '../ui/Button';
import Toggle from '../ui/Toggle';
import Dropdown from '../ui/Dropdown';
import Icon from '../ui/Icon';
import { apiFetch } from '../../utils/apiFetch';
import { stripReasoningBlocks } from '../../utils/responseText';
import MvuPanel from './MvuPanel';
import ModuleRpgCard from './ModuleRpgCard';
import { BODY_PARTS } from './BodyStatusModule';
import * as Stores from '../../db/stores';

interface StateBookPanelProps {
  conversationId: string | null;
  conversationTitle: string;
  models: ModelConfig[];
  onScribeConfigChange: (conversationId: string, config: Partial<ScribeConfig>) => void;
  onNodesRefresh?: (conversationId: string) => void;
}

function buildAssemblyPreview(snapshot: ModuleRpgSnapshot, config: ModuleRpgConfig): ModuleRpgSnapshot {
  const show = (fieldId: ModuleRpgConfig['fields'][number]['id']) => config.fields.find((field) => field.id === fieldId)?.enabled !== false;
  const bodySpecialConfig = getModuleRpgBodySpecialConfig(config);
  const previewSpecialIds = bodySpecialConfig.presets.slice(0, 3).map((preset) => preset.id);
  return {
    ...snapshot,
    world: {
      date: show('world.date') ? '第 12 天 · 傍晚' : '',
      location: show('world.location') ? '云岚城 · 客栈前厅' : '',
      faction: show('world.faction') ? '青岚剑宗' : '',
    },
    characters: snapshot.characters.map((character, index) => ({
      ...character,
      body: show('character.body') ? (index === 0 ? { leftForearm: 'minor', rightCalf: 'severe' } : { rightHand: 'minor' }) : {},
      bodySpecialStates: show('character.body') && bodySpecialConfig.enabled && previewSpecialIds.length > 0
        ? (index === 0 ? { head: previewSpecialIds.slice(0, 1), torso: previewSpecialIds.slice(1, 3) } : {})
        : {},
      health: show('character.health') ? '轻伤，行动正常' : '',
      mood: show('character.mood') ? (index === 0 ? '警惕而安心' : '好奇，略显紧张') : '',
      buffs: show('character.buffs') ? ['灵力护体', '夜行增益'] : [],
      currency: show('character.currency') ? { label: '灵石', value: index === 0 ? '86' : '14' } : { label: '', value: '' },
      inventory: show('character.inventory') ? ['疗伤丹', '城镇地图', '灵木令牌'] : [],
      relationshipToUser: show('character.relationships') ? '信赖，愿意同行' : '',
      relationships: show('character.relationships') ? [{ target: '客栈掌柜', value: '初次见面' }] : [],
    })),
    events: show('events') ? [{ title: '夜探旧城', status: '进行中', detail: '等待城门守卫换班' }] : [],
    supportingCharacters: show('supportingCharacters') ? [{ name: '沈掌柜', role: '客栈掌柜', location: '前厅柜台', attitude: '谨慎友善' }] : [],
    note: show('note') ? '此处展示的是最终气泡的示例排版；真实对话会替换为书记 AI 的合法状态数据。' : '',
  };
}

export default function StateBookPanel({
  conversationId,
  conversationTitle,
  models,
  onScribeConfigChange,
  onNodesRefresh,
}: StateBookPanelProps) {
  const { state, dispatch } = useApp();
  const { scribeConfig, loadScribeContent, updateScribeConfig } = useGlobalStates();
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<'module' | 'mvu'>('module');
  const [promptDraft, setPromptDraft] = useState(state.moduleRpgPrompt);
  const [previewSnapshot, setPreviewSnapshot] = useState<ModuleRpgSnapshot | null>(null);

  useEffect(() => {
    if (conversationId) void loadScribeContent(conversationId);
  }, [conversationId, loadScribeContent]);

  useEffect(() => {
    setPromptDraft(state.moduleRpgPrompt);
  }, [state.moduleRpgPrompt]);

  const updateConversationConfig = useCallback((config: Partial<ScribeConfig>) => {
    if (!conversationId) return;
    void updateScribeConfig(conversationId, config);
    onScribeConfigChange(conversationId, config);
  }, [conversationId, onScribeConfigChange, updateScribeConfig]);

  const saveModulePrompt = useCallback(() => {
    dispatch({ type: 'SET_MODULE_RPG_PROMPT', prompt: promptDraft });
  }, [dispatch, promptDraft]);

  const updateField = useCallback((fieldId: string, patch: Partial<ModuleRpgConfig['fields'][number]>) => {
    const config: ModuleRpgConfig = {
      ...state.moduleRpgConfig,
      fields: state.moduleRpgConfig.fields.map((field) => field.id === fieldId ? { ...field, ...patch } : field),
    };
    dispatch({ type: 'SET_MODULE_RPG_CONFIG', config });
  }, [dispatch, state.moduleRpgConfig]);

  const updateCharacterSlot = useCallback((slotId: 'charA' | 'charB', patch: Partial<NonNullable<ModuleRpgConfig['characterSlots']>[number]>) => {
    const config: ModuleRpgConfig = {
      ...state.moduleRpgConfig,
      characterSlots: getModuleRpgCharacterSlots(state.moduleRpgConfig).map((slot) => slot.id === slotId ? { ...slot, ...patch } : slot),
    };
    dispatch({ type: 'SET_MODULE_RPG_CONFIG', config });
  }, [dispatch, state.moduleRpgConfig]);

  const updateBodySpecialConfig = useCallback((patch: Partial<NonNullable<ModuleRpgConfig['bodySpecialStates']>>) => {
    const current = getModuleRpgBodySpecialConfig(state.moduleRpgConfig);
    dispatch({
      type: 'SET_MODULE_RPG_CONFIG',
      config: { ...state.moduleRpgConfig, bodySpecialStates: { ...current, ...patch } },
    });
  }, [dispatch, state.moduleRpgConfig]);

  const updateBodySpecialPreset = useCallback((presetId: string, patch: Partial<ModuleRpgBodySpecialPreset>) => {
    const current = getModuleRpgBodySpecialConfig(state.moduleRpgConfig);
    updateBodySpecialConfig({ presets: current.presets.map((preset) => preset.id === presetId ? { ...preset, ...patch } : preset) });
  }, [state.moduleRpgConfig, updateBodySpecialConfig]);

  const addBodySpecialPreset = useCallback(() => {
    const current = getModuleRpgBodySpecialConfig(state.moduleRpgConfig);
    const id = `special_${Date.now().toString(36)}`;
    updateBodySpecialConfig({
      presets: [...current.presets, {
        id,
        characterSlot: 'charA',
        bodyPart: 'head',
        label: '新特殊状态',
        description: '填写 AI 何时可以调用此状态。',
        displayText: '填写点击部位后展示给玩家的说明。',
      }],
    });
  }, [state.moduleRpgConfig, updateBodySpecialConfig]);

  const removeBodySpecialPreset = useCallback((presetId: string) => {
    const current = getModuleRpgBodySpecialConfig(state.moduleRpgConfig);
    updateBodySpecialConfig({ presets: current.presets.filter((preset) => preset.id !== presetId) });
  }, [state.moduleRpgConfig, updateBodySpecialConfig]);

  const refreshPreview = useCallback(async () => {
    if (!conversationId) return;
    const conversation = await Stores.getConversationById(conversationId);
    if (!conversation) return;
    const [characterA, characterB, nodes] = await Promise.all([
      Stores.getCharacterById(conversation.characterAId),
      Stores.getCharacterById(conversation.characterBId),
      Stores.getMessageNodesByConversation(conversationId),
    ]);
    const latest = findLatestModuleRpgData(nodes)?.snapshot
      || createModuleRpgSnapshot(characterA, characterB, state.moduleRpgConfig);
    setPreviewSnapshot(applyModuleRpgCharacterSlots(latest, characterA, characterB, state.moduleRpgConfig));
  }, [conversationId, state.moduleRpgConfig]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

  const handleManualTrigger = useCallback(async () => {
    if (!conversationId || !scribeConfig.scribeModelId || isUpdating) return;
    setIsUpdating(true);
    try {
      const [model, conversation, allNodes] = await Promise.all([
        Stores.getModelById(scribeConfig.scribeModelId),
        Stores.getConversationById(conversationId),
        Stores.getMessageNodesByConversation(conversationId),
      ]);
      if (!model || !conversation) return;

      const [characterA, characterB] = await Promise.all([
        Stores.getCharacterById(conversation.characterAId),
        Stores.getCharacterById(conversation.characterBId),
      ]);
      const sorted = [...allNodes].sort((a, b) => a.timestamp - b.timestamp);
      const latestAssistant = [...sorted].reverse().find((node) =>
        (node.role === 'charA' || node.role === 'charB') && !node.isArchived
      );
      if (!latestAssistant) return;

      const previousBase = findLatestModuleRpgData(sorted)?.snapshot
        || createModuleRpgSnapshot(characterA, characterB, state.moduleRpgConfig);
      const previous = applyModuleRpgCharacterSlots(previousBase, characterA, characterB, state.moduleRpgConfig);
      const scanSize = Math.max(4, state.contextConfig.recentRounds * 2 + 1);
      const dialogue = sorted.slice(-scanSize)
        .filter((node) => node.role === 'user' || node.role === 'charA' || node.role === 'charB')
        .map((node) => `${node.senderName}: ${node.content}`)
        .join('\n');
      if (!dialogue.trim()) return;

      const characterReference = [characterA, characterB]
        .filter((character): character is NonNullable<typeof character> => Boolean(character))
        .map((character) => `【${character.name}角色卡】\n${character.systemPrompt.slice(0, 3000)}`)
        .join('\n\n');
      const response = await apiFetch(model.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.apiKey}` },
        body: JSON.stringify({
          model: model.defaultModel,
          messages: [
            { role: 'system', content: buildModuleRpgPrompt(state.moduleRpgPrompt, state.moduleRpgConfig, previous) },
            ...(characterReference ? [{ role: 'system', content: characterReference }] : []),
            { role: 'user', content: `【刚完成的对话】\n${dialogue}\n\n现在只输出本轮状态变更 JSON。` },
          ],
          stream: false,
          max_tokens: 1800,
          ...buildSamplingParams(0.2, 0.85),
        }),
      });
      if (!response.ok) throw new Error(`模块化 Gal/RPG API 错误: ${response.status}`);
      const data = await response.json();
      const message = data.choices?.[0]?.message || {};
      const content = stripReasoningBlocks(message.content || data.choices?.[0]?.text || '');
      const reasoning = typeof message.reasoning_content === 'string' ? message.reasoning_content : '';
      const parsed = parseModuleRpgResponse(content) || parseModuleRpgResponse(reasoning);
      const merged = parsed
        ? mergeModuleRpgSnapshot(parsed, previous, state.moduleRpgConfig)
        : { snapshot: previous, diagnostics: ['书记 AI 未返回合法 JSON，已保留上一份模块状态。'] };
      await Stores.updateMessageNode(latestAssistant.id, {
        moduleRpgData: {
          snapshot: merged.snapshot,
          source: 'module',
          diagnostics: merged.diagnostics,
          rawResponse: content || reasoning || undefined,
        },
        ...(data.usage?.total_tokens !== undefined ? { scribeTokenCost: data.usage.total_tokens } : {}),
      });
      onNodesRefresh?.(conversationId);
      void refreshPreview();
    } catch (error) {
      console.error('模块化 Gal/RPG 手动更新失败:', error);
    } finally {
      setIsUpdating(false);
    }
  }, [conversationId, isUpdating, onNodesRefresh, refreshPreview, scribeConfig.scribeModelId, state.contextConfig.recentRounds, state.moduleRpgConfig, state.moduleRpgPrompt]);

  if (!conversationId) {
    return <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-slate-500">请先在左侧选择一个对话。</div>;
  }

  const modelOptions = models.map((model) => ({ value: model.id, label: `${model.name} (${model.defaultModel})` }));
  const mvuAlsoEnabled = Boolean(scribeConfig.mvuEnabled || state.mvuEnabled);
  const bodySpecialConfig = getModuleRpgBodySpecialConfig(state.moduleRpgConfig);
  const assemblyPreview = previewSnapshot ? buildAssemblyPreview(previewSnapshot, state.moduleRpgConfig) : null;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
        <Icon name="state" size={18} className="text-amber-600 dark:text-amber-400" />
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">模块化 Gal/RPG · {conversationTitle}</h2>
        {scribeConfig.scribeEnabled && <span className="text-[10px] px-1.5 py-0.5 bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 rounded-full">已启用</span>}
        {isUpdating && <span className="text-[10px] px-1.5 py-0.5 bg-blue-600/15 text-blue-700 dark:text-blue-300 rounded-full animate-pulse">模块更新中...</span>}
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-900/60 p-1">
        <button onClick={() => setActiveTab('module')} className={`flex-1 rounded-md px-3 py-1.5 text-xs transition-colors ${activeTab === 'module' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800'}`}>模块化 Gal/RPG</button>
        <button onClick={() => setActiveTab('mvu')} className={`flex-1 rounded-md px-3 py-1.5 text-xs transition-colors ${activeTab === 'mvu' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800'}`}>MVU 兼容</button>
      </div>

      {activeTab === 'mvu' ? <MvuPanel conversationId={conversationId} onNodesRefresh={onNodesRefresh} /> : (
        <>
          {mvuAlsoEnabled && <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-200">不推荐与 MVU 同时开启：两套状态维护器会重复记录同一剧情，可能增加费用并产生矛盾。</div>}

          <div className="grid items-start gap-3 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(24rem,1.2fr)]">
          <section className="space-y-3 rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/35">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Toggle checked={scribeConfig.scribeEnabled} onChange={(enabled) => {
                dispatch({ type: 'SET_SCRIBE_ENGINE', engine: 'module' });
                updateConversationConfig({ scribeEnabled: enabled });
              }} label="启用模块化 Gal/RPG" />
              <Toggle checked={scribeConfig.scribeCacheWorldBookEnabled} onChange={(enabled) => updateConversationConfig({ scribeCacheWorldBookEnabled: enabled })} label="维护<缓存世界书>" />
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">触发间隔
                <input type="number" min={1} max={50} value={scribeConfig.scribeTriggerInterval} onChange={(event) => updateConversationConfig({ scribeTriggerInterval: Math.max(1, Number(event.target.value) || 1) })} className="w-14 rounded border border-slate-300 bg-white px-2 py-1 text-center text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />轮
              </label>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">书记 AI 独立维护结构化状态，并将模块附着在角色回复下方。历史文本状态书和 Galgame 数值会自动映射为可阅读模块，升级不会丢失旧内容。</p>
          </section>

          {scribeConfig.scribeEnabled && <section className="space-y-4 rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/35">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100"><Icon name="state" size={14} className="text-amber-600 dark:text-amber-400" />书记 AI 配置</div>
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[11px] text-slate-600 dark:text-slate-300">书记模型</span>
              <Dropdown options={modelOptions} value={scribeConfig.scribeModelId} onChange={(id) => updateConversationConfig({ scribeModelId: id })} placeholder="选择独立书记模型" className="flex-1 min-w-0" />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={handleManualTrigger} disabled={!scribeConfig.scribeModelId || isUpdating} loading={isUpdating}><Icon name="refresh" size={13} />立即更新模块</Button>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">读取近期对话并只更新本轮发生变化的合法字段。</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3"><label className="text-[11px] font-medium text-slate-700 dark:text-slate-200">模块维护提示词</label><button onClick={saveModulePrompt} className="text-[11px] text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200">保存提示词</button></div>
              <textarea value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} onBlur={saveModulePrompt} rows={8} className="w-full resize-y rounded border border-slate-300 bg-white px-2.5 py-2 text-xs leading-relaxed text-slate-900 outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100" />
              <p className="text-[10px] text-slate-500 dark:text-slate-400">程序会追加当前合法状态和字段协议；请保留“只输出 JSON”的核心约束。</p>
            </div>
          </section>}

          <section className="space-y-3 rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/35">
            <div>
              <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">组装预览</h3>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">最多启用两块角色面板。名称会写入书记 AI 的匹配规则，用来定位应更新的 JSON 角色栏。</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {getModuleRpgCharacterSlots(state.moduleRpgConfig).map((slot, index) => (
                <div key={slot.id} className={`space-y-2 rounded-lg border p-2.5 transition-colors ${slot.enabled ? 'border-amber-300/80 bg-amber-50/50 shadow-sm dark:border-amber-700/50 dark:bg-amber-950/15' : 'border-slate-200 dark:border-slate-700'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-semibold ${slot.enabled ? 'text-amber-800 dark:text-amber-200' : 'text-slate-800 dark:text-slate-100'}`}>角色面板 {index + 1}</span>
                    <Toggle checked={slot.enabled} onChange={(enabled) => updateCharacterSlot(slot.id, { enabled })} label={slot.enabled ? '维护' : '关闭'} />
                  </div>
                  <input
                    value={slot.name}
                    onChange={(event) => updateCharacterSlot(slot.id, { name: event.target.value })}
                    disabled={!slot.enabled}
                    placeholder={slot.id === 'charA' ? '填写角色名，例如：李道劫' : '填写第二角色名，例如：柳条条'}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-amber-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
                    aria-label={`角色面板 ${index + 1} 名称`}
                  />
                </div>
              ))}
            </div>
            <div className="overflow-hidden rounded-xl border border-amber-300/60 shadow-md dark:border-amber-800/40">
              {assemblyPreview ? <ModuleRpgCard data={{ snapshot: assemblyPreview, source: 'module' }} config={state.moduleRpgConfig} showEasterEggChallenge /> : <div className="p-3 text-xs text-slate-500">正在组装最终模块预览...</div>}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/35">
            <div><h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">字段模块编排</h3><p className="mt-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">关闭字段后，书记 AI 不再维护该字段，现有数据会保留。每项提示词均可独立 DIY。</p></div>
            <div className="space-y-2">
              {state.moduleRpgConfig.fields.map((field) => <div key={field.id} className="rounded border border-slate-200 p-2.5 dark:border-slate-700">
                <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-xs font-medium text-slate-800 dark:text-slate-100">{field.label}</div><div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{field.id}</div></div><Toggle checked={field.enabled} onChange={(enabled) => updateField(field.id, { enabled })} label={field.enabled ? '维护' : '关闭'} /></div>
                <textarea value={field.prompt} onChange={(event) => updateField(field.id, { prompt: event.target.value })} rows={2} className="mt-2 w-full resize-y rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-900 outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100" aria-label={`${field.label}维护提示词`} />
                {field.id === 'character.body' && <div className="mt-3 rounded-lg border border-pink-200/90 bg-pink-50/60 p-2.5 dark:border-pink-900/60 dark:bg-pink-950/20">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-pink-800 dark:text-pink-200">身体部位特殊状态</div>
                      <p className="mt-1 text-[10px] leading-relaxed text-pink-700/80 dark:text-pink-200/70">默认关闭。开启后，明确触发的特殊状态会用粉色边框和内填充叠加显示，基础健康/伤势颜色仍会保留。</p>
                    </div>
                    <Toggle
                      checked={bodySpecialConfig.enabled}
                      disabled={!field.enabled}
                      onChange={(enabled) => updateBodySpecialConfig({ enabled })}
                      label={bodySpecialConfig.enabled ? '启用' : '关闭'}
                    />
                  </div>
                  {!field.enabled && <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-300">请先启用“身体部位”，特殊状态才会参与维护。</p>}
                  {bodySpecialConfig.enabled && field.enabled && <div className="mt-3 space-y-2">
                    <div>
                      <label className="text-[10px] font-medium text-pink-900 dark:text-pink-100">特殊状态维护提示词</label>
                      <textarea value={bodySpecialConfig.prompt} onChange={(event) => updateBodySpecialConfig({ prompt: event.target.value })} rows={3} className="mt-1 w-full resize-y rounded border border-pink-200 bg-white px-2 py-1.5 text-[11px] leading-relaxed text-slate-900 outline-none focus:border-pink-500 dark:border-pink-900/70 dark:bg-slate-950/50 dark:text-slate-100" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div><div className="text-[10px] font-semibold text-pink-900 dark:text-pink-100">可调用特殊状态预设</div><div className="text-[10px] text-pink-700/75 dark:text-pink-200/65">AI 只输出 ID；点击身体部位时显示下方的玩家文本。</div></div>
                      <button type="button" onClick={addBodySpecialPreset} className="shrink-0 rounded-md border border-pink-300 bg-white px-2 py-1 text-[10px] font-semibold text-pink-700 hover:bg-pink-100 dark:border-pink-800 dark:bg-pink-950/30 dark:text-pink-200 dark:hover:bg-pink-900/50">新增状态</button>
                    </div>
                    <div className="space-y-2">
                      {bodySpecialConfig.presets.map((preset) => <div key={preset.id} className="rounded-md border border-pink-200/80 bg-white/80 p-2 dark:border-pink-900/60 dark:bg-slate-950/30">
                        <div className="flex items-center justify-between gap-2">
                          <code className="min-w-0 truncate text-[10px] font-semibold text-pink-700 dark:text-pink-200">{preset.id}</code>
                          <button type="button" onClick={() => removeBodySpecialPreset(preset.id)} className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-red-100 hover:text-red-700 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-300">删除</button>
                        </div>
                        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-4">
                          <label className="min-w-0 text-[10px] text-slate-600 dark:text-slate-300">角色
                            <select value={preset.characterSlot} onChange={(event) => updateBodySpecialPreset(preset.id, { characterSlot: event.target.value as 'charA' | 'charB' })} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-900 outline-none focus:border-pink-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                              <option value="charA">角色 A</option>
                              <option value="charB">角色 B</option>
                            </select>
                          </label>
                          <label className="min-w-0 text-[10px] text-slate-600 dark:text-slate-300">身体部位
                            <select value={preset.bodyPart} onChange={(event) => updateBodySpecialPreset(preset.id, { bodyPart: event.target.value as BodyPartId })} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-900 outline-none focus:border-pink-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                              {BODY_PARTS.map((part) => <option key={part.id} value={part.id}>{part.label}</option>)}
                            </select>
                          </label>
                          <input value={preset.label} onChange={(event) => updateBodySpecialPreset(preset.id, { label: event.target.value })} placeholder="显示名称，例如：中毒" className="min-w-0 rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-900 outline-none focus:border-pink-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                          <input value={preset.description} onChange={(event) => updateBodySpecialPreset(preset.id, { description: event.target.value })} placeholder="AI 何时调用" className="min-w-0 rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-900 outline-none focus:border-pink-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                        </div>
                        <textarea value={preset.displayText} onChange={(event) => updateBodySpecialPreset(preset.id, { displayText: event.target.value })} rows={2} placeholder="点击部位后展示给玩家的文本" className="mt-1.5 w-full resize-y rounded border border-slate-300 bg-white px-2 py-1 text-[10px] leading-relaxed text-slate-900 outline-none focus:border-pink-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                      </div>)}
                      {bodySpecialConfig.presets.length === 0 && <p className="rounded border border-dashed border-pink-300 px-2 py-2 text-[10px] text-pink-700 dark:border-pink-800 dark:text-pink-200">还没有预设。新增至少一条后，书记 AI 才能调用特殊状态。</p>}
                    </div>
                  </div>}
                </div>}
              </div>)}
            </div>
          </section>
          </div>
        </>
      )}
    </div>
  );
}
