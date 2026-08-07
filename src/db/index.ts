import localforage from 'localforage';
import { DB_KEYS } from '../utils/constants';

/** 模型配置 store */
export const modelsStore = localforage.createInstance({
  name: 'tavern_ai_sandbox',
  storeName: DB_KEYS.models,
});

/** Local-only vault: API keys and sync credentials. It is intentionally absent from backups. */
export const secretsStore = localforage.createInstance({
  name: 'tavern_ai_sandbox',
  storeName: DB_KEYS.secrets,
});

/** 角色 store */
export const charactersStore = localforage.createInstance({
  name: 'tavern_ai_sandbox',
  storeName: DB_KEYS.characters,
});

/** 会话 store */
export const conversationsStore = localforage.createInstance({
  name: 'tavern_ai_sandbox',
  storeName: DB_KEYS.conversations,
});

/** 会话文件夹 store */
export const conversationFoldersStore = localforage.createInstance({
  name: 'tavern_ai_sandbox',
  storeName: DB_KEYS.conversationFolders,
});

/** 消息节点 store */
export const messageNodesStore = localforage.createInstance({
  name: 'tavern_ai_sandbox',
  storeName: DB_KEYS.messageNodes,
});

/** 世界书 store */
export const worldbooksStore = localforage.createInstance({
  name: 'tavern_ai_sandbox',
  storeName: DB_KEYS.worldbooks,
});

/** 本地表情包 store（Blob 由 IndexedDB 原生保存） */
export const stickerPacksStore = localforage.createInstance({
  name: 'tavern_ai_sandbox',
  storeName: DB_KEYS.stickerPacks,
});

/** 全局状态 store */
export const imageChannelsStore = localforage.createInstance({
  name: 'tavern_ai_sandbox',
  storeName: DB_KEYS.imageChannels,
});

/** 本机后台生图任务 store。任务不进入备份或同步。 */
export const imageTasksStore = localforage.createInstance({
  name: 'tavern_ai_sandbox',
  storeName: DB_KEYS.imageTasks,
});

/** Global state store */
export const globalStatesStore = localforage.createInstance({
  name: 'tavern_ai_sandbox',
  storeName: DB_KEYS.globalStates,
});

/** UI 设置 store（主题 + 壁纸） */
export const uiSettingsStore = localforage.createInstance({
  name: 'tavern_ai_sandbox',
  storeName: 'tavern_ui_settings',
});

/** 所有 store 实例的集合 */
export const allStores = [
  modelsStore,
  secretsStore,
  charactersStore,
  conversationsStore,
  conversationFoldersStore,
  messageNodesStore,
  worldbooksStore,
  stickerPacksStore,
  imageChannelsStore,
  imageTasksStore,
  globalStatesStore,
  uiSettingsStore,
] as const;

/**
 * 初始化数据库：确保所有 store 就绪。
 * 调用 localForage.ready() 等待每个 store 初始化完成。
 */
export async function initDB(): Promise<void> {
  try {
    await Promise.all(allStores.map((store) => store.ready()));
    console.log('[DB] All stores initialized successfully');
  } catch (err) {
    console.error('[DB] Initialization failed:', err);
    throw new Error(`Database initialization failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
