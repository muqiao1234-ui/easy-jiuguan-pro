import { useState, useCallback, useMemo } from 'react';
import type { Conversation, ConversationFolder } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';

function normalizeConversationFolders(
  folders: ConversationFolder[],
  conversations: Conversation[]
): ConversationFolder[] {
  const validConversationIds = new Set(conversations.map((c) => c.id));
  const assigned = new Set<string>();

  return folders.map((folder) => {
    const rawIds = Array.isArray(folder.conversationIds) ? folder.conversationIds : [];
    const conversationIds = rawIds.filter((id) => {
      if (!validConversationIds.has(id) || assigned.has(id)) return false;
      assigned.add(id);
      return true;
    });
    return {
      ...folder,
      name: folder.name?.trim() || '未命名文件夹',
      conversationIds,
      isCollapsed: folder.isCollapsed ?? false,
      createdAt: folder.createdAt || 0,
    };
  });
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [folders, setFolders] = useState<ConversationFolder[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const currentConversation = useMemo(
    () => conversations.find((c) => c.id === currentId) || null,
    [conversations, currentId]
  );

  const loadConversations = useCallback(async () => {
    try {
      setLoading(true);
      const [data, folderData] = await Promise.all([
        Stores.getAllConversations(),
        Stores.getAllConversationFolders(),
      ]);
      const normalizedFolders = normalizeConversationFolders(folderData, data);
      if (JSON.stringify(normalizedFolders) !== JSON.stringify(folderData)) {
        await Stores.setConversationFolders(normalizedFolders);
      }
      setConversations(data);
      setFolders(normalizedFolders);
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
    setConversations((prev) => (prev.some((c) => c.id === conv.id) ? prev : [...prev, conv]));
  }, []);

  const createConversationFolder = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const folder: ConversationFolder = {
      id: generateId(),
      name: trimmed,
      conversationIds: [],
      isCollapsed: false,
      createdAt: Date.now(),
    };
    await Stores.addConversationFolder(folder);
    setFolders((prev) => [...prev, folder]);
    return folder;
  }, []);

  const renameConversationFolder = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await Stores.updateConversationFolder(id, { name: trimmed });
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: trimmed } : f)));
  }, []);

  const setConversationFolderCollapsed = useCallback(async (id: string, isCollapsed: boolean) => {
    await Stores.updateConversationFolder(id, { isCollapsed });
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, isCollapsed } : f)));
  }, []);

  const addConversationsToFolder = useCallback(
    async (folderId: string, conversationIds: string[]) => {
      const validIds = conversationIds.filter((id) => conversations.some((c) => c.id === id));
      if (validIds.length === 0) return;
      const moving = new Set(validIds);
      const update = (items: ConversationFolder[]) =>
        items.map((folder) => {
          const kept = folder.conversationIds.filter((id) => !moving.has(id));
          if (folder.id !== folderId) return { ...folder, conversationIds: kept };
          return { ...folder, conversationIds: Array.from(new Set([...kept, ...validIds])) };
        });
      await Stores.mutateConversationFolders(update);
      setFolders(update);
    },
    [conversations]
  );

  const removeConversationFromFolder = useCallback(async (folderId: string, conversationId: string) => {
    const update = (items: ConversationFolder[]) =>
      items.map((folder) =>
        folder.id === folderId
          ? { ...folder, conversationIds: folder.conversationIds.filter((id) => id !== conversationId) }
          : folder
      );
    await Stores.mutateConversationFolders(update);
    setFolders(update);
  }, []);

  const deleteConversationFolder = useCallback(async (id: string) => {
    await Stores.deleteConversationFolder(id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
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

      try {
        const update = (items: ConversationFolder[]) =>
          items.map((folder) => ({
            ...folder,
            conversationIds: folder.conversationIds.filter((convId) => convId !== id),
          }));
        await Stores.mutateConversationFolders(update);
        setFolders(update);
      } catch (e) {
        console.error('[deleteConversation] 从文件夹移除会话失败:', e);
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
    folders,
    currentConversation,
    currentId,
    loading,
    loadConversations,
    createConversation,
    addConversationDirect,
    deleteConversation,
    createConversationFolder,
    renameConversationFolder,
    setConversationFolderCollapsed,
    addConversationsToFolder,
    removeConversationFromFolder,
    deleteConversationFolder,
    setCurrentConversation,
  };
}
