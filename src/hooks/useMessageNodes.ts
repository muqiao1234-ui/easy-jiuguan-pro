import { useState, useCallback } from 'react';
import type { MessageNode, Conversation } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';

export function useMessageNodes() {
  const [nodes, setNodes] = useState<MessageNode[]>([]);

  const loadNodes = useCallback(async (conversationId: string) => {
    try {
      const data = await Stores.getMessageNodesByConversation(conversationId);
      setNodes(data);
    } catch (e) {
      console.error('loadNodes failed:', e);
    }
  }, []);

  const addNode = useCallback(async (node: MessageNode) => {
    await Stores.addMessageNode(node);
    setNodes((prev) => [...prev, node]);
  }, []);

  const updateNode = useCallback(async (id: string, updates: Partial<MessageNode>) => {
    await Stores.updateMessageNode(id, updates);
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
  }, []);

  const batchUpdateNodes = useCallback(
    async (updates: Array<{ id: string; changes: Partial<MessageNode> }>) => {
      await Stores.updateMessageNodes(updates);
      setNodes((prev) =>
        prev.map((n) => {
          const u = updates.find((x) => x.id === n.id);
          return u ? { ...n, ...u.changes } : n;
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
    loadNodes,
    addNode,
    updateNode,
    batchUpdateNodes,
    getUnarchivedNodes,
    getDistilledNodes,
    cloneToNewConversation,
  };
}
