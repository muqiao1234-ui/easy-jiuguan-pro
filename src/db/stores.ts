import type LocalForage from 'localforage';
import {
  modelsStore,
  charactersStore,
  conversationsStore,
  conversationFoldersStore,
  messageNodesStore,
  worldbooksStore,
  globalStatesStore,
  uiSettingsStore,
} from './index';
import type {
  ModelConfig,
  Character,
  Conversation,
  ConversationFolder,
  MessageNode,
  MessageRole,
  DistillationConfig,
  ContextAssemblyConfig,
  WorldBook,
  GlobalState,
} from '../types';

/* ──────────────── 泛型辅助 ──────────────── */

/**
 * 按 store 维度的异步互斥锁。
 *
 * 问题背景：所有存储操作都是"读整表 → 改 → 写回整表"的 read-modify-write 模式。
 * 当主流程的 addMessageNode 与状态书的 updateMessageNode / 蒸馏的 batchUpdateNodes
 * 并发执行时，两个读-改-写会互相覆盖，导致状态书写入或蒸馏归档标记丢失。
 *
 * 解决方案：每个 LocalForage store 维护一个独立的 Promise 链作为锁。同一 store 的
 * 所有写操作按入队顺序串行执行；不同 store 之间互不阻塞（避免锁粒度过大）。
 * 纯读操作（getAllX / getXById）不入锁——localForage 的 getItem 是原子的，读到的
 * 快照即使略旧也不会破坏数据完整性；只要写写之间互斥即可避免丢数据。
 */
const storeWriteLocks = new WeakMap<LocalForage, Promise<void>>();

function withStoreLock<T>(store: LocalForage, fn: () => Promise<T>): Promise<T> {
  const prev = storeWriteLocks.get(store) ?? Promise.resolve();
  // 把本次 fn 串到锁链尾部；失败时吞掉 rejection 以免后续操作被永久阻塞
  const run = prev.then(fn, fn);
  const next = run.then(
    () => undefined,
    () => undefined
  );
  storeWriteLocks.set(store, next);
  return run;
}

async function getStoreData<T>(store: LocalForage): Promise<T[]> {
  try {
    const data = await store.getItem<T[]>('data');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('getStoreData failed:', e);
    return [];
  }
}

async function setStoreData<T>(store: LocalForage, data: T[]): Promise<void> {
  try {
    await store.setItem('data', data);
  } catch (e) {
    console.error('setStoreData failed:', e);
    throw e;
  }
}

/**
 * 在写锁内执行整表读-改-写。fn 接收当前整表，返回新整表。
 * 这是所有 mutating 操作的统一入口，保证同一 store 的写操作串行执行。
 */
async function mutateStore<T>(
  store: LocalForage,
  fn: (data: T[]) => T[] | Promise<T[]>
): Promise<void> {
  return withStoreLock(store, async () => {
    const data = await getStoreData<T>(store);
    const next = await fn(data);
    await setStoreData(store, next);
  });
}

/* ──────────────── Models ──────────────── */

export async function getAllModels(): Promise<ModelConfig[]> {
  return getStoreData<ModelConfig>(modelsStore);
}

export async function getModelById(id: string): Promise<ModelConfig | undefined> {
  const all = await getAllModels();
  return all.find((m) => m.id === id);
}

export async function addModel(model: ModelConfig): Promise<void> {
  await mutateStore<ModelConfig>(modelsStore, (data) => {
    data.push(model);
    return data;
  });
}

export async function updateModel(
  id: string,
  updates: Partial<ModelConfig>
): Promise<void> {
  await mutateStore<ModelConfig>(modelsStore, (data) => {
    const idx = data.findIndex((m) => m.id === id);
    if (idx !== -1) {
      data[idx] = { ...data[idx], ...updates };
    }
    return data;
  });
}

export async function deleteModel(id: string): Promise<void> {
  await mutateStore<ModelConfig>(modelsStore, (data) =>
    data.filter((m) => m.id !== id)
  );
}

