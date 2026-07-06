import { useState, useCallback, useMemo } from 'react';
import type { Conversation } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const currentConversation = useMemo(
    () => conversations.find((c) => c.id === currentId) || null,
    [conversations, currentId]
  );

  const loadConversations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await Stores.getAllConversations();
      setConversations(data);
    } catch (e) {
      console.error('loadConversations failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const createConversation = useCallback(
    async (title: string, characterAId: string, characterBId: string) => {
      const conv: Conversation = {
        id: generateId(),
        title,
        characterAId,
        characterBId,
      };
      await Stores.addConversation(conv);

      // 创建 GlobalState
      await Stores.setGlobalState({
        conversationId: conv.id,
        scribeContent: '',
      });

      setConversations((prev) => [...prev, conv]);
      setCurrentId(conv.id);
      return conv;
    },
    []
  );

  const addConversationDirect = useCallback((conv: Conversation) => {
    setConversations((prev) => [...prev, conv]);
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      // IndexedDB 不支持事务性操作（无法原子地跨多个 store 回滚）。
      // 因此用 best-effort 策略：每个清理步骤独立 catch，一个失败不禁
      // 止后续步骤继续执行，最大限度减少孤儿数据残留。
      // 同时无论清理结果如何，UI 状态都会更新，因为用户已确认删除。

      const errors: string[] = [];

      try {
        await Stores.deleteConversation(id);
      } catch (e) {
        errors.push(`会话记录: ${e instanceof Error ? e.message : String(e)}`);
        console.error('[deleteConversation] 删除会话失败:', e);
      }

      try {
        await Stores.deleteMessageNodesByConversation(id);
      } catch (e) {
        errors.push(`消息节点: ${e instanceof Error ? e.message : String(e)}`);
        console.error('[deleteConversation] 删除消息节点失败:', e);
      }

      try {
        await Stores.deleteGlobalState(id);
      } catch (e) {
        errors.push(`全局状态: ${e instanceof Error ? e.message : String(e)}`);
        console.error('[deleteConversation] 删除全局状态失败:', e);
      }

      if (errors.length > 0) {
        console.warn(
          `[deleteConversation] 部分清理失败 (${errors.length}/3): ${errors.join('; ')}。` +
          '会话已从列表中移除，但可能残留部分数据。如需彻底清理，请在设置中重新导入数据。'
        );
      }

      // 无论清理是否完全成功，都从 UI 中移除该会话
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentId === id) setCurrentId(null);
    },
    [currentId]
  );

  const setCurrentConversation = useCallback((id: string | null) => {
    setCurrentId(id);
  }, []);

  return {
    conversations,
    currentConversation,
    currentId,
    loading,
    loadConversations,
    createConversation,
    addConversationDirect,
    deleteConversation,
    setCurrentConversation,
  };
}
