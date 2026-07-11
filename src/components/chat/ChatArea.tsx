import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type { Character, MessageNode, SendTarget, WorldBookEntry } from '../../types';
import { useChat } from '../../hooks/useChat';
import { useDistillation } from '../../hooks/useDistillation';
import { useWorldBookScanner } from '../../hooks/useWorldBookScanner';
import { useMessageNodes } from '../../hooks/useMessageNodes';
import { useModels } from '../../hooks/useModels';
import { useGlobalStates, type ScribeConfig } from '../../hooks/useGlobalStates';
import { useApp } from '../../hooks/useApp';
import { DEFAULT_SCRIBE_TRIGGER_INTERVAL, SCRIBE_SYSTEM_PROMPT, DEFAULT_MUTUAL_OBSERVE_PROMPT } from '../../utils/constants';
import { generateId } from '../../utils/id';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ModelSelector from './ModelSelector';
import CharacterSelector from '../characters/CharacterSelector';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

import { chatCompletionsUrl } from '../../utils/chatCompletionsUrl';
interface ChatAreaProps {
  characterA: Character | null;
  characterB: Character | null;
  allCharacters: Character[];
  onCharAChange: (id: string) => void;
  onCharBChange: (id: string) => void;
  onBranch: (nodeId: string) => void;
}