/* ──────────────── Characters ──────────────── */

export async function getAllCharacters(): Promise<Character[]> {
  return getStoreData<Character>(charactersStore);
}

export async function getCharacterById(id: string): Promise<Character | undefined> {
  const all = await getAllCharacters();
  return all.find((c) => c.id === id);
}

export async function addCharacter(char: Character): Promise<void> {
  await mutateStore<Character>(charactersStore, (data) => {
    data.push(char);
    return data;
  });
}

export async function updateCharacter(
  id: string,
  updates: Partial<Character>
): Promise<void> {
  await mutateStore<Character>(charactersStore, (data) => {
    const idx = data.findIndex((c) => c.id === id);
    if (idx !== -1) {
      data[idx] = { ...data[idx], ...updates };
    }
    return data;
  });
}

export async function deleteCharacter(id: string): Promise<void> {
  await mutateStore<Character>(charactersStore, (data) =>
    data.filter((c) => c.id !== id)
  );
}

/* ──────────────── Conversations ──────────────── */

export async function getAllConversations(): Promise<Conversation[]> {
  return getStoreData<Conversation>(conversationsStore);
}

export async function getConversationById(
  id: string
): Promise<Conversation | undefined> {
  const all = await getAllConversations();
  return all.find((c) => c.id === id);
}

export async function addConversation(conv: Conversation): Promise<void> {
  await mutateStore<Conversation>(conversationsStore, (data) => {
    data.push(conv);
    return data;
  });
}

export async function updateConversation(
  id: string,
  updates: Partial<Conversation>
): Promise<void> {
  await mutateStore<Conversation>(conversationsStore, (data) => {
    const idx = data.findIndex((c) => c.id === id);
    if (idx !== -1) {
      data[idx] = { ...data[idx], ...updates };
    }
    return data;
  });
}

export async function deleteConversation(id: string): Promise<void> {
  await mutateStore<Conversation>(conversationsStore, (data) =>
    data.filter((c) => c.id !== id)
  );
}

/* ──────────────── Conversation Folders ──────────────── */

export async function getAllConversationFolders(): Promise<ConversationFolder[]> {
  return getStoreData<ConversationFolder>(conversationFoldersStore);
}

export async function getConversationFolderById(
  id: string
): Promise<ConversationFolder | undefined> {
  const all = await getAllConversationFolders();
  return all.find((f) => f.id === id);
}

export async function setConversationFolders(
  folders: ConversationFolder[]
): Promise<void> {
  await withStoreLock(conversationFoldersStore, async () => {
    await setStoreData(conversationFoldersStore, folders);
  });
}

export async function addConversationFolder(folder: ConversationFolder): Promise<void> {
  await mutateStore<ConversationFolder>(conversationFoldersStore, (data) => {
    data.push(folder);
    return data;
  });
}

export async function updateConversationFolder(
  id: string,
  updates: Partial<ConversationFolder>
): Promise<void> {
  await mutateStore<ConversationFolder>(conversationFoldersStore, (data) => {
    const idx = data.findIndex((f) => f.id === id);
    if (idx !== -1) {
      data[idx] = { ...data[idx], ...updates };
    }
    return data;
  });
}

export async function mutateConversationFolders(
  updater: (folders: ConversationFolder[]) => ConversationFolder[]
): Promise<void> {
  await mutateStore<ConversationFolder>(conversationFoldersStore, updater);
}

export async function deleteConversationFolder(id: string): Promise<void> {
  await mutateStore<ConversationFolder>(conversationFoldersStore, (data) =>
    data.filter((f) => f.id !== id)
  );
}

/* ──────────────── Message Nodes ──────────────── */

const MESSAGE_NODE_VERSION_KEY = '__message_nodes_v3__';
const MESSAGE_NODE_INDEX_PREFIX = 'conversation_index:';
const MESSAGE_NODE_PREFIX = 'node:';
let messageNodeMigration: Promise<void> | null = null;

