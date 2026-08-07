import React, { useEffect, useState, useCallback, useMemo } from 'react';
import type { Character, ImageChannel, ImageGenerationRecord, ImageGenerationTask, ImageGenerationTaskDraft, MessageNode, SendTarget, WorldBookEntry } from '../../types';
import type { MessageNodeQuery } from '../../db/stores';
import { useChat } from '../../hooks/useChat';
import { useDistillation } from '../../hooks/useDistillation';
import { useWorldBookScanner } from '../../hooks/useWorldBookScanner';
import { useMessageNodes } from '../../hooks/useMessageNodes';
import { useModels } from '../../hooks/useModels';
import { useGlobalStates, type ScribeConfig } from '../../hooks/useGlobalStates';
import { useApp } from '../../hooks/useApp';
import { DEFAULT_SCRIBE_TRIGGER_INTERVAL, SCRIBE_SYSTEM_PROMPT, DEFAULT_MUTUAL_OBSERVE_PROMPT } from '../../utils/constants';
import { GALGAME_TRIGGER_INTERVAL } from '../../utils/galgameEngine';
import { planDistillation } from '../../utils/distillation';
import { replaceSillyTavernUserPlaceholders } from '../../utils/context';
import { generateId } from '../../utils/id';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ModelSelector from './ModelSelector';
import CharacterSelector from '../characters/CharacterSelector';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import ImageGenerateModal from './ImageGenerateModal';
import { DEFAULT_TPL_IMAGE_PROMPT } from '../../utils/constants';

import { apiFetch } from '../../utils/apiFetch';
import { useStickerPacks } from '../../hooks/useStickerPacks';
import {
  createMvuNodeData,
  getMvuScopeId,
  parseMvuInitBooks,
  parseMvuResponse,
  replayMvuState,
} from '../../utils/mvu';
interface ChatAreaProps {
  characterA: Character | null;
  characterB: Character | null;
  allCharacters: Character[];
  onCharAChange: (id: string) => void;
  onCharBChange: (id: string) => void;
  onBranch: (nodeId: string) => void;
  stickerPackAId?: string;
  stickerPackBId?: string;
  userName?: string;
  userDescription?: string;
  onStickerBindingsChange: (updates: { stickerPackAId?: string; stickerPackBId?: string }) => void;
  imageTaskToEdit: ImageGenerationTask | null;
  imageTaskRevision: number;
  onImageTaskOpened: () => void;
  onQueueImageTask: (draft: ImageGenerationTaskDraft, existingTaskId?: string) => Promise<unknown>;
  onCancelImageTask: (taskId: string) => Promise<void>;
}

