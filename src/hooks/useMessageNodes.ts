import { useState, useCallback, useRef } from 'react';
import type { MessageNode, Conversation } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';

const MAX_CACHED_CONVERSATIONS = 8;
const sessionVisibleNodesCache = new Map<string, { nodes: MessageNode[]; hasMore: boolean }>();

export function useMessageNodes() {
  const [nodes, setNodes] = useState<MessageNode[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null);
  const activeConversationRef = useRef<string | null>(null);
  const loadRequestRef = useRef(0);
  const hasMoreRef = useRef(false);
  const visibleNodesCacheRef = useRef(sessionVisibleNodesCache);

  const cacheVisibleNodes = useCallback((conversationId: string, nextNodes: MessageNode[], nextHasMore = hasMoreRef.current) => {
    const cache = visibleNodesCacheRef.current;
    cache.delete(conversationId);
    cache.set(conversationId, { nodes: nextNodes, hasMore: nextHasMore });
    if (cache.size > MAX_CACHED_CONVERSATIONS) {
      const oldestConversationId = cache.keys().next().value;
      if (oldestConversationId) cache.delete(oldestConversationId);
    }
  }, []);

  const loadNodes = useCallback(async (conversationId: string) => {
    const requestId = ++loadRequestRef.current;
    const cached = visibleNodesCacheRef.current.get(conversationId);
    if (cached && activeConversationRef.current !== conversationId) {
      activeConversationRef.current = conversationId;
      hasMoreRef.current = cached.hasMore;
      setNodes(cached.nodes);
      setHasMore(cached.hasMore);
      setLoadedConversationId(conversationId);
      return;
    }
    try {
      const page = await Stores.getMessageNodesPageByConversation(conversationId);
      if (requestId !== loadRequestRef.current) return;
      activeConversationRef.current = conversationId;
      hasMoreRef.current = page.hasMore;
      cacheVisibleNodes(conversationId, page.nodes, page.hasMore);
      setNodes(page.nodes);
      setHasMore(page.hasMore);
      setLoadedConversationId(conversationId);
    } catch (e) {
      console.error('loadNodes failed:', e);
    }
  }, [cacheVisibleNodes]);

  const loadOlderNodes = useCallback(async (conversationId: string) => {
    if (!hasMore || activeConversationRef.current !== conversationId) return;
    const oldest = nodes[0];
    if (!oldest) return;
    const page = await Stores.getMessageNodesPageByConversation(conversationId, {
      timestamp: oldest.timestamp,
      id: oldest.id,
    });
    if (activeConversationRef.current !== conversationId) return;
    setNodes((prev) => {
      const nextNodes = [...page.nodes, ...prev];
      hasMoreRef.current = page.hasMore;
      cacheVisibleNodes(conversationId, nextNodes, page.hasMore);
      return nextNodes;
    });
    setHasMore(page.hasMore);
  }, [cacheVisibleNodes, hasMore, nodes]);

  /** Updates the currently visible window without reintroducing the full conversation into React state. */
  const refreshVisibleNodes = useCallback((allNodes: MessageNode[]) => {
    setNodes((prev) => {
      if (prev.length === 0) return prev;
      const byId = new Map(allNodes.map((node) => [node.id, node]));
      const knownIds = new Set(prev.map((node) => node.id));
      const newestVisibleTimestamp = prev[prev.length - 1]?.timestamp ?? 0;
      const appended = allNodes.filter((node) => !knownIds.has(node.id) && node.timestamp >= newestVisibleTimestamp);
      const nextNodes = [...prev.map((node) => byId.get(node.id) || node), ...appended]
        .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
      if (activeConversationRef.current) cacheVisibleNodes(activeConversationRef.current, nextNodes);
      return nextNodes;
    });
  }, [cacheVisibleNodes]);

  const addNode = useCallback(async (node: MessageNode) => {
    await Stores.addMessageNode(node);
    if (activeConversationRef.current === node.conversationId) {
      setNodes((prev) => {
        const nextNodes = [...prev, node];
        cacheVisibleNodes(node.conversationId, nextNodes);
        return nextNodes;
      });
    }
  }, [cacheVisibleNodes]);

  const addPresetGreetingNodesIfEmpty = useCallback(async (initialNodes: MessageNode[]): Promise<boolean> => {
    const added = await Stores.addPresetGreetingNodesIfEmpty(initialNodes);
    if (!added || initialNodes.length === 0) return false;

    const conversationId = initialNodes[0].conversationId;
    if (activeConversationRef.current === conversationId) {
      setNodes((prev) => {
        const knownIds = new Set(prev.map((node) => node.id));
        const nextNodes = [...prev, ...initialNodes.filter((node) => !knownIds.has(node.id))]
          .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
        cacheVisibleNodes(conversationId, nextNodes);
        return nextNodes;
      });
    }
    return true;
  }, [cacheVisibleNodes]);

  const updateNode = useCallback(async (id: string, updates: Partial<MessageNode>) => {
    await Stores.updateMessageNode(id, updates);
    setNodes((prev) => {
      const nextNodes = prev.map((n) => (n.id === id ? { ...n, ...updates } : n));
      if (activeConversationRef.current) cacheVisibleNodes(activeConversationRef.current, nextNodes);
      return nextNodes;
    });
  }, [cacheVisibleNodes]);

  const batchUpdateNodes = useCallback(
    async (updates: Array<{ id: string; changes: Partial<MessageNode> }>) => {
      await Stores.updateMessageNodes(updates);
      const changesById = new Map(updates.map((update) => [update.id, update.changes]));
      setNodes((prev) => {
        const nextNodes = prev.map((node) => {
          const changes = changesById.get(node.id);
          return changes ? { ...node, ...changes } : node;
        });
        if (activeConversationRef.current) cacheVisibleNodes(activeConversationRef.current, nextNodes);
        return nextNodes;
      });
    },
    [cacheVisibleNodes]
  );

  const getUnarchivedNodes = useCallback((): MessageNode[] => {
    return nodes.filter((n) => !n.isArchived && n.role !== 'distilled' && n.role !== 'image');
  }, [nodes]);

  const getDistilledNodes = useCallback((): MessageNode[] => {
    return nodes.filter((n) => n.role === 'distilled');
  }, [nodes]);

  /**
   * 分支操作：克隆当前对话中 branchPointNode 及其之前的所有消息到新对话。
   * 返回新对话对象，调用方负责切换视图。
   */
  const cloneToNewConversation = useCallback(
    async (
      branchPointId: string,
      sourceConversation: Conversation
    ): Promise<Conversation | null> => {
      try {
        // 1. 获取源对话所有消息，按时间排序
        const allNodes = await Stores.getMessageNodesByConversation(sourceConversation.id);
        const sorted = [...allNodes].sort((a, b) => a.timestamp - b.timestamp);

        const branchIdx = sorted.findIndex((n) => n.id === branchPointId);
        if (branchIdx === -1) return null;

        // 2. 取分支点及之前的所有消息
        const upstream = sorted.slice(0, branchIdx + 1);

        // 3. 创建新对话
        const newConv: Conversation = {
          id: generateId(),
          title: `${sourceConversation.title} (分支)`,
          characterAId: sourceConversation.characterAId,
          characterBId: sourceConversation.characterBId,
          stickerPackAId: sourceConversation.stickerPackAId,
          stickerPackBId: sourceConversation.stickerPackBId,
        };
        await Stores.addConversation(newConv);

        // 4. 克隆消息到新对话（新 ID），批量写入一次 I/O
        const clonedNodes: MessageNode[] = [];
        for (const n of upstream) {
          clonedNodes.push({
            ...n,
            id: generateId(),
            conversationId: newConv.id,
          });
        }
        await Stores.addMessageNodes(clonedNodes);

        // 5. 如果有 Scribe 状态书，也克隆过去
        const sourceState = await Stores.getGlobalStateByConversation(sourceConversation.id);
        if (sourceState) {
          await Stores.setGlobalState({
            ...sourceState,
            conversationId: newConv.id,
          });
        }

        return newConv;
      } catch (e) {
        console.error('cloneToNewConversation failed:', e);
        return null;
      }
    },
    []
  );

  return {
    nodes,
    hasMore,
    loadedConversationId,
    loadNodes,
    loadOlderNodes,
    refreshVisibleNodes,
    addNode,
    addPresetGreetingNodesIfEmpty,
    updateNode,
    batchUpdateNodes,
    getUnarchivedNodes,
    getDistilledNodes,
    cloneToNewConversation,
  };
}