interface MessageNodeIndexItem {
  id: string;
  timestamp: number;
  role: MessageRole;
  isArchived: boolean;
  hasScribeUpdate: boolean;
}

function toMessageNodeIndexItem(node: MessageNode): MessageNodeIndexItem {
  return {
    id: node.id,
    timestamp: Number.isFinite(node.timestamp) ? node.timestamp : 0,
    role: node.role,
    isArchived: Boolean(node.isArchived),
    hasScribeUpdate: Boolean(node.scribeUpdate?.isEnabled && node.scribeUpdate.rawText?.trim()),
  };
}

function messageNodeIndexKey(conversationId: string): string {
  return `${MESSAGE_NODE_INDEX_PREFIX}${conversationId}`;
}

function messageNodeKey(id: string): string {
  return `${MESSAGE_NODE_PREFIX}${id}`;
}

function sortMessageNodeIndex(items: MessageNodeIndexItem[]): MessageNodeIndexItem[] {
  return items.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
}

/** Rebuilds metadata indexes from either the old array store or v2 per-node records. */
async function ensureMessageNodesV3(): Promise<void> {
  if (!messageNodeMigration) {
    messageNodeMigration = withStoreLock(messageNodesStore, async () => {
      if (await messageNodesStore.getItem<boolean>(MESSAGE_NODE_VERSION_KEY)) return;

      const nodesById = new Map<string, MessageNode>();
      const indexKeys: string[] = [];
      await messageNodesStore.iterate<unknown, void>((value, key) => {
        if (key.startsWith(MESSAGE_NODE_PREFIX) && value && typeof value === 'object') {
          const node = value as MessageNode;
          if (node.id && node.conversationId) nodesById.set(node.id, node);
        } else if (key.startsWith(MESSAGE_NODE_INDEX_PREFIX)) {
          indexKeys.push(key);
        }
      });
      const legacyNodes = await getStoreData<MessageNode>(messageNodesStore);
      for (const node of legacyNodes) {
        if (node?.id && node.conversationId) nodesById.set(node.id, node);
      }
      const byConversation = new Map<string, MessageNode[]>();
      for (const node of nodesById.values()) {
        const nodes = byConversation.get(node.conversationId) || [];
        nodes.push(node);
        byConversation.set(node.conversationId, nodes);
      }

      for (const nodes of byConversation.values()) {
        await Promise.all(nodes.map((node) => messageNodesStore.setItem(messageNodeKey(node.id), node)));
      }

      await Promise.all(indexKeys.map((key) => messageNodesStore.removeItem(key)));
      for (const [conversationId, nodes] of byConversation) {
        await messageNodesStore.setItem(
          messageNodeIndexKey(conversationId),
          sortMessageNodeIndex(nodes.map(toMessageNodeIndexItem))
        );
      }
      await messageNodesStore.removeItem('data');
      await messageNodesStore.setItem(MESSAGE_NODE_VERSION_KEY, true);
    });
  }
  const migration = messageNodeMigration;
  try {
    await migration;
  } catch (error) {
    if (messageNodeMigration === migration) messageNodeMigration = null;
    throw error;
  }
}

async function getMessageNodeIndex(conversationId: string): Promise<MessageNodeIndexItem[]> {
  await ensureMessageNodesV3();
  const items = await messageNodesStore.getItem<MessageNodeIndexItem[]>(messageNodeIndexKey(conversationId));
  return Array.isArray(items) ? items : [];
}

export interface MessageNodePage {
  nodes: MessageNode[];
  hasMore: boolean;
}

export interface MessageNodeCursor {
  timestamp: number;
  id: string;
}