export default function ChatArea({
  characterA,
  characterB,
  allCharacters,
  onCharAChange,
  onCharBChange,
  onBranch,
  stickerPackAId,
  stickerPackBId,
  userName,
  userDescription,
  onStickerBindingsChange,
  imageTaskToEdit,
  imageTaskRevision,
  onImageTaskOpened,
  onQueueImageTask,
  onCancelImageTask,
}: ChatAreaProps) {
  const { state, dispatch } = useApp();
  const { models, loadModels } = useModels();
  const { nodes, hasMore, loadedConversationId, loadNodes, loadOlderNodes, refreshVisibleNodes, addNode, addPresetGreetingNodesIfEmpty, updateNode, batchUpdateNodes } = useMessageNodes();
  const { isDistilling, performDistillation } = useDistillation();
  const { scan } = useWorldBookScanner();
  const { packs: stickerPacks, assetUrls: stickerAssetUrls } = useStickerPacks();
  useGlobalStates();
  const [localScribeConfig, setLocalScribeConfig] = React.useState<ScribeConfig>({
    scribeContent: '',
    scribeEnabled: true,
    scribeInterval: 1,
    scribeTriggerInterval: DEFAULT_SCRIBE_TRIGGER_INTERVAL,
    scribeSystemPrompt: SCRIBE_SYSTEM_PROMPT,
    scribeModelId: null,
    scribeCacheWorldBookEnabled: state.scribeCacheWorldBookEnabled,
    mvuEnabled: state.mvuEnabled,
  });
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [imageChannels, setImageChannels] = useState<ImageChannel[]>([]);
  const [imageAnchor, setImageAnchor] = useState<MessageNode | null>(null);
  const [imageContextNodes, setImageContextNodes] = useState<MessageNode[]>([]);
  const [imageRegenerateNode, setImageRegenerateNode] = useState<MessageNode | null>(null);
  const [editingImageTask, setEditingImageTask] = useState<ImageGenerationTask | null>(null);
  const [validationError, setValidationError] = useState('');
  const [isObserving, setIsObserving] = useState(false);
  const [auxiliaryPreview, setAuxiliaryPreview] = useState<Array<{ label: string; modelName: string }>>([]);
  const [corridorNodes, setCorridorNodes] = useState<MessageNode[]>([]);
  const corridorRequestRef = React.useRef(0);
  const presetGreetingLoadingRef = React.useRef(new Set<string>());

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
              scribeCacheWorldBookEnabled: gs?.scribeCacheWorldBookEnabled ?? state.scribeCacheWorldBookEnabled,
              mvuEnabled: gs?.mvuEnabled ?? state.mvuEnabled,
            });
          });
      });
    }
  }, [state.currentConversationId, state.activeView, state.scribeCacheWorldBookEnabled]);

  useEffect(() => { loadModels(); }, [loadModels]);
  useEffect(() => { void import('../../db/stores').then((stores) => stores.getAllImageChannels().then(setImageChannels)); }, []);

  useEffect(() => {
    if (state.currentConversationId) loadNodes(state.currentConversationId);
  }, [state.currentConversationId, loadNodes]);

  useEffect(() => {
    if (!imageTaskRevision || !state.currentConversationId) return;
    void import('../../db/stores').then(async (stores) => {
      const all = await stores.getMessageNodesByConversation(state.currentConversationId!);
      refreshVisibleNodes(all);
    });
  }, [imageTaskRevision, refreshVisibleNodes, state.currentConversationId]);

  useEffect(() => {
    const conversationId = state.currentConversationId;
    if (
      !conversationId ||
      loadedConversationId !== conversationId ||
      hasMore ||
      nodes.length > 0 ||
      presetGreetingLoadingRef.current.has(conversationId)
    ) return;
    if (!characterA?.firstMessage?.trim() && !characterB?.firstMessage?.trim()) return;

    presetGreetingLoadingRef.current.add(conversationId);
    void (async () => {
      const Stores = await import('../../db/stores');
      const [globalState, conversation] = await Promise.all([
        Stores.getGlobalStateByConversation(conversationId),
        Stores.getConversationById(conversationId),
      ]);
      const mvuEnabled = globalState?.mvuEnabled ?? state.mvuEnabled;
      const presetNodes: MessageNode[] = [];

      const createPresetNode = async (
        character: Character,
        role: 'charA' | 'charB',
        timestamp: number
      ): Promise<MessageNode> => {
        const rawContent = replaceSillyTavernUserPlaceholders(
          character.firstMessage!.trim(),
          conversation?.userName
        );
        if (!mvuEnabled) {
          return {
            id: generateId(),
            conversationId,
            role,
            senderName: character.name,
            content: rawContent,
            isArchived: false,
            timestamp,
          };
        }

        const book = character.worldBookId
          ? await Stores.getWorldBookById(character.worldBookId)
          : undefined;
        const initialized = parseMvuInitBooks(book ? [book] : []);
        const parsed = parseMvuResponse(rawContent);
        const scopeId = getMvuScopeId(character.id, role);
        const runtime = replayMvuState([], scopeId, initialized.snapshot, character.id);
        return {
          id: generateId(),
          conversationId,
          role,
          senderName: character.name,
          content: parsed.content || ' ',
          isArchived: false,
          timestamp,
          mvuData: createMvuNodeData(
            scopeId,
            runtime,
            parsed.operations,
            [...initialized.diagnostics, ...parsed.diagnostics]
          ),
        };
      };

      const timestamp = Date.now();
      if (characterA?.firstMessage?.trim()) {
        presetNodes.push(await createPresetNode(characterA, 'charA', timestamp));
      }
      if (characterB?.firstMessage?.trim()) {
        presetNodes.push(await createPresetNode(characterB, 'charB', timestamp + 1));
      }
      if (presetNodes.length > 0) await addPresetGreetingNodesIfEmpty(presetNodes);
    })()
      .catch((error) => console.error('加载角色预设对话失败:', error))
      .finally(() => presetGreetingLoadingRef.current.delete(conversationId));
  }, [
    state.currentConversationId,
    loadedConversationId,
    hasMore,
    nodes.length,
    characterA?.id,
    characterA?.name,
    characterA?.firstMessage,
    characterA?.worldBookId,
    characterB?.id,
    characterB?.name,
    characterB?.firstMessage,
    characterB?.worldBookId,
    userName,
    state.mvuEnabled,
    addPresetGreetingNodesIfEmpty,
  ]);

  useEffect(() => {
    const task = imageTaskToEdit;
    if (!task || task.conversationId !== state.currentConversationId) return;
    void (async () => {
      const Stores = await import('../../db/stores');
      const [all, freshChannels] = await Promise.all([
        Stores.getMessageNodesByConversation(task.conversationId),
        Stores.getAllImageChannels(),
      ]);
      const anchor = all.find((node) => node.id === task.anchorMessageId);
      if (!anchor) {
        setValidationError('该生图任务的原始对话气泡已被删除，无法继续编辑。');
        onImageTaskOpened();
        return;
      }
      setImageChannels(freshChannels);
      setImageContextNodes(all);
      setImageRegenerateNode(task.replaceImageNodeId ? all.find((node) => node.id === task.replaceImageNodeId) || null : null);
      setEditingImageTask(task);
      setImageAnchor(anchor);
      onImageTaskOpened();
    })().catch((error) => {
      setValidationError(error instanceof Error ? error.message : '打开后台生图任务失败。');
      onImageTaskOpened();
    });
  }, [imageTaskToEdit, onImageTaskOpened, state.currentConversationId]);

  const openImageGenerator = useCallback(async (nodeId: string) => {
    if (!state.currentConversationId) return;
    const Stores = await import('../../db/stores');
    const [all, freshChannels] = await Promise.all([
      Stores.getMessageNodesByConversation(state.currentConversationId),
      Stores.getAllImageChannels(),
    ]);
    setImageChannels(freshChannels);
    const target = all.find((node) => node.id === nodeId);
    if (!target) return;
    setImageContextNodes(all);
    setImageRegenerateNode(null);
    setEditingImageTask(null);
    setImageAnchor(target);
  }, [state.currentConversationId]);

  const openImageRegenerator = useCallback(async (node: MessageNode) => {
    if (!state.currentConversationId) return;
    const Stores = await import('../../db/stores');
    const [all, freshChannels] = await Promise.all([
      Stores.getMessageNodesByConversation(state.currentConversationId),
      Stores.getAllImageChannels(),
    ]);
    setImageChannels(freshChannels);
    setImageContextNodes(all);
    setImageRegenerateNode(node);
    setEditingImageTask(null);
    setImageAnchor(all.find((item) => item.id === node.imageData?.generation.anchorMessageId) || null);
  }, [state.currentConversationId]);

  const queueImageGeneration = useCallback(async (generation: ImageGenerationRecord, existingTaskId?: string) => {
    if (!state.currentConversationId || !imageAnchor) throw new Error('找不到图片插入位置，请重新从对话气泡发起生图。');
    await onQueueImageTask({
      conversationId: state.currentConversationId,
      anchorMessageId: imageAnchor.id,
      anchorTimestamp: imageAnchor.timestamp,
      replaceImageNodeId: imageRegenerateNode?.id,
      generation,
    }, existingTaskId);
    setImageAnchor(null);
    setImageContextNodes([]);
    setImageRegenerateNode(null);
    setEditingImageTask(null);
  }, [imageAnchor, imageRegenerateNode?.id, onQueueImageTask, state.currentConversationId]);

  const refreshDistilledNodes = useCallback(async (conversationId: string | null) => {
    const requestId = ++corridorRequestRef.current;
    if (!conversationId) {
      setCorridorNodes([]);
      return;
    }
    const allDistilled = await import('../../db/stores').then((s) =>
      s.queryMessageNodesByConversation(conversationId, {
        roles: ['distilled'],
        order: 'oldest',
      })
    );
    if (requestId !== corridorRequestRef.current) return;
    setCorridorNodes(allDistilled);
  }, []);

  useEffect(() => {
    refreshDistilledNodes(state.currentConversationId);
  }, [state.currentConversationId, refreshDistilledNodes]);

  const getModelById = useCallback(async (id: string) => {
    const all = await import('../../db/stores').then((s) => s.getAllModels());
    return all.find((m) => m.id === id);
  }, []);

  const getNodesByConversation = useCallback(async (convId: string) => {
    const all = await import('../../db/stores').then((s) => s.getMessageNodesByConversation(convId));
    return all;
  }, []);

  const queryNodesByConversation = useCallback(async (convId: string, query: MessageNodeQuery = {}) => {
    return import('../../db/stores').then((s) => s.queryMessageNodesByConversation(convId, query));
  }, []);

  const countNodesByConversation = useCallback(
    async (convId: string, query: Omit<MessageNodeQuery, 'order' | 'limit'> = {}) =>
      import('../../db/stores').then((s) => s.countMessageNodesByConversation(convId, query)),
    []
  );

  const getMessageNodeById = useCallback(async (id: string) => {
    return import('../../db/stores').then((s) => s.getMessageNodeById(id));
  }, []);

  const getMessageNodeMetadataByConversation = useCallback(async (convId: string) => {
    return import('../../db/stores').then((s) => s.getMessageNodeMetadataByConversation(convId));
  }, []);

  // 发送前用本地索引预判本轮是否会串行调用书记 AI 或自动蒸馏。
  useEffect(() => {
    let cancelled = false;
    const conversationId = state.currentConversationId;
    const scribeModelId = localScribeConfig.scribeModelId || state.currentScribeModelId;
    const distillModelId = state.currentDistillModelId;

    if (!conversationId) {
      setAuxiliaryPreview([]);
      return () => { cancelled = true; };
    }

    const refresh = async () => {
      try {
        const [charACount, charBCount, metadata] = await Promise.all([
          characterA
            ? countNodesByConversation(conversationId, { roles: ['charA'], isArchived: false })
            : Promise.resolve(0),
          characterB
            ? countNodesByConversation(conversationId, { roles: ['charB'], isArchived: false })
            : Promise.resolve(0),
          state.distillationConfig.autoTrigger && distillModelId
            ? getMessageNodeMetadataByConversation(conversationId)
            : Promise.resolve([]),
        ]);
        if (cancelled) return;

        const tasks: Array<{ label: string; modelName: string }> = [];
        const modelName = (id: string | null) => models.find((model) => model.id === id)?.name || id || '未命名模型';
        const triggerInterval = state.scribeEngine === 'galgame'
          ? GALGAME_TRIGGER_INTERVAL
          : Math.max(0, localScribeConfig.scribeTriggerInterval);
        const scribeLabel = state.scribeEngine === 'module'
          ? '模块化状态书'
          : state.scribeEngine === 'galgame'
            ? 'Gal/RPG状态书'
            : '状态书';
        const modeAllows = (role: 'charA' | 'charB') =>
          state.scribeMode === 'auto' || state.scribeMode === role;

        if (localScribeConfig.scribeEnabled && scribeModelId && triggerInterval > 0) {
          const scribeTargets = [
            { role: 'charA' as const, name: characterA?.name || '角色A', count: charACount, character: characterA },
            { role: 'charB' as const, name: characterB?.name || '角色B', count: charBCount, character: characterB },
          ].filter((target) => target.character && modeAllows(target.role) && (target.count + 1) % triggerInterval === 0);

          if (scribeTargets.length > 0) {
            tasks.push({
              label: `${scribeLabel}·${scribeTargets.map((target) => target.name).join('/')}`,
              modelName: modelName(scribeModelId),
            });
            if (localScribeConfig.scribeCacheWorldBookEnabled) {
              const cacheTargets = scribeTargets.filter((target) => target.character?.cacheWorldBookId);
              if (cacheTargets.length > 0) {
                tasks.push({
                  label: `缓存世界书维护·${cacheTargets.map((target) => target.name).join('/')}`,
                  modelName: modelName(scribeModelId),
                });
              }
            }
          }
        }

        if (state.distillationConfig.autoTrigger && distillModelId) {
          const now = Date.now();
          const projectedPlan = planDistillation(
            [
              ...metadata,
              { id: '__preflight_user__', timestamp: now, role: 'user' as const, isArchived: false },
              { id: '__preflight_assistant__', timestamp: now + 1, role: 'charA' as const, isArchived: false },
            ],
            state.distillationConfig.triggerThreshold,
            state.distillationConfig.retainRecentCount
          );
          if (projectedPlan) {
            tasks.push({ label: '记忆蒸馏', modelName: modelName(distillModelId) });
          }
        }

        setAuxiliaryPreview(tasks);
      } catch {
        if (!cancelled) setAuxiliaryPreview([]);
      }
    };

    void refresh();
    return () => { cancelled = true; };
  }, [
    characterA,
    characterB,
    countNodesByConversation,
    getMessageNodeMetadataByConversation,
    localScribeConfig.scribeCacheWorldBookEnabled,
    localScribeConfig.scribeEnabled,
    localScribeConfig.scribeModelId,
    localScribeConfig.scribeTriggerInterval,
    models,
    state.currentConversationId,
    state.currentDistillModelId,
    state.currentScribeModelId,
    state.distillationConfig.autoTrigger,
    state.distillationConfig.retainRecentCount,
    state.distillationConfig.triggerThreshold,
    state.scribeEngine,
    state.scribeMode,
  ]);

  const commitDistillationBatch = useCallback(async (sourceIds: string[], distilledNode: MessageNode) => {
    return import('../../db/stores').then((s) => s.commitDistillationBatch(sourceIds, distilledNode));
  }, []);

  const updateConversation = useCallback(async (id: string, updates: any) => {
    await import('../../db/stores').then((s) => s.updateConversation(id, updates));
  }, []);

  const resolveReplyTarget = (sorted: MessageNode[], userIndex: number): SendTarget | null => {
    const originalTarget = sorted[userIndex]?.replyTarget;
    if (originalTarget === 'charA' && characterA?.id) return { type: 'charA', characterId: characterA.id };
    if (originalTarget === 'charB' && characterB?.id) return { type: 'charB', characterId: characterB.id };
    // 优先沿用该 user 节点紧邻的 AI 回复角色；回复已被删除时回退到角色 A。
    for (let index = userIndex + 1; index < sorted.length; index += 1) {
      const node = sorted[index];
      if (node.role === 'user') break;
      if (node.role === 'charA' && characterA?.id) return { type: 'charA', characterId: characterA.id };
      if (node.role === 'charB' && characterB?.id) return { type: 'charB', characterId: characterB.id };
    }
    if (characterA?.id) return { type: 'charA', characterId: characterA.id };
    if (characterB?.id) return { type: 'charB', characterId: characterB.id };
    return null;
  };

  const handleRetry = async (nodeId: string) => {
    if (!state.currentConversationId) return;
    if (chat.streaming) {
      setValidationError('当前仍有 AI 回复生成中，请等待完成或先停止生成。');
      return;
    }
    const Stores = await import('../../db/stores');
    const allNodes = await getNodesByConversation(state.currentConversationId);
    const sorted = [...allNodes].sort((a, b) => a.timestamp - b.timestamp);
    const idx = sorted.findIndex((n) => n.id === nodeId);
    if (idx === -1) return;

    const targetNode = sorted[idx];
    if (targetNode.role !== 'charA' && targetNode.role !== 'charB' && targetNode.role !== 'user') return;

    // AI 重试向前找 user；玩家消息重发则直接复用当前节点。
    const userIdx = targetNode.role === 'user'
      ? idx
      : sorted.slice(0, idx).reduce((last, node, index) => node.role === 'user' ? index : last, -1);
    const userContent = userIdx >= 0 ? sorted[userIdx].content : '';
    if (userIdx === -1 || !userContent) {
      setValidationError('找不到要重发的 user 消息');
      return;
    }
    const userNodeId = sorted[userIdx].id;
    const target = targetNode.role === 'user'
      ? resolveReplyTarget(sorted, userIdx)
      : targetNode.role === 'charA'
        ? (characterA?.id ? { type: 'charA' as const, characterId: characterA.id } : null)
        : (characterB?.id ? { type: 'charB' as const, characterId: characterB.id } : null);
    if (!target) {
      setValidationError('找不到可用的回复角色，请先绑定角色 A 或角色 B。');
      return;
    }

    // AI 重试删除自身及后续；玩家重发保留当前 user，仅删除其后的旧回复。
    const deleteFrom = targetNode.role === 'user' ? idx + 1 : idx;
    const toDelete = sorted.slice(deleteFrom).map((n) => n.id);
    for (const id of toDelete) {
      await Stores.deleteMessageNode(id);
    }

    // 复用既有 user 节点，不再插入重复的玩家消息。
    await chat.sendMessage(target, userContent, {
      skipUserNode: true,
      existingUserNodeId: userNodeId,
    });
    loadNodes(state.currentConversationId);
  };

  const handleCopySend = async (nodeId: string) => {
    if (!state.currentConversationId) return;
    if (chat.streaming) {
      setValidationError('当前仍有 AI 回复生成中，请等待完成或先停止生成。');
      return;
    }
    const allNodes = await getNodesByConversation(state.currentConversationId);
    const sorted = [...allNodes].sort((a, b) => a.timestamp - b.timestamp);
    const idx = sorted.findIndex((node) => node.id === nodeId && node.role === 'user');
    if (idx === -1) return;
    const userContent = sorted[idx].content.trim();
    const target = resolveReplyTarget(sorted, idx);
    if (!userContent || !target) {
      setValidationError('找不到可用的回复角色，请先绑定角色 A 或角色 B。');
      return;
    }
    // 复制发送保留原时间线，并在末尾新增一条相同的 user 消息。
    await chat.sendMessage(target, userContent);
    loadNodes(state.currentConversationId);
  };

  const handleDelete = async (nodeId: string) => {
    await import('../../db/stores').then((s) => s.deleteMessageNode(nodeId));
    if (state.currentConversationId) loadNodes(state.currentConversationId);
  };

  const handleEdit = async (nodeId: string, newContent: string, newScribeText?: string, newGalgameData?: any, newModuleRpgData?: any) => {
    const updates: any = { content: newContent, stickerUsages: undefined };
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
    if (newModuleRpgData) {
      updates.moduleRpgData = newModuleRpgData;
    }
    await import('../../db/stores').then((s) => s.updateMessageNode(nodeId, updates));
    if (state.currentConversationId) loadNodes(state.currentConversationId);
  };

  const handleEditDistilled = useCallback(async (nodeId: string, content: string) => {
    const nextContent = content.trim();
    if (!nextContent) throw new Error('记忆结晶内容不能为空');
    const existing = await import('../../db/stores').then((s) => s.getMessageNodeById(nodeId));
    if (!existing || existing.role !== 'distilled') throw new Error('找不到对应的记忆结晶');
    await updateNode(nodeId, { content: nextContent });
    setCorridorNodes((prev) => prev.map((node) => node.id === nodeId ? { ...node, content: nextContent } : node));
  }, [updateNode]);

  const handleDistillationComplete = useCallback(() => {
    refreshDistilledNodes(state.currentConversationId);
  }, [refreshDistilledNodes, state.currentConversationId]);

  const handleExportPrompt = (nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    const promptData = node?.debugPrompt;
    if (!promptData || promptData.length === 0) {
      alert('此消息没有可导出的 Prompt 快照。请先开启调试模式再发送新消息。');
      return;
    }

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

  const handleExportResponse = (nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    const responseData = node?.debugResponse;
    if (!responseData) {
      alert('此消息没有可导出的原始返回。请先开启调试模式，再生成一条新回复。');
      return;
    }

    const charName = node.role === 'charA'
      ? (characterA?.name || 'character-A')
      : node.role === 'charB'
        ? (characterB?.name || 'character-B')
        : 'unknown';
    const blob = new Blob([JSON.stringify(responseData, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const link = document.createElement('a');
    link.href = url;
    link.download = `response_debug_${charName}_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Message bubbles are memoized. Keep their action props stable while delegating to
  // the latest closures so streaming updates do not re-render every historical bubble.
  const messageActionRef = React.useRef({
    retry: handleRetry,
    copySend: handleCopySend,
    deleteNode: handleDelete,
    edit: handleEdit,
    exportPrompt: handleExportPrompt,
    exportResponse: handleExportResponse,
  });
  messageActionRef.current = {
    retry: handleRetry,
    copySend: handleCopySend,
    deleteNode: handleDelete,
    edit: handleEdit,
    exportPrompt: handleExportPrompt,
    exportResponse: handleExportResponse,
  };
  const stableHandleRetry = useCallback((nodeId: string) => messageActionRef.current.retry(nodeId), []);
  const stableHandleCopySend = useCallback((nodeId: string) => messageActionRef.current.copySend(nodeId), []);
  const stableHandleDelete = useCallback((nodeId: string) => messageActionRef.current.deleteNode(nodeId), []);
  const stableHandleEdit = useCallback(
    (nodeId: string, content: string, scribeText?: string, galgameData?: any, moduleRpgData?: any) =>
      messageActionRef.current.edit(nodeId, content, scribeText, galgameData, moduleRpgData),
    []
  );
  const stableHandleExportPrompt = useCallback(
    (nodeId: string) => messageActionRef.current.exportPrompt(nodeId),
    []
  );
  const stableHandleExportResponse = useCallback(
    (nodeId: string) => messageActionRef.current.exportResponse(nodeId),
    []
  );

  const onNodesRefresh = useCallback((newNodes: MessageNode[]) => {
    refreshVisibleNodes(newNodes);
  }, [refreshVisibleNodes]);

  // useMemo 稳定 deps 引用：只有字段值变化时才产生新对象，
  // 避免 ChatArea 每帧构造新对象导致 useChat 内所有 useCallback 整链重建。
  const chatDeps = useMemo(() => ({
    conversationId: state.currentConversationId,
    userName,
    userDescription,
    characterA,
    characterB,
    charAModelId: state.currentCharAModelId,
    charBModelId: state.currentCharBModelId,
    distillModelId: state.currentDistillModelId,
    scribeModelId: localScribeConfig.scribeModelId || state.currentScribeModelId,
    scribeEnabled: localScribeConfig.scribeEnabled,
    scribeCacheWorldBookEnabled: localScribeConfig.scribeCacheWorldBookEnabled,
    mvuEnabled: localScribeConfig.mvuEnabled,
    scribeTriggerInterval: localScribeConfig.scribeTriggerInterval,
    scribeRounds: state.scribeRounds,
    scribeMode: state.scribeMode,
    scribeEngine: state.scribeEngine,
    galgamePrompt: state.galgamePrompt,
    moduleRpgConfig: state.moduleRpgConfig,
    moduleRpgPrompt: state.moduleRpgPrompt,
    scribeSystemPrompt: localScribeConfig.scribeSystemPrompt,
    thinkingEnabled: state.thinkingEnabled,
    streamingEnabled: state.streamingEnabled,
    debugMode: state.debugMode,
    stickerEnabled: state.stickerEnabled,
    stickerMaxCount: state.stickerMaxCount,
    stickerPackA: stickerPacks.find((pack) => pack.id === stickerPackAId) || null,
    stickerPackB: stickerPacks.find((pack) => pack.id === stickerPackBId) || null,
    recentRounds: state.contextConfig.recentRounds,
    worldBookScanDepth: state.contextConfig.worldBookScanDepth,
    maxInjectedMemories: state.contextConfig.maxInjectedMemories,
    maxWorldBookEntries: state.contextConfig.maxWorldBookEntries,
    autoTriggerDistillation: state.distillationConfig.autoTrigger,
    triggerThreshold: state.distillationConfig.triggerThreshold,
    retainRecentCount: state.distillationConfig.retainRecentCount,
    distillationPrompt: state.distillationConfig.distillationPrompt,
    getModelById,
    addMessageNode: addNode,
    updateMessageNode: updateNode,
    batchUpdateNodes,
    queryNodesByConversation,
    countNodesByConversation,
    getMessageNodeById,
    getNodesByConversation,
    getMessageNodeMetadataByConversation,
    commitDistillationBatch,
    scanWorldBook: scan,
    performDistillation: performDistillation as any,
    updateConversation,
    onNodesRefresh,
    onDistillationComplete: handleDistillationComplete,
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
    tplCacheWorldBookPrompt: state.tplCacheWorldBookPrompt,
    tplStickerPrompt: state.tplStickerPrompt,
    tplMvuPrompt: state.tplMvuPrompt,
    tplMvuFallbackPrompt: state.tplMvuFallbackPrompt,
  }), [
    state.currentConversationId,
    userName,
    userDescription,
    characterA,
    characterB,
    state.currentCharAModelId,
    state.currentCharBModelId,
    state.currentDistillModelId,
    localScribeConfig.scribeModelId,
    localScribeConfig.scribeEnabled,
    localScribeConfig.scribeCacheWorldBookEnabled,
    localScribeConfig.mvuEnabled,
    localScribeConfig.scribeTriggerInterval,
    localScribeConfig.scribeSystemPrompt,
    state.currentScribeModelId,
    state.scribeMode,
    state.scribeEngine,
    state.galgamePrompt,
    state.thinkingEnabled, state.streamingEnabled,
    state.debugMode,
    state.stickerEnabled,
    state.stickerMaxCount,
    stickerPacks,
    stickerPackAId,
    stickerPackBId,
    state.contextConfig.recentRounds,
    state.contextConfig.worldBookScanDepth,
    state.contextConfig.maxInjectedMemories,
    state.contextConfig.maxWorldBookEntries,
    state.distillationConfig.autoTrigger,
    state.distillationConfig.triggerThreshold,
    state.distillationConfig.retainRecentCount,
    state.distillationConfig.distillationPrompt,
    state.tplUserWrapper, state.tplOtherCharWrapper, state.tplIdentityAnchor,
    state.tplWorldBookPrefix, state.tplDistilledPrefix, state.tplStateBookPrefix,
    state.tplEavesdropAppend, state.tplGalgameCharInjection,
    state.tplImplantMemoryPrefix, state.tplImplantScribePrefix, state.tplDistilledNodePrefix,
    state.tplCacheWorldBookPrompt,
    state.tplStickerPrompt,
    state.tplMvuPrompt,
    state.tplMvuFallbackPrompt,
    // 以下函数均经各自 hook 的 useCallback 稳定化，引用不变
    getModelById,
    addNode,
    updateNode,
    batchUpdateNodes,
    queryNodesByConversation,
    countNodesByConversation,
    getMessageNodeById,
    getNodesByConversation,
    getMessageNodeMetadataByConversation,
    commitDistillationBatch,
    scan,
    performDistillation,
    updateConversation,
    onNodesRefresh,
    handleDistillationComplete,
  ]);

  const chat = useChat(chatDeps);

  /**
   * 双角色互相认识：分别由角色 A/B 绑定模型观察对方角色卡，提取外部可观察特征
   * 生成两条世界书条目，分别插入对应角色的世界书中
   */
  const handleMutualObserve = useCallback(async () => {
    if (!characterA || !characterB || !state.currentCharAModelId || !state.currentCharBModelId) {
      setValidationError('请先选择角色A、角色B及各自绑定的模型');
      return;
    }
    setIsObserving(true);
    try {
      const Stores = await import('../../db/stores');
      const [modelA, modelB] = await Promise.all([
        Stores.getModelById(state.currentCharAModelId),
        Stores.getModelById(state.currentCharBModelId),
      ]);
      if (!modelA || !modelB) throw new Error('角色绑定模型未找到');

      // AI 观察提示词：使用用户自定义或默认
      const observeTemplate = state.mutualObservePrompt || DEFAULT_MUTUAL_OBSERVE_PROMPT;
      const OBSERVE_PROMPT = (charPrompt: string) =>
        observeTemplate.replace('{charPrompt}', charPrompt);

      // 串行发起两个观察请求（智谱等限速严格的 API 会因并发 429）
      const obsB_forA = await apiFetch(modelA.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${modelA.apiKey}` },
        body: JSON.stringify({
          model: modelA.defaultModel,
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
      );
      const obsA_forB = await apiFetch(modelB.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${modelB.apiKey}` },
        body: JSON.stringify({
          model: modelB.defaultModel,
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
      );

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
          const newWb = { id: wbId, name: `${observer.name}的世界书`, kind: 'manual' as const, entries: [] };
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
  }, [characterA, characterB, state.currentCharAModelId, state.currentCharBModelId, state.mutualObservePrompt]);

  // 合并错误：chat.error 和 validationError
  const activeError = validationError || chat.error || '';

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <MessageList
        conversationId={state.currentConversationId}
        loadedConversationId={loadedConversationId}
        nodes={nodes}
        hasMore={hasMore}
        onLoadOlder={() => {
          if (state.currentConversationId) return loadOlderNodes(state.currentConversationId);
          return Promise.resolve();
        }}
        characterAName={characterA?.name || '角色A'}
        characterBName={characterB?.name || '角色B'}
        avatarA={characterA?.avatar || '🤖'}
        avatarB={characterB?.avatar || '🤖'}
        streamingContent={chat.streamingContent}
        streamingTarget={chat.streamingTarget?.type || ''}
        onBranch={onBranch}
        onRetry={stableHandleRetry}
        onCopySend={stableHandleCopySend}
        onDelete={stableHandleDelete}
        onEdit={stableHandleEdit}
        debugMode={state.debugMode}
        onExportPrompt={stableHandleExportPrompt}
        onExportResponse={stableHandleExportResponse}
        onGenerateImage={openImageGenerator}
        onRegenerateImage={openImageRegenerator}
        boldColorize={state.boldColorize}
        stickerEnabled={state.stickerEnabled}
        stickerAssetUrls={stickerAssetUrls}
        streamingStickerPack={chat.streamingTarget?.type === 'charA'
          ? stickerPacks.find((pack) => pack.id === stickerPackAId) || null
          : stickerPacks.find((pack) => pack.id === stickerPackBId) || null}
        stickerMaxCount={state.stickerMaxCount}
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
        charAModelId={state.currentCharAModelId}
        charBModelId={state.currentCharBModelId}
        charAModelName={models.find((m) => m.id === state.currentCharAModelId)?.name || null}
        charBModelName={models.find((m) => m.id === state.currentCharBModelId)?.name || null}
        thinkingEnabled={state.thinkingEnabled}
        onToggleThinking={() => dispatch({ type: 'TOGGLE_THINKING' })}
        streamingEnabled={state.streamingEnabled}
        onToggleStreaming={() => dispatch({ type: 'TOGGLE_STREAMING' })}
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
        scribeModelName={models.find((model) => model.id === (localScribeConfig.scribeModelId || state.currentScribeModelId))?.name || null}
        distillModelName={models.find((model) => model.id === state.currentDistillModelId)?.name || null}
        auxiliaryPreview={auxiliaryPreview}
        onSend={chat.sendMessage}
        onEavesdrop={chat.sendMessageToBoth}
        onDistill={chat.triggerDistillation}
        onStop={chat.abortStream}
        onScribeClick={() => dispatch({ type: 'SET_VIEW', view: 'statebook' })}
        onOpenSelector={() => setSelectorOpen(true)}
        onError={setValidationError}
        onMutualObserve={handleMutualObserve}
        isObserving={isObserving}
        onOpenMemoryCorridor={() => refreshDistilledNodes(state.currentConversationId)}
        onEditDistilled={handleEditDistilled}
        distilledNodes={corridorNodes}
        stickerPacks={stickerPacks}
        stickerEnabled={state.stickerEnabled}
        stickerPackAId={stickerPackAId}
        stickerPackBId={stickerPackBId}
        onStickerBindingsChange={onStickerBindingsChange}
      />

      {/* 角色 & 模型选择弹窗 */}
      <ImageGenerateModal
        open={Boolean(imageAnchor)}
        anchor={imageAnchor}
        nodes={imageContextNodes.length ? imageContextNodes : nodes}
        channel={imageChannels.find((item) => item.id === state.currentImageChannelId) || null}
        promptModel={models.find((item) => item.id === state.currentImagePromptModelId) || null}
        characterA={characterA}
        characterB={characterB}
        template={state.tplImagePrompt || DEFAULT_TPL_IMAGE_PROMPT}
        initial={editingImageTask?.generation || imageRegenerateNode?.imageData?.generation || null}
        task={editingImageTask}
        onClose={() => { setImageAnchor(null); setImageContextNodes([]); setImageRegenerateNode(null); setEditingImageTask(null); }}
        onQueue={queueImageGeneration}
        onCancelTask={onCancelImageTask}
      />

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
            charAModelId={state.currentCharAModelId}
            charBModelId={state.currentCharBModelId}
            onCharAModelChange={(id) => dispatch({ type: 'SET_CHAR_A_MODEL', id })}
            onCharBModelChange={(id) => dispatch({ type: 'SET_CHAR_B_MODEL', id })}
          />
          <div className="flex justify-end">
            <Button onClick={() => setSelectorOpen(false)}>完成</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
