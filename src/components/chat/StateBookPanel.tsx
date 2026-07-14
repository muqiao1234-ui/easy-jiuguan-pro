import React, { useState, useEffect, useCallback } from 'react';
import type { ModelConfig, ScribeEngine, ScribeMode } from '../../types';
import { useApp } from '../../hooks/useApp';
import { useGlobalStates, type ScribeConfig } from '../../hooks/useGlobalStates';
import { SCRIBE_SYSTEM_PROMPT, DEFAULT_TPL_GALGAME_CHAR_INJECTION, buildSamplingParams } from '../../utils/constants';
import {
  GALGAME_MAX_TOKENS,
  buildGalgamePrompt,
  cleanDialogueText,
  collectRecentGalgameStates,
  parseGalgameResponse,
} from '../../utils/galgameEngine';
import Button from '../ui/Button';
import Toggle from '../ui/Toggle';
import Dropdown from '../ui/Dropdown';
import Icon from '../ui/Icon';

import { apiFetch } from '../../utils/apiFetch';
interface StateBookPanelProps {
  conversationId: string | null;
  conversationTitle: string;
  models: ModelConfig[];
  onScribeConfigChange: (conversationId: string, config: Partial<ScribeConfig>) => void;
  onNodesRefresh?: (conversationId: string) => void;
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
  const [localPrompt, setLocalPrompt] = useState('');
  const [localGalgamePrompt, setLocalGalgamePrompt] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);

  useEffect(() => {
    if (conversationId) loadScribeContent(conversationId);
  }, [conversationId, loadScribeContent]);

  useEffect(() => {
    setLocalPrompt(scribeConfig.scribeSystemPrompt);
  }, [scribeConfig.scribeSystemPrompt]);

  useEffect(() => {
    setLocalGalgamePrompt(state.galgamePrompt);
  }, [state.galgamePrompt]);

  const handleSavePrompt = useCallback(() => {
    if (!conversationId) return;
    updateScribeConfig(conversationId, { scribeSystemPrompt: localPrompt });
  }, [conversationId, localPrompt, updateScribeConfig]);

  const handleSaveGalgamePrompt = useCallback(() => {
    dispatch({ type: 'SET_GALGAME_PROMPT', prompt: localGalgamePrompt });
  }, [dispatch, localGalgamePrompt]);

  const handleManualTrigger = useCallback(async () => {
    if (!conversationId || !scribeConfig.scribeModelId) return;
    setIsSummarizing(true);
    try {
      const Stores = await import('../../db/stores');
      const model = await Stores.getModelById(scribeConfig.scribeModelId);
      if (!model) return;

      const allNodes = await Stores.getMessageNodesByConversation(conversationId);
      const sorted = [...allNodes].sort((a, b) => a.timestamp - b.timestamp);

      // 找到最新的 assistant 节点（charA 或 charB）
      const latestAssistant = [...sorted]
        .reverse()
        .find((n) => (n.role === 'charA' || n.role === 'charB') && !n.isArchived);
      if (!latestAssistant) return;

      if (state.scribeEngine === 'galgame') {
        // Galgame 数值引擎：四段式上下文（与 useChat 自动触发保持一致）
        const lastTwo = sorted.slice(-4);
        const dialogueText = lastTwo
          .filter((n) => n.role === 'user' || n.role === 'charA' || n.role === 'charB')
          .map((n) => `${n.senderName}: ${cleanDialogueText(n.content)}`)
          .join('\n');
        if (!dialogueText.trim()) return;

        const charName = latestAssistant.senderName || '角色';
        const prompt = buildGalgamePrompt(charName, localGalgamePrompt);

        // 查找角色卡，获取 systemPrompt 作为角色性格底色注入
        const conversation = await Stores.getConversationById(conversationId);
        const characterId =
          latestAssistant.role === 'charA'
            ? conversation?.characterAId
            : conversation?.characterBId;
        const character = characterId ? await Stores.getCharacterById(characterId) : undefined;

        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: prompt },
        ];

        // 角色 systemPrompt 作为"伪装 user 消息"注入
        if (character?.systemPrompt?.trim()) {
          messages.push({
            role: 'user',
            content: (state.tplGalgameCharInjection || DEFAULT_TPL_GALGAME_CHAR_INJECTION)
              .replace('{charPrompt}', character.systemPrompt.trim()),
          });
        }

        // 最近 2 个 galgame 状态书作为 assistant 消息注入
        const recentStates = collectRecentGalgameStates(sorted, charName, 2);
        for (const stateText of recentStates) {
          messages.push({ role: 'assistant', content: stateText });
        }

        // 最后追加本次要推断的 2 轮对话
        messages.push({ role: 'user', content: dialogueText });

        const resp = await apiFetch(model.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${model.apiKey}`,
          },
          body: JSON.stringify({
            model: model.defaultModel,
            messages,
            stream: false,
            max_tokens: GALGAME_MAX_TOKENS,
            ...buildSamplingParams(model.temperature, model.topP),
          }),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        // 兼容思维链模型：content 为空时从 reasoning_content 提取 JSON
        const content = data.choices?.[0]?.message?.content || '';
        const reasoning = data.choices?.[0]?.message?.reasoning_content || '';
        const rawContent = content || reasoning || data.choices?.[0]?.text || '';
        let galgameData = parseGalgameResponse(rawContent, charName);
        if (!galgameData && !content && reasoning) {
          galgameData = parseGalgameResponse(reasoning, charName);
        }
        const galgameTokenCost = data.usage?.total_tokens;
        if (galgameData) {
          await Stores.updateMessageNode(latestAssistant.id, {
            galgameData,
            ...(galgameTokenCost !== undefined ? { scribeTokenCost: galgameTokenCost } : {}),
          });
        }
      } else {
        // 文本状态书：与自动触发一致，只读 recentRounds 条消息（非全部对话）
        const recent = sorted.slice(-state.contextConfig.recentRounds);
        const dialogueText = recent
          .filter((n) => n.role === 'user' || n.role === 'charA' || n.role === 'charB')
          .map((n) => `${n.senderName}: ${n.content}`)
          .join('\n\n');
        if (!dialogueText.trim()) return;

        const messages = [
          { role: 'system' as const, content: scribeConfig.scribeSystemPrompt || SCRIBE_SYSTEM_PROMPT },
          { role: 'user' as const, content: dialogueText },
        ];

        const resp = await apiFetch(model.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${model.apiKey}`,
          },
          body: JSON.stringify({
            model: model.defaultModel,
            messages,
            stream: false,
            ...buildSamplingParams(model.temperature, model.topP),
          }),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const newContent = data.choices?.[0]?.message?.content || '';
        if (newContent.trim()) {
          await Stores.updateMessageNode(latestAssistant.id, {
            scribeUpdate: {
              rawText: newContent,
              isEnabled: true,
              mode: state.scribeMode,
            },
          });
        }
      }

      onNodesRefresh?.(conversationId);
    } catch (e) {
      console.error('手动状态书触发失败:', e);
    } finally {
      setIsSummarizing(false);
    }
  }, [conversationId, scribeConfig, state.scribeEngine, state.scribeMode, state.contextConfig.recentRounds, localGalgamePrompt, onNodesRefresh]);

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-600">
        <div className="text-center">
          <div className="text-4xl mb-3">📜</div>
          <p className="text-sm">请在左侧选择一个对话</p>
          <p className="text-xs mt-1 text-slate-500">每个对话可独立配置书记员</p>
        </div>
      </div>
    );
  }

  const modelOptions = models.map((m) => ({
    value: m.id,
    label: `${m.name} (${m.defaultModel})`,
  }));

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
        <span className="text-lg">📜</span>
        <h2 className="text-base font-semibold text-amber-400/80">状态书 · {conversationTitle}</h2>
        {scribeConfig.scribeEnabled && (
          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-600/20 text-emerald-400 rounded-full">
            已启用
          </span>
        )}
        {isSummarizing && (
          <span className="text-[10px] px-1.5 py-0.5 bg-blue-600/20 text-blue-400 rounded-full animate-pulse">
            {state.scribeEngine === 'galgame' ? '数值引擎计算中...' : '书记官总结中...'}
          </span>
        )}
      </div>

      {/* Basic Settings */}
      <div className="space-y-3 p-3 bg-slate-900/40 rounded-lg border border-slate-800">
        <div className="flex items-center gap-4 flex-wrap">
          <Toggle
            checked={scribeConfig.scribeEnabled}
            onChange={(v) => {
              if (conversationId) {
                updateScribeConfig(conversationId, { scribeEnabled: v });
                onScribeConfigChange(conversationId, { scribeEnabled: v });
              }
            }}
            label="启用状态书"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">显示间隔:</span>
            <input
              type="number"
              min={1}
              max={50}
              value={scribeConfig.scribeInterval}
              onChange={(e) => {
                const v = Math.max(1, parseInt(e.target.value) || 1);
                if (conversationId) {
                  updateScribeConfig(conversationId, { scribeInterval: v });
                  onScribeConfigChange(conversationId, { scribeInterval: v });
                }
              }}
              className="w-16 bg-slate-800 border border-slate-700 rounded-md px-2 py-0.5 text-xs text-slate-200 text-center"
            />
            <span className="text-xs text-slate-500">轮</span>
          </div>
        </div>
      </div>

      {scribeConfig.scribeEnabled && (
        <div className="space-y-3 p-3 bg-slate-900/40 rounded-lg border border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400/70">
            <Icon name="state" size={14} />
            <span>AI 状态书引擎</span>
          </div>

          {/* Engine selector */}
          <div className="space-y-1.5">
            <label className="block text-xs text-slate-400">状态书引擎</label>
            <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5">
              <button
                onClick={() => dispatch({ type: 'SET_SCRIBE_ENGINE', engine: 'text' })}
                className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                  state.scribeEngine === 'text' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                📜 文本模式
              </button>
              <button
                onClick={() => dispatch({ type: 'SET_SCRIBE_ENGINE', engine: 'galgame' })}
                className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                  state.scribeEngine === 'galgame' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🎮 Galgame 数值
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              {state.scribeEngine === 'text' && '传统文本状态书，AI 总结后以文本卡片展示'}
              {state.scribeEngine === 'galgame' && '超低消耗数值引擎（每2轮），像素风卡片，非对称注入防AI谄媚'}
            </p>
          </div>

          {/* Insertion mode */}
          <div className="space-y-1.5">
            <label className="block text-xs text-slate-400">插入策略模式</label>
            <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5">
              <button
                onClick={() => dispatch({ type: 'SET_SCRIBE_MODE', mode: 'charA' })}
                className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                  state.scribeMode === 'charA' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                仅角色A
              </button>
              <button
                onClick={() => dispatch({ type: 'SET_SCRIBE_MODE', mode: 'charB' })}
                className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                  state.scribeMode === 'charB' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                仅角色B
              </button>
              <button
                onClick={() => dispatch({ type: 'SET_SCRIBE_MODE', mode: 'auto' })}
                className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                  state.scribeMode === 'auto' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                自动（就近）
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              {state.scribeMode === 'charA' && '状态书仅生成并绑定在角色A的回复气泡下'}
              {state.scribeMode === 'charB' && '状态书仅生成并绑定在角色B的回复气泡下'}
              {state.scribeMode === 'auto' && '触发时自动绑定到最新生成的 assistant 消息'}
            </p>
          </div>

          {/* Model selector */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 whitespace-nowrap w-16">总结模型:</span>
            <Dropdown
              options={modelOptions}
              value={scribeConfig.scribeModelId}
              onChange={(id) => {
                if (conversationId) {
                  updateScribeConfig(conversationId, { scribeModelId: id });
                  onScribeConfigChange(conversationId, { scribeModelId: id });
                }
              }}
              placeholder="选择状态书总结模型"
              className="flex-1 min-w-0"
            />
          </div>

          {/* Trigger interval */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 whitespace-nowrap w-16">触发间隔:</span>
            <input
              type="number"
              min={1}
              max={50}
              value={scribeConfig.scribeTriggerInterval}
              onChange={(e) => {
                const v = Math.max(1, parseInt(e.target.value) || 1);
                if (conversationId) {
                  updateScribeConfig(conversationId, { scribeTriggerInterval: v });
                  onScribeConfigChange(conversationId, { scribeTriggerInterval: v });
                }
              }}
              className="w-16 bg-slate-800 border border-slate-700 rounded-md px-2 py-0.5 text-xs text-slate-200 text-center"
            />
            <span className="text-xs text-slate-500">轮</span>
          </div>

          {/* Manual trigger */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleManualTrigger}
              disabled={!scribeConfig.scribeModelId || isSummarizing}
              loading={isSummarizing}
            >
              <Icon name="refresh" size={13} /> {state.scribeEngine === 'galgame' ? '立即计算数值' : '立即总结'}
            </Button>
            <span className="text-[10px] text-slate-500">
              {state.scribeEngine === 'galgame'
                ? '数值引擎只读最近 2 轮，生成像素风状态卡片'
                : '书记官仅读取纯对话文本，绝对隔离角色设定与世界书'}
            </span>
          </div>

          {/* Text mode prompt */}
          {state.scribeEngine === 'text' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-slate-500">书记官 System Prompt（可自定义）:</label>
                <button
                  onClick={handleSavePrompt}
                  className="text-[10px] text-amber-400 hover:text-amber-300"
                >
                  保存提示词
                </button>
              </div>
              <textarea
                value={localPrompt}
                onChange={(e) => setLocalPrompt(e.target.value)}
                onBlur={handleSavePrompt}
                rows={4}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 
                  placeholder-slate-500 resize-none focus:outline-none focus:border-amber-600/50"
                placeholder="定义书记官的角色和行为..."
              />
            </div>
          )}

          {/* Galgame prompt */}
          {state.scribeEngine === 'galgame' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-slate-500">Galgame 引擎 Prompt（可自定义）:</label>
                <button
                  onClick={handleSaveGalgamePrompt}
                  className="text-[10px] text-purple-400 hover:text-purple-300"
                >
                  保存提示词
                </button>
              </div>
              <textarea
                value={localGalgamePrompt}
                onChange={(e) => setLocalGalgamePrompt(e.target.value)}
                onBlur={handleSaveGalgamePrompt}
                rows={6}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[10px] text-slate-200 
                  placeholder-slate-500 resize-none focus:outline-none focus:border-purple-600/50 font-mono"
                placeholder="留空使用默认 Galgame 引擎 Prompt..."
              />
            </div>
          )}
        </div>
      )}

      {/* Architecture note */}
      <div className="p-3 bg-amber-900/10 border border-amber-700/30 rounded-lg space-y-1">
        <p className="text-[11px] text-amber-400/80 font-semibold">📌 状态书已属性化</p>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          状态书不再作为独立气泡存在，而是吸附在 AI 回复气泡下方。每轮触发时会自动绑定到最新的 assistant 消息。
          {state.scribeEngine === 'galgame'
            ? ' Galgame 模式下玩家看到具体数值，但主 AI 只接收模糊氛围描述，避免谄媚作弊。'
            : ' 点击 AI 气泡的编辑按钮可同时篡改回复文本和状态书内容。'}
        </p>
      </div>
    </div>
  );
}