export async function getMessageNodesPageByConversation(
  conversationId: string,
  before?: MessageNodeCursor,
  limit = 80
): Promise<MessageNodePage> {
  const index = await getMessageNodeIndex(conversationId);
  const candidates = before === undefined
    ? index
    : index.filter((item) =>
        item.timestamp < before.timestamp ||
        (item.timestamp === before.timestamp && item.id.localeCompare(before.id) < 0)
      );
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit) || 80));
  const selected = candidates.slice(Math.max(0, candidates.length - safeLimit));
  const loaded = await Promise.all(selected.map((item) => messageNodesStore.getItem<MessageNode>(messageNodeKey(item.id))));
  return {
    nodes: loaded.filter((node): node is MessageNode => !!node),
    hasMore: candidates.length > selected.length,
  };
}

export async function getMessageNodesByConversation(
  conversationId: string
): Promise<MessageNode[]> {
  const index = await getMessageNodeIndex(conversationId);
  const nodes = await Promise.all(index.map((item) => messageNodesStore.getItem<MessageNode>(messageNodeKey(item.id))));
  return nodes.filter((node): node is MessageNode => !!node);
}

export interface MessageNodeQuery {
  roles?: MessageRole[];
  isArchived?: boolean;
  hasScribeUpdate?: boolean;
  order?: 'oldest' | 'newest';
  limit?: number;
}

function filterMessageNodeIndex(index: MessageNodeIndexItem[], query: MessageNodeQuery): MessageNodeIndexItem[] {
  const roles = query.roles?.length ? new Set(query.roles) : null;
  return index.filter((item) =>
    (!roles || roles.has(item.role)) &&
    (query.isArchived === undefined || item.isArchived === query.isArchived) &&
    (query.hasScribeUpdate === undefined || item.hasScribeUpdate === query.hasScribeUpdate)
  );
}

export async function queryMessageNodesByConversation(
  conversationId: string,
  query: MessageNodeQuery = {}
): Promise<MessageNode[]> {
  const index = filterMessageNodeIndex(await getMessageNodeIndex(conversationId), query);
  const limit = query.limit === undefined
    ? index.length
    : Math.max(0, Math.min(2000, Math.floor(query.limit) || 0));
  const selected = limit === 0
    ? []
    : query.order === 'oldest' ? index.slice(0, limit) : index.slice(-limit);
  const nodes = await Promise.all(selected.map((item) => messageNodesStore.getItem<MessageNode>(messageNodeKey(item.id))));
  return nodes.filter((node): node is MessageNode => !!node);
}

export async function countMessageNodesByConversation(
  conversationId: string,
  query: Omit<MessageNodeQuery, 'order' | 'limit'> = {}
): Promise<number> {
  return filterMessageNodeIndex(await getMessageNodeIndex(conversationId), query).length;
}

export interface MessageNodeMetadata {
  id: string;
  timestamp: number;
  role: MessageRole;
  isArchived: boolean;
}

export async function getMessageNodeMetadataByConversation(
  conversationId: string
): Promise<MessageNodeMetadata[]> {
  return getMessageNodeIndex(conversationId);
}