export default function ChatArea({
  characterA,
  characterB,
  allCharacters,
  onCharAChange,
  onCharBChange,
  onBranch,
}: ChatAreaProps) {
  const { state, dispatch } = useApp();
  const { models, loadModels } = useModels();
  const { nodes, loadNodes, addNode, updateNode, batchUpdateNodes } = useMessageNodes();
  const { isDistilling, performDistillation } = useDistillation();
  const { scan } = useWorldBookScanner();
  useGlobalStates();
  const [localScribeConfig, setLocalScribeConfig] = React.useState<ScribeConfig>({
    scribeContent: '',
    scribeEnabled: true,
    scribeInterval: 1,
    scribeTriggerInterval: DEFAULT_SCRIBE_TRIGGER_INTERVAL,
    scribeSystemPrompt: SCRIBE_SYSTEM_PROMPT,
    scribeModelId: null,
  });
  const [localNodes, setLocalNodes] = React.useState<MessageNode[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isObserving, setIsObserving] = useState(false);

  // Load per-conversation scribe config (also reload when returning from statebook view)
  useEffect(() => {
    if (state.currentConversationId && state.activeView === 'conversations') {
      import('../../db/stores').then((Stores) => {
        Stores.getGlobalStateByConversation(state.currentConversationId!)
          .then((gs) => {
            setLocalScribeConfig({
              scribeContent: gs?.scribeContent || '',
              scribeEnabled: gs?.scribeEnabled ?? true,
              scribeInterval: gs?.scribeInterval ?? 1,
              scribeTriggerInterval: gs?.scribeTriggerInterval ?? DEFAULT_SCRIBE_TRIGGER_INTERVAL,
              scribeSystemPrompt: gs?.scribeSystemPrompt ?? SCRIBE_SYSTEM_PROMPT,
              scribeModelId: gs?.scribeModelId ?? null,
            });
          });
      });
    }
  }, [state.currentConversationId, state.activeView]);

  useEffect(() => { loadModels(); }, [loadModels]);

  useEffect(() => {
    if (state.currentConversationId) loadNodes(state.currentConversationId);
  }, [state.currentConversationId, loadNodes]);

  useEffect(() => { setLocalNodes(nodes); }, [nodes]);

  const getModelById = useCallback(async (id: string) => {
    const all = await import('../../db/stores').then((s) => s.getAllModels());
    return all.find((m) => m.id === id);
  }, []);

  const getNodesByConversation = useCallback(async (convId: string) => {
    const all = await import('../../db/stores').then((s) => s.getMessageNodesByConversation(convId));
    return all;
  }, []);

  const updateConversation = useCallback(async (id: string, updates: any) => {
    await import('../../db/stores').then((s) => s.updateConversation(id, updates));
  }, []);

  const handleRetry = async (nodeId: string) => {
    if (!state.currentConversationId) return;
    const Stores = await import('../../db/stores');
    const allNodes = await getNodesByConversation(state.currentConversationId);
    const sorted = [...allNodes].sort((a, b) => a.timestamp - b.timestamp);
    const idx = sorted.findIndex((n) => n.id === nodeId);
    if (idx === -1) return;

    const targetNode = sorted[idx];
    // 重试按钮仅对 AI 角色（charA/charB）节点生效
    if (targetNode.role !== 'charA' && targetNode.role !== 'charB') return;

    const target: SendTarget =
      targetNode.role === 'charA'
        ? { type: 'charA', characterId: characterA?.id || '' }
        : { type: 'charB', characterId: characterB?.id || '' };

    // 向前查找最近的 user 消息作为"重发的依据"
    let userIdx = -1;
    let userContent = '';
    for (let i = idx - 1; i >= 0; i--) {
      if (sorted[i].role === 'user') {
        userIdx = i;
        userContent = sorted[i].content;
        break;
      }
    }
    if (userIdx === -1 || !userContent) {
      setValidationError('找不到要重发的 user 消息');
      return;
    }
    const userNodeId = sorted[userIdx].id;

    // 级联删除：从被重试的 AI 节点开始（含）到最后一刻所有消息
    // 这样既清理了"AI 回复"，又避免了"重试的不是最后一条时其后的消息残留导致时间线混乱"。
    // 同时清理后续可能产生的 system（植入记忆）、distilled（蒸馏归档）、scribe 等附属节点，
    // 否则会留下指向已被删除消息的孤立引用。
    const toDelete = sorted.slice(idx).map((n) => n.id);
    for (const id of toDelete) {
      await Stores.deleteMessageNode(id);
    }

    // 重新发送：复用既有 user 节点，不再插入新的 user 消息，避免重复
    await chat.sendMessage(target, userContent, {
      skipUserNode: true,
      existingUserNodeId: userNodeId,
    });

    // sendMessage 内部已通过 onNodesRefresh 刷新；这里兜底再刷一次
    loadNodes(state.currentConversationId);
  };

  const handleDelete = async (nodeId: string) => {
    await import('../../db/stores').then((s) => s.deleteMessageNode(nodeId));
    if (state.currentConversationId) loadNodes(state.currentConversationId);
  };

  const handleEdit = async (nodeId: string, newContent: string, newScribeText?: string, newGalgameData?: any) => {
    const updates: any = { content: newContent };
    if (newScribeText !== undefined) {
      const Stores = await import('../../db/stores');
      const existing = await Stores.getMessageNodeById(nodeId);
      if (existing?.scribeUpdate) {
        updates.scribeUpdate = {
          ...existing.scribeUpdate,
          rawText: newScribeText,
        };
      }
    }
    if (newGalgameData) {
      updates.galgameData = newGalgameData;
    }
    await import('../../db/stores').then((s) => s.updateMessageNode(nodeId, updates));
    if (state.currentConversationId) loadNodes(state.currentConversationId);
  };

  const handleExportPrompt = (nodeId: string) => {
    const promptData = chat.lastPrompt;
    if (!promptData || promptData.length === 0) {
      alert('暂无可导出的 Prompt 数据。请先发送一条消息，再使用导出功能。');
      return;
    }

    const node = localNodes.find((n) => n.id === nodeId);
    const charName = node?.role === 'charA'
      ? (characterA?.name || '角色A')
      : node?.role === 'charB'
        ? (characterB?.name || '角色B')
        : '未知';

    let text = '';
    promptData.forEach((msg, idx) => {
      const label = idx === 0 && msg.role === 'system'
        ? '=== SYSTEM PROMPT ==='
        : `=== MESSAGE ${idx + 1} (role: ${msg.role}) ===`;
      text += `${label}\n${msg.content}\n\n`;
    });

    if (node) {
      text += `=== MESSAGE ${promptData.length + 1} (role: assistant) ===\n${node.content}\n\n`;
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `prompt_debug_${charName}_${ts}.txt`;

    if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: 'text/plain' })] })) {
      navigator.share({
        files: [new File([blob], filename, { type: 'text/plain' })],
        title: filename,
      }).catch(() => {
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    } else {
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const onNodesRefresh = useCallback((newNodes: MessageNode[]) => {
    setLocalNodes(newNodes);
  }, []);

  // useMemo 稳定 deps 引用：只有字段值变化时才产生新对象，
  // 避免 ChatArea 每帧构造新对象导致 useChat 内所有 useCallback 整链重建。
  const chatDeps = useMemo(() => ({
    conversationId: state.currentConversationId,
    characterA,
    characterB,
    chatModelId: state.currentChatModelId,
    distillModelId: state.currentDistillModelId,
    scribeModelId: localScribeConfig.scribeModelId || state.currentScribeModelId,
    scribeEnabled: localScribeConfig.scribeEnabled,
    scribeTriggerInterval: localScribeConfig.scribeTriggerInterval,
    scribeMode: state.scribeMode,
    scribeEngine: state.scribeEngine,
    galgamePrompt: state.galgamePrompt,
    scribeSystemPrompt: localScribeConfig.scribeSystemPrompt,
    thinkingEnabled: state.thinkingEnabled,
    recentRounds: state.contextConfig.recentRounds,
    maxDistilledNodes: state.contextConfig.maxDistilledNodes,
    maxWorldBookEntries: state.contextConfig.maxWorldBookEntries,
    autoTriggerDistillation: state.distillationConfig.autoTrigger,
    triggerThreshold: state.distillationConfig.triggerThreshold,
    distillationPrompt: state.distillationConfig.distillationPrompt,
    getModelById,
    addMessageNode: addNode,
    updateMessageNode: updateNode,
    batchUpdateNodes,
    getNodesByConversation,
    scanWorldBook: scan,
    performDistillation: performDistillation as any,
    updateConversation,
    onNodesRefresh,
    // 高级提示词模板
    tplUserWrapper: state.tplUserWrapper,
    tplOtherCharWrapper: state.tplOtherCharWrapper,
    tplIdentityAnchor: state.tplIdentityAnchor,
    tplWorldBookPrefix: state.tplWorldBookPrefix,
    tplDistilledPrefix: state.tplDistilledPrefix,
    tplStateBookPrefix: state.tplStateBookPrefix,
    tplEavesdropAppend: state.tplEavesdropAppend,
    tplGalgameCharInjection: state.tplGalgameCharInjection,
    tplImplantMemoryPrefix: state.tplImplantMemoryPrefix,
    tplImplantScribePrefix: state.tplImplantScribePrefix,
    tplDistilledNodePrefix: state.tplDistilledNodePrefix,
  }), [
    state.currentConversationId,
    characterA,
    characterB,
    state.currentChatModelId,
    state.currentDistillModelId,
    localScribeConfig.scribeModelId,
    localScribeConfig.scribeEnabled,
    localScribeConfig.scribeTriggerInterval,
    localScribeConfig.scribeSystemPrompt,
    state.currentScribeModelId,
    state.scribeMode,
    state.scribeEngine,
    state.galgamePrompt,
    state.thinkingEnabled,
    state.contextConfig.recentRounds,
    state.contextConfig.maxDistilledNodes,
    state.contextConfig.maxWorldBookEntries,
    state.distillationConfig.autoTrigger,
    state.distillationConfig.triggerThreshold,
    state.distillationConfig.distillationPrompt,
    state.tplUserWrapper, state.tplOtherCharWrapper, state.tplIdentityAnchor,
    state.tplWorldBookPrefix, state.tplDistilledPrefix, state.tplStateBookPrefix,
    state.tplEavesdropAppend, state.tplGalgameCharInjection,
    state.tplImplantMemoryPrefix, state.tplImplantScribePrefix, state.tplDistilledNodePrefix,
    // 以下函数均经各自 hook 的 useCallback 稳定化，引用不变
    getModelById,
    addNode,
    updateNode,
    batchUpdateNodes,
    getNodesByConversation,
    scan,
    performDistillation,
    updateConversation,
    onNodesRefresh,
  ]);

  const chat = useChat(chatDeps);

  /**
   * 双角色互相认识：用主AI分别观察对方角色卡，提取外部可观察特征
   * 生成两条世界书条目，分别插入对应角色的世界书中
   */
  const handleMutualObserve = useCallback(async () => {
    if (!characterA || !characterB || !state.currentChatModelId) {
      setValidationError('请先选择角色A、角色B和聊天模型');
      return;
    }
    setIsObserving(true);
    try {
      const Stores = await import('../../db/stores');
      const model = await Stores.getModelById(state.currentChatModelId);
      if (!model) throw new Error('聊天模型未找到');

      // AI 观察提示词：使用用户自定义或默认
      const observeTemplate = state.mutualObservePrompt || DEFAULT_MUTUAL_OBSERVE_PROMPT;
      const OBSERVE_PROMPT = (charPrompt: string) =>
        observeTemplate.replace('{charPrompt}', charPrompt);

      // 并发发起两个观察请求
      const [obsB_forA, obsA_forB] = await Promise.all([
        fetch(`${chatCompletionsUrl(model.baseUrl)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.apiKey}` },
          body: JSON.stringify({
            model: model.defaultModel,
            messages: [{ role: 'user', content: OBSERVE_PROMPT(characterB.systemPrompt) }],
            stream: false, temperature: 0.3, max_tokens: 200,
          }),
        }).then(async r => {
          const data = await r.json();
          if (!r.ok) throw new Error(`API ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
          return data;
        }).then(d =>
          (d.choices?.[0]?.message?.content
           || d.choices?.[0]?.message?.reasoning_content
           || d.choices?.[0]?.text
           || ''
          ).trim()
        ),
        fetch(`${chatCompletionsUrl(model.baseUrl)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.apiKey}` },
          body: JSON.stringify({
            model: model.defaultModel,
            messages: [{ role: 'user', content: OBSERVE_PROMPT(characterA.systemPrompt) }],
            stream: false, temperature: 0.3, max_tokens: 200,
          }),
        }).then(async r => {
          const data = await r.json();
          if (!r.ok) throw new Error(`API ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
          return data;
        }).then(d =>
          (d.choices?.[0]?.message?.content
           || d.choices?.[0]?.message?.reasoning_content
           || d.choices?.[0]?.text
           || ''
          ).trim()
        ),
      ]);

      // 后处理：剥离 AI 可能在描述前输出的推理/分析文字
      const cleanObservation = (raw: string) => {
        // 推理文本关键词（出现这些表明是 AI 的分析前缀，非最终描述）
        const REASONING = /^(好的|首先|我来|让我|角色设定|根据|需要|提取|分析|注意|我们|你|这|该)/;
        // 描述文本特征词（出现这些表明是真正的观察描述）
        const DESCRIPTIVE = /(身高|身材|有着|穿着|带|戴|一双|一头|一条|一位|一个|头发|眼睛|皮肤|cm|镰刀|刀|哨子|耳朵|尾巴)/;
        const parts = raw.split(/[。\n]+/).map(p => p.trim()).filter(p => p.length > 15);
        // 找到第一个像是描述（不含推理前缀且含描述特征词）的段落
        for (const p of parts) {
          if (!REASONING.test(p) && DESCRIPTIVE.test(p)) return p;
        }
        // 兜底：返回最长的段落
        if (parts.length > 0) return parts.reduce((a, b) => a.length >= b.length ? a : b);
        return raw;
      };
      const finalObsB = cleanObservation(obsB_forA);
      const finalObsA = cleanObservation(obsA_forB);

      if (!finalObsB || !finalObsA) throw new Error(
        `AI 观察生成失败：响应为空。B→A="${finalObsB}" A→B="${finalObsA}"`
      );

      // 为角色 A 的世界书插入对角色 B 的观察条目
      const insertObservation = async (
        observer: Character,
        targetName: string,
        observation: string
      ) => {
        let wbId = observer.worldBookId || undefined;
        // 验证世界书是否存在（可能是脏数据引用了已删除的世界书）
        if (wbId) {
          const existing = await Stores.getWorldBookById(wbId);
          if (!existing) wbId = undefined;
        }
        if (!wbId) {
          // 角色无世界书或世界书已失效，创建一个
          wbId = generateId();
          const newWb = { id: wbId, name: `${observer.name}的世界书`, entries: [] };
          await Stores.addWorldBook(newWb);
          await Stores.updateCharacter(observer.id, { worldBookId: wbId });
        }
        const wb = await Stores.getWorldBookById(wbId);
        if (!wb) throw new Error(`世界书 ${wbId} 未找到`);
        // 避免重复插入同名条目
        const filtered = wb.entries.filter(e => !e.keys.includes(targetName));
        const newEntry: WorldBookEntry = {
          id: generateId(),
          keys: [targetName],
          value: observation,
          priority: 10,
        };
        await Stores.updateWorldBook(wbId, { entries: [...filtered, newEntry] });
      };

      await insertObservation(characterA, characterB.name, finalObsB);
      await insertObservation(characterB, characterA.name, finalObsA);
    } catch (e: any) {
      console.error('[互相认识] 失败:', e);
      setValidationError(e.message || '互相认识生成失败');
    } finally {
      setIsObserving(false);
    }
  }, [characterA, characterB, state.currentChatModelId, state.mutualObservePrompt]);

  // 合并错误：chat.error 和 validationError
  const activeError = validationError || chat.error || '';

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <MessageList
        nodes={localNodes}
        characterAName={characterA?.name || '角色A'}
        characterBName={characterB?.name || '角色B'}
        avatarA={characterA?.avatar || '🤖'}
        avatarB={characterB?.avatar || '🤖'}
        streamingContent={chat.streamingContent}
        streamingTarget={chat.streamingTarget?.type || ''}
        onBranch={onBranch}
        onRetry={handleRetry}
        onDelete={handleDelete}
        onEdit={handleEdit}
        debugMode={state.debugMode}
        onExportPrompt={handleExportPrompt}
        boldColorize={state.boldColorize}
      />

      {/* 吸附在输入区上方的错误横幅 */}
      {activeError && (
        <div className="flex-shrink-0 mx-3 mb-1 px-3 py-2 bg-red-900/40 border border-red-700/60 rounded-lg text-xs text-red-300 flex items-center justify-between backdrop-blur-sm">
          <span>⚠️ {activeError}</span>
          <div className="flex items-center gap-2">
            {/* 未选模型时提供快捷入口 */}
            {activeError.includes('模型') && (
              <button
                onClick={() => setSelectorOpen(true)}
                className="text-amber-400 hover:text-amber-300 underline"
              >
                去选择
              </button>
            )}
            <button
              onClick={() => {
                setValidationError('');
                chat.setError(null);
              }}
              className="text-red-400 hover:text-red-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <ChatInput
        charAId={characterA?.id || null}
        charBId={characterB?.id || null}
        charAName={characterA?.name || null}
        charBName={characterB?.name || null}
        chatModelId={state.currentChatModelId}
        chatModelName={models.find((m) => m.id === state.currentChatModelId)?.name || null}
        thinkingEnabled={state.thinkingEnabled}
        onToggleThinking={() => dispatch({ type: 'TOGGLE_THINKING' })}
        implantMemoryArmed={chat.implantMemoryArmed}
        onToggleImplantMemory={() => {
          if (chat.implantMemoryArmed) {
            chat.disarmImplantMemory();
          } else {
            chat.armImplantMemory();
          }
        }}
        streaming={chat.streaming}
        isDistilling={isDistilling}
        scribeStreaming={chat.scribeStreaming}
        scribeEnabled={localScribeConfig.scribeEnabled}
        onSend={chat.sendMessage}
        onEavesdrop={chat.triggerEavesdrop}
        onDistill={chat.triggerDistillation}
        onStop={chat.abortStream}
        onScribeClick={() => dispatch({ type: 'SET_VIEW', view: 'statebook' })}
        onOpenSelector={() => setSelectorOpen(true)}
        onError={setValidationError}
        onMutualObserve={handleMutualObserve}
        isObserving={isObserving}
      />

      {/* 角色 & 模型选择弹窗 */}
      <Modal
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        title="角色与模型设置"
      >
        <div className="space-y-4">
          <CharacterSelector
            characters={allCharacters}
            charAId={characterA?.id || null}
            charBId={characterB?.id || null}
            onCharAChange={(id) => { onCharAChange(id); }}
            onCharBChange={(id) => { onCharBChange(id); }}
          />
          <ModelSelector
            models={models}
            chatModelId={state.currentChatModelId}
            distillModelId={state.currentDistillModelId}
            onChatModelChange={(id) => dispatch({ type: 'SET_CHAT_MODEL', id })}
            onDistillModelChange={(id) => dispatch({ type: 'SET_DISTILL_MODEL', id })}
          />
          <div className="flex justify-end">
            <Button onClick={() => setSelectorOpen(false)}>完成</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
