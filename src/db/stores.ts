import type LocalForage from 'localforage';
import {
  modelsStore,
  charactersStore,
  conversationsStore,
  messageNodesStore,
  worldbooksStore,
  globalStatesStore,
  uiSettingsStore,
} from './index';
import type {
  ModelConfig,
  Character,
  Conversation,
  MessageNode,
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

/* ──────────────── Message Nodes ──────────────── */

export async function getMessageNodesByConversation(
  conversationId: string
): Promise<MessageNode[]> {
  const all = await getStoreData<MessageNode>(messageNodesStore);
  return all.filter((n) => n.conversationId === conversationId);
}

export async function getMessageNodeById(
  id: string
): Promise<MessageNode | undefined> {
  const all = await getStoreData<MessageNode>(messageNodesStore);
  return all.find((n) => n.id === id);
}

export async function addMessageNode(node: MessageNode): Promise<void> {
  await mutateStore<MessageNode>(messageNodesStore, (data) => {
    data.push(node);
    return data;
  });
}

/** 批量添加消息节点 — 单次读-改-写，避免逐条 addMessageNode 的 O(n²) IO */
export async function addMessageNodes(nodes: MessageNode[]): Promise<void> {
  if (nodes.length === 0) return;
  await mutateStore<MessageNode>(messageNodesStore, (data) => {
    data.push(...nodes);
    return data;
  });
}

export async function updateMessageNode(
  id: string,
  updates: Partial<MessageNode>
): Promise<void> {
  await mutateStore<MessageNode>(messageNodesStore, (data) => {
    const idx = data.findIndex((n) => n.id === id);
    if (idx !== -1) {
      data[idx] = { ...data[idx], ...updates };
    }
    return data;
  });
}

export async function deleteMessageNode(id: string): Promise<void> {
  await mutateStore<MessageNode>(messageNodesStore, (data) =>
    data.filter((n) => n.id !== id)
  );
}

/** 批量删除某个对话的所有消息节点（1 次读取 + 1 次写入，替代逐条 O(n²)） */
export async function deleteMessageNodesByConversation(
  conversationId: string
): Promise<number> {
  // 注意：返回值需在锁内计算，避免读到被中途改写的快照
  return withStoreLock(messageNodesStore, async () => {
    const all = await getStoreData<MessageNode>(messageNodesStore);
    const deletedCount = all.filter(
      (n) => n.conversationId === conversationId
    ).length;
    const remaining = all.filter((n) => n.conversationId !== conversationId);
    await setStoreData(messageNodesStore, remaining);
    return deletedCount;
  });
}

export async function updateMessageNodes(
  updates: Array<{ id: string; changes: Partial<MessageNode> }>
): Promise<void> {
  await mutateStore<MessageNode>(messageNodesStore, (data) => {
    for (const u of updates) {
      const idx = data.findIndex((n) => n.id === u.id);
      if (idx !== -1) {
        data[idx] = { ...data[idx], ...u.changes };
      }
    }
    return data;
  });
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
  thinkingEnabled?: boolean;
  debugMode?: boolean;
  scribeEnabled?: boolean;
  lowRateMode?: boolean;
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
        thinkingEnabled: settings.thinkingEnabled ?? existing.thinkingEnabled,
        debugMode: settings.debugMode ?? existing.debugMode,
        scribeEnabled: settings.scribeEnabled ?? existing.scribeEnabled,
        lowRateMode: settings.lowRateMode ?? existing.lowRateMode,
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
        tplReverseEngineer: settings.tplReverseEngineer ?? existing.tplReverseEngineer,
      };
      await uiSettingsStore.setItem('settings', merged);
    } catch (e) {
      console.error('setUISettings failed:', e);
    }
  });
}