/** Archives the exact source batch and adds its distilled node under one store lock. */
export async function commitDistillationBatch(
  sourceIds: string[],
  distilledNode: MessageNode
): Promise<boolean> {
  if (sourceIds.length === 0) return false;
  await ensureMessageNodesV3();
  return withStoreLock(messageNodesStore, async () => {
    const uniqueSourceIds = [...new Set(sourceIds)];
    const sourceIdSet = new Set(uniqueSourceIds);
    if (await messageNodesStore.getItem<MessageNode>(messageNodeKey(distilledNode.id))) return false;
    const sourceNodes = await Promise.all(
      uniqueSourceIds.map((id) => messageNodesStore.getItem<MessageNode>(messageNodeKey(id)))
    );
    if (sourceNodes.some((node) => !node || node.isArchived)) return false;
    if (sourceNodes.some((node) => node!.conversationId !== distilledNode.conversationId)) return false;

    const sourceByConversation = new Map<string, MessageNodeIndexItem[]>();
    for (const node of sourceNodes as MessageNode[]) {
      const index = sourceByConversation.get(node.conversationId) || await getMessageNodeIndex(node.conversationId);
      sourceByConversation.set(node.conversationId, index);
    }

    try {
      for (const node of sourceNodes as MessageNode[]) {
        await messageNodesStore.setItem(messageNodeKey(node.id), { ...node, isArchived: true });
      }
      for (const [conversationId, index] of sourceByConversation) {
        await messageNodesStore.setItem(
          messageNodeIndexKey(conversationId),
          sortMessageNodeIndex(index.map((item) => sourceIdSet.has(item.id) ? { ...item, isArchived: true } : item))
        );
      }

      const distilledIndex = await getMessageNodeIndex(distilledNode.conversationId);
      distilledIndex.push(toMessageNodeIndexItem(distilledNode));
      await messageNodesStore.setItem(messageNodeKey(distilledNode.id), distilledNode);
      await messageNodesStore.setItem(
        messageNodeIndexKey(distilledNode.conversationId),
        sortMessageNodeIndex(distilledIndex)
      );
      return true;
    } catch (error) {
      await Promise.allSettled((sourceNodes as MessageNode[]).map((node) =>
        messageNodesStore.setItem(messageNodeKey(node.id), node)
      ));
      await Promise.allSettled(Array.from(sourceByConversation, ([conversationId, index]) =>
        messageNodesStore.setItem(messageNodeIndexKey(conversationId), index)
      ));
      await messageNodesStore.removeItem(messageNodeKey(distilledNode.id)).catch(() => undefined);
      throw error;
    }
  });
}

export async function getAllMessageNodes(): Promise<MessageNode[]> {
  await ensureMessageNodesV3();
  const conversationIds: string[] = [];
  await messageNodesStore.iterate<unknown, void>((_value, key) => {
    if (key.startsWith(MESSAGE_NODE_INDEX_PREFIX)) {
      conversationIds.push(key.slice(MESSAGE_NODE_INDEX_PREFIX.length));
    }
  });
  const groups = await Promise.all(conversationIds.map((id) => getMessageNodesByConversation(id)));
  return groups.flat();
}

export async function getMessageNodeById(
  id: string
): Promise<MessageNode | undefined> {
  await ensureMessageNodesV3();
  return (await messageNodesStore.getItem<MessageNode>(messageNodeKey(id))) || undefined;
}

export async function addMessageNode(node: MessageNode): Promise<void> {
  await ensureMessageNodesV3();
  await withStoreLock(messageNodesStore, async () => {
    const index = await getMessageNodeIndex(node.conversationId);
    index.push(toMessageNodeIndexItem(node));
    await messageNodesStore.setItem(messageNodeKey(node.id), node);
    await messageNodesStore.setItem(messageNodeIndexKey(node.conversationId), sortMessageNodeIndex(index));
  });
}

/** 批量添加消息节点，按会话写入索引与节点记录。 */
export async function addMessageNodes(nodes: MessageNode[]): Promise<void> {
  if (nodes.length === 0) return;
  await ensureMessageNodesV3();
  await withStoreLock(messageNodesStore, async () => {
    const byConversation = new Map<string, MessageNode[]>();
    for (const node of nodes) {
      const group = byConversation.get(node.conversationId) || [];
      group.push(node);
      byConversation.set(node.conversationId, group);
    }
    for (const [conversationId, group] of byConversation) {
      const index = await getMessageNodeIndex(conversationId);
      index.push(...group.map(toMessageNodeIndexItem));
      await Promise.all(group.map((node) => messageNodesStore.setItem(messageNodeKey(node.id), node)));
      await messageNodesStore.setItem(messageNodeIndexKey(conversationId), sortMessageNodeIndex(index));
    }
  });
}

