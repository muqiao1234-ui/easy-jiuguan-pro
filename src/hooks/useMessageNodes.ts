import { useState, useCallback, useRef } from 'react';
import type { MessageNode, Conversation } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';

export function useMessageNodes() {
  const [nodes, setNodes] = useState<MessageNode[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const activeConversationRef = useRef<string | null>(null);
  const loadRequestRef = useRef(0);

  const loadNodes = useCallback(async (conversationId: string) => {
    const requestId = ++loadRequestRef.current;
    try {
      const page = await Stores.getMessageNodesPageByConversation(conversationId);
      if (requestId !== loadRequestRef.current) return;
      activeConversationRef.current = conversationId;
      setNodes(page.nodes);
      setHasMore(page.hasMore);
    } catch (e) {
      console.error('loadNodes failed:', e);
    }
  }, []);

  const loadOlderNodes = useCallback(async (conversationId: string) => {
    if (!hasMore || activeConversationRef.current !== conversationId) return;
    const oldest = nodes[0];
    if (!oldest) return;
    const page = await Stores.getMessageNodesPageByConversation(conversationId, {
      timestamp: oldest.timestamp,
      id: oldest.id,
    });
    if (activeConversationRef.current !== conversationId) return;
    setNodes((prev) => [...page.nodes, ...prev]);
    setHasMore(page.hasMore);
  }, [hasMore, nodes]);

  /** Updates the currently visible window without reintroducing the full conversation into React state. */
  const refreshVisibleNodes = useCallback((allNodes: MessageNode[]) => {
    setNodes((prev) => {
      if (prev.length === 0) return prev;
      const byId = new Map(allNodes.map((node) => [node.id, node]));
      const knownIds = new Set(prev.map((node) => node.id));
      const newestVisibleTimestamp = prev[prev.length - 1]?.timestamp ?? 0;
      const appended = allNodes.filter((node) => !knownIds.has(node.id) && node.timestamp >= newestVisibleTimestamp);
      return [...prev.map((node) => byId.get(node.id) || node), ...appended]
        .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    });
  }, []);

  const addNode = useCallback(async (node: MessageNode) => {
    await Stores.addMessageNode(node);
    if (activeConversationRef.current === node.conversationId) {
      setNodes((prev) => [...prev, node]);
    }
  }, []);

  const updateNode = useCallback(async (id: string, updates: Partial<MessageNode>) => {
    await Stores.updateMessageNode(id, updates);
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
  }, []);

  const batchUpdateNodes = useCallback(
    async (updates: Array<{ id: string; changes: Partial<MessageNode> }>) => {
      await Stores.updateMessageNodes(updates);
      const changesById = new Map(updates.map((update) => [update.id, update.changes]));
      setNodes((prev) =>
        prev.map((node) => {
          const changes = changesById.get(node.id);
          return changes ? { ...node, ...changes } : node;
        })
      );
    },
    []
  );

  const getUnarchivedNodes = useCallback((): MessageNode[] => {
    return nodes.filter((n) => !n.isArchived && n.role !== 'distilled');
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
            conversationId: newConv.id,
            scribeContent: sourceState.scribeContent,
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
    loadNodes,
    loadOlderNodes,
    refreshVisibleNodes,
    addNode,
    updateNode,
    batchUpdateNodes,
    getUnarchivedNodes,
    getDistilledNodes,
    cloneToNewConversation,
  };
}