export async function updateMessageNode(
  id: string,
  updates: Partial<MessageNode>
): Promise<void> {
  await ensureMessageNodesV3();
  await withStoreLock(messageNodesStore, async () => {
    const existing = await messageNodesStore.getItem<MessageNode>(messageNodeKey(id));
    if (!existing) return;
    const next = { ...existing, ...updates };
    await messageNodesStore.setItem(messageNodeKey(id), next);
    const oldIndex = await getMessageNodeIndex(existing.conversationId);
    await messageNodesStore.setItem(
      messageNodeIndexKey(existing.conversationId),
      sortMessageNodeIndex(
        existing.conversationId === next.conversationId
          ? oldIndex.map((item) => item.id === id ? toMessageNodeIndexItem(next) : item)
          : oldIndex.filter((item) => item.id !== id)
      )
    );
    if (existing.conversationId !== next.conversationId) {
      const newIndex = await getMessageNodeIndex(next.conversationId);
      newIndex.push(toMessageNodeIndexItem(next));
      await messageNodesStore.setItem(messageNodeIndexKey(next.conversationId), sortMessageNodeIndex(newIndex));
    }
  });
}

export async function deleteMessageNode(id: string): Promise<void> {
  await ensureMessageNodesV3();
  await withStoreLock(messageNodesStore, async () => {
    const node = await messageNodesStore.getItem<MessageNode>(messageNodeKey(id));
    if (!node) return;
    const index = await getMessageNodeIndex(node.conversationId);
    await messageNodesStore.removeItem(messageNodeKey(id));
    await messageNodesStore.setItem(
      messageNodeIndexKey(node.conversationId),
      index.filter((item) => item.id !== id)
    );
  });
}

/** 批量删除某个对话的所有消息节点（1 次读取 + 1 次写入，替代逐条 O(n²)） */
export async function deleteMessageNodesByConversation(
  conversationId: string
): Promise<number> {
  await ensureMessageNodesV3();
  return withStoreLock(messageNodesStore, async () => {
    const index = await getMessageNodeIndex(conversationId);
    await Promise.all(index.map((item) => messageNodesStore.removeItem(messageNodeKey(item.id))));
    await messageNodesStore.removeItem(messageNodeIndexKey(conversationId));
    return index.length;
  });
}

export async function updateMessageNodes(
  updates: Array<{ id: string; changes: Partial<MessageNode> }>
): Promise<void> {
  if (updates.length === 0) return;
  await ensureMessageNodesV3();
  await withStoreLock(messageNodesStore, async () => {
    for (const update of updates) {
      const node = await messageNodesStore.getItem<MessageNode>(messageNodeKey(update.id));
      if (!node) continue;
      const next = { ...node, ...update.changes };
      await messageNodesStore.setItem(messageNodeKey(update.id), next);
      const index = await getMessageNodeIndex(node.conversationId);
      await messageNodesStore.setItem(
        messageNodeIndexKey(node.conversationId),
        sortMessageNodeIndex(index.map((item) => item.id === node.id ? toMessageNodeIndexItem(next) : item))
      );
    }
  });
}

/** Replaces all message records. Used by backup import and safely clears old shards. */
export async function replaceAllMessageNodes(nodes: MessageNode[]): Promise<void> {
  await withStoreLock(messageNodesStore, async () => {
    await messageNodesStore.clear();
    const byConversation = new Map<string, MessageNode[]>();
    for (const node of nodes) {
      const group = byConversation.get(node.conversationId) || [];
      group.push(node);
      byConversation.set(node.conversationId, group);
    }
    for (const [conversationId, group] of byConversation) {
      await Promise.all(group.map((node) => messageNodesStore.setItem(messageNodeKey(node.id), node)));
      await messageNodesStore.setItem(
        messageNodeIndexKey(conversationId),
        sortMessageNodeIndex(group.map(toMessageNodeIndexItem))
      );
    }
    await messageNodesStore.setItem(MESSAGE_NODE_VERSION_KEY, true);
  });
  messageNodeMigration = Promise.resolve();
}

/* ──────────────── World Books ──────────────── */

export async function getAllWorldBooks(): Promise<WorldBook[]> {
  return getStoreData<WorldBook>(worldbooksStore);
}

export async function getWorldBookById(
  id: string
): Promise<WorldBook | undefined> {
  const all = await getAllWorldBooks();
  return all.find((w) => w.id === id);
}

export async function addWorldBook(wb: WorldBook): Promise<void> {
  await mutateStore<WorldBook>(worldbooksStore, (data) => {
    data.push(wb);
    return data;
  });
}

export async function updateWorldBook(
  id: string,
  updates: Partial<WorldBook>
): Promise<void> {
  await mutateStore<WorldBook>(worldbooksStore, (data) => {
    const idx = data.findIndex((w) => w.id === id);
    if (idx !== -1) {
      data[idx] = { ...data[idx], ...updates };
    }
    return data;
  });
}

export async function deleteWorldBook(id: string): Promise<void> {
  await mutateStore<Character>(charactersStore, (data) =>
    data.map((character) => {
      if (character.worldBookId !== id && character.cacheWorldBookId !== id) return character;
      const next = { ...character };
      if (next.worldBookId === id) delete next.worldBookId;
      if (next.cacheWorldBookId === id) delete next.cacheWorldBookId;
      return next;
    })
  );
  await mutateStore<WorldBook>(worldbooksStore, (data) =>
    data.filter((w) => w.id !== id)
  );
}

/* ──────────────── Global States ──────────────── */

export async function getGlobalStateByConversation(
  conversationId: string
): Promise<GlobalState | undefined> {
  const all = await getStoreData<GlobalState>(globalStatesStore);
  return all.find((s) => s.conversationId === conversationId);
}

export async function setGlobalState(state: GlobalState): Promise<void> {
  await mutateStore<GlobalState>(globalStatesStore, (data) => {
    const idx = data.findIndex((s) => s.conversationId === state.conversationId);
    if (idx !== -1) {
      data[idx] = state;
    } else {
      data.push(state);
    }
    return data;
  });
}

/**
 * 原子性地部分更新全局状态。
 * 与"先 getGlobalStateByConversation 再 setGlobalState"不同，
 * 读取与写入在同一个 mutateStore 锁内完成，避免与并发
 * updateScribeContent/updateScribeConfig 互相覆盖导致丢字段。
 */
export async function patchGlobalState(
  conversationId: string,
  partial: Partial<Omit<GlobalState, 'conversationId'>>
): Promise<void> {
  await mutateStore<GlobalState>(globalStatesStore, (data) => {
    const idx = data.findIndex((s) => s.conversationId === conversationId);
    if (idx !== -1) {
      data[idx] = { ...data[idx], ...partial };
    } else {
      data.push({ conversationId, scribeContent: '', ...partial } as GlobalState);
    }
    return data;
  });
}

export async function deleteGlobalState(conversationId: string): Promise<void> {
  await mutateStore<GlobalState>(globalStatesStore, (data) =>
    data.filter((s) => s.conversationId !== conversationId)
  );
}

/* ──────────────── UI Settings ──────────────── */

export interface UISettings {
  theme: 'light' | 'dark';
  wallpaper: {
    image: string;
    overlayOpacity: number;
    overlayMode: 'light' | 'dark';
  };
  boldColorize?: boolean;
  scribeEngine?: 'text' | 'galgame';
  scribeMode?: 'charA' | 'charB' | 'auto';
  galgamePrompt?: string;
  mutualObservePrompt?: string;
  charAModelId?: string | null;
  charBModelId?: string | null;
  thinkingEnabled?: boolean;
  debugMode?: boolean;
  scribeEnabled?: boolean;
  scribeCacheWorldBookEnabled?: boolean;
  scribeRounds?: number;
  lowRateMode?: boolean;
  distillationConfig?: DistillationConfig;
  contextConfig?: ContextAssemblyConfig;
  // 高级提示词模板（空=用默认）
  tplUserWrapper?: string;
  tplOtherCharWrapper?: string;
  tplIdentityAnchor?: string;
  tplWorldBookPrefix?: string;
  tplDistilledPrefix?: string;
  tplStateBookPrefix?: string;
  tplEavesdropAppend?: string;
  tplGalgameCharInjection?: string;
  tplImplantMemoryPrefix?: string;
  tplImplantScribePrefix?: string;
  tplDistilledNodePrefix?: string;
  tplCacheWorldBookPrompt?: string;
  tplReverseEngineer?: string;
}

export async function getUISettings(): Promise<UISettings | null> {
  try {
    return await uiSettingsStore.getItem<UISettings>('settings');
  } catch (e) {
    console.error('getUISettings failed:', e);
    return null;
  }
}

export async function setUISettings(settings: Partial<UISettings>): Promise<void> {
  // UISettings 也是读-改-写模式，需要串行化以避免并发覆盖
  await withStoreLock(uiSettingsStore, async () => {
    try {
      const existing =
        (await uiSettingsStore.getItem<UISettings>('settings')) || {
          theme: 'dark' as const,
          wallpaper: { image: '', overlayOpacity: 0.7, overlayMode: 'dark' as const },
        };
      const merged: UISettings = {
        theme: settings.theme ?? existing.theme,
        wallpaper: { ...existing.wallpaper, ...(settings.wallpaper || {}) },
        boldColorize: settings.boldColorize ?? existing.boldColorize,
        scribeEngine: settings.scribeEngine ?? existing.scribeEngine,
        scribeMode: settings.scribeMode ?? existing.scribeMode,
        galgamePrompt: settings.galgamePrompt ?? existing.galgamePrompt,
        mutualObservePrompt: settings.mutualObservePrompt ?? existing.mutualObservePrompt,
        charAModelId: settings.charAModelId ?? existing.charAModelId,
        charBModelId: settings.charBModelId ?? existing.charBModelId,
        thinkingEnabled: settings.thinkingEnabled ?? existing.thinkingEnabled,
        debugMode: settings.debugMode ?? existing.debugMode,
        scribeEnabled: settings.scribeEnabled ?? existing.scribeEnabled,
        scribeCacheWorldBookEnabled: settings.scribeCacheWorldBookEnabled ?? existing.scribeCacheWorldBookEnabled,
        scribeRounds: settings.scribeRounds ?? existing.scribeRounds,
        lowRateMode: settings.lowRateMode ?? existing.lowRateMode,
        distillationConfig: settings.distillationConfig ?? existing.distillationConfig,
        contextConfig: settings.contextConfig ?? existing.contextConfig,
        tplUserWrapper: settings.tplUserWrapper ?? existing.tplUserWrapper,
        tplOtherCharWrapper: settings.tplOtherCharWrapper ?? existing.tplOtherCharWrapper,
        tplIdentityAnchor: settings.tplIdentityAnchor ?? existing.tplIdentityAnchor,
        tplWorldBookPrefix: settings.tplWorldBookPrefix ?? existing.tplWorldBookPrefix,
        tplDistilledPrefix: settings.tplDistilledPrefix ?? existing.tplDistilledPrefix,
        tplStateBookPrefix: settings.tplStateBookPrefix ?? existing.tplStateBookPrefix,
        tplEavesdropAppend: settings.tplEavesdropAppend ?? existing.tplEavesdropAppend,
        tplGalgameCharInjection: settings.tplGalgameCharInjection ?? existing.tplGalgameCharInjection,
        tplImplantMemoryPrefix: settings.tplImplantMemoryPrefix ?? existing.tplImplantMemoryPrefix,
        tplImplantScribePrefix: settings.tplImplantScribePrefix ?? existing.tplImplantScribePrefix,
        tplDistilledNodePrefix: settings.tplDistilledNodePrefix ?? existing.tplDistilledNodePrefix,
        tplCacheWorldBookPrompt: settings.tplCacheWorldBookPrompt ?? existing.tplCacheWorldBookPrompt,
        tplReverseEngineer: settings.tplReverseEngineer ?? existing.tplReverseEngineer,
      };
      await uiSettingsStore.setItem('settings', merged);
    } catch (e) {
      console.error('setUISettings failed:', e);
    }
  });
}
