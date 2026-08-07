import type { MessageNode, MessageRole, StickerPack } from '../types';
import { MAX_ANIMATED_STICKER_BYTES, MAX_STICKER_PACKS, MAX_STICKERS_PER_PACK } from './constants';
import { readFileAsTextRobust } from './encoding';
import { normalizeComfyMapping, validateComfyWorkflow } from './comfyui';

export type BackupData = Partial<Record<
  'models' | 'characters' | 'conversations' | 'conversation_folders' | 'message_nodes' | 'worldbooks' | 'global_states' | 'sticker_packs' | 'image_channels',
  unknown[]
>>;

interface SerializedStickerItem {
  id: string;
  label: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObjectArray(value: unknown, name: string): Record<string, unknown>[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) throw new Error(`${name} must be an object array`);
  return value as Record<string, unknown>[];
}

function requireString(item: Record<string, unknown>, field: string, name: string): void {
  if (typeof item[field] !== 'string') throw new Error(`${name} is missing ${field}`);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read sticker image'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Invalid sticker image data');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match[1] });
}

/** Builds the only payload allowed to leave this device. The vault is never included. */
export async function createBackupPayload(): Promise<BackupData> {
  const stores = await import('../db/stores');
  const db = await import('../db/index');
  const [models, characters, conversations, folders, nodes, worldbooks, globalStates, stickerPacks, imageChannels] = await Promise.all([
    stores.getAllModels(),
    stores.getAllCharacters(),
    stores.getAllConversations(),
    stores.getAllConversationFolders(),
    stores.getAllMessageNodes(),
    stores.getAllWorldBooks(),
    db.globalStatesStore.getItem('data').then((states) => states || []),
    stores.getAllStickerPacks(),
    stores.getAllImageChannels(),
  ]);
  // Both the raw key and its local-vault reference are device-local credentials.
  const safeModels = models.map(({ apiKey: _apiKey, secretId: _secretId, ...model }) => model);
  // Image-channel credentials follow the same vault policy as text-model credentials.
  const safeImageChannels = imageChannels.map(({ secretId: _secretId, ...channel }) => channel);
  // Debug snapshots can be very large and are intentionally device-local.
  const safeNodes = await Promise.all(nodes.map(async ({ debugPrompt: _debugPrompt, debugResponse: _debugResponse, ...node }) => {
    if (!node.imageData) return node;
    const { blob, ...imageData } = node.imageData;
    return { ...node, imageData: { ...imageData, dataUrl: await blobToDataUrl(blob) } };
  }));
  const serializedStickerPacks = await Promise.all(stickerPacks.map(async (pack) => ({
    ...pack,
    stickers: await Promise.all(pack.stickers.map(async (sticker) => ({
      id: sticker.id,
      label: sticker.label,
      mimeType: sticker.mimeType,
      size: sticker.size,
      dataUrl: await blobToDataUrl(sticker.blob),
    }))),
  })));
  return {
    models: safeModels,
    characters,
    conversations,
    conversation_folders: folders,
    message_nodes: safeNodes,
    worldbooks,
    global_states: globalStates as unknown[],
    sticker_packs: serializedStickerPacks,
    image_channels: safeImageChannels,
  };
}

/** Validates a backup and explicitly removes any inline key injected by an old or third-party file. */
export function normalizeBackupPayload(raw: unknown): BackupData {
  if (!isRecord(raw)) throw new Error('Backup root must be an object');
  const models = requireObjectArray(raw.models, 'models')?.map((item) => {
    requireString(item, 'id', 'models');
    requireString(item, 'name', 'models');
    const { apiKey: _apiKey, secretId: _secretId, ...safe } = item;
    return safe;
  });
  const characters = requireObjectArray(raw.characters, 'characters')?.map((item) => {
    requireString(item, 'id', 'characters'); requireString(item, 'name', 'characters'); requireString(item, 'systemPrompt', 'characters'); return item;
  });
  const conversations = requireObjectArray(raw.conversations, 'conversations')?.map((item) => {
    requireString(item, 'id', 'conversations'); requireString(item, 'title', 'conversations'); requireString(item, 'characterAId', 'conversations'); requireString(item, 'characterBId', 'conversations'); return item;
  });
  const folders = requireObjectArray(raw.conversation_folders, 'conversation_folders')?.map((item) => {
    requireString(item, 'id', 'conversation_folders'); requireString(item, 'name', 'conversation_folders');
    if (!Array.isArray(item.conversationIds)) throw new Error('conversation_folders is missing conversationIds');
    return { ...item, conversationIds: item.conversationIds.filter((id): id is string => typeof id === 'string') };
  });
  const roles = new Set<MessageRole>(['user', 'charA', 'charB', 'system', 'distilled', 'scribe', 'image']);
  const nodes = requireObjectArray(raw.message_nodes, 'message_nodes')?.map((item, index) => {
    requireString(item, 'id', 'message_nodes'); requireString(item, 'conversationId', 'message_nodes'); requireString(item, 'role', 'message_nodes'); requireString(item, 'content', 'message_nodes');
    if (!roles.has(item.role as MessageRole)) throw new Error('message_nodes contains an unknown role');
    const { debugPrompt: _debugPrompt, debugResponse: _debugResponse, ...safeNode } = item;
    if (safeNode.imageData && isRecord(safeNode.imageData)) {
      const image = safeNode.imageData;
      if (typeof image.dataUrl !== 'string' || typeof image.mimeType !== 'string' || !isRecord(image.generation)) {
        throw new Error('message_nodes contains invalid image data');
      }
      safeNode.imageData = { blob: dataUrlToBlob(image.dataUrl), mimeType: image.mimeType, generation: image.generation };
    }
    return { ...safeNode, timestamp: Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : Date.now() + index };
  });
  const imageChannels = requireObjectArray(raw.image_channels, 'image_channels')?.map((item) => {
    requireString(item, 'id', 'image_channels'); requireString(item, 'name', 'image_channels'); requireString(item, 'imageModel', 'image_channels');
    const hasNewEndpoint = typeof item.baseUrl === 'string' && item.baseUrl.trim().length > 0;
    const hasLegacyBinding = typeof item.modelId === 'string' && item.modelId.length > 0;
    if (!hasNewEndpoint && !hasLegacyBinding) throw new Error('image_channels is missing baseUrl');
    const { secretId: _secretId, apiKey: _apiKey, ...safe } = item;
    const kind = item.kind === 'novelai' || item.kind === 'comfyui' || item.kind === 'nano_banana' ? item.kind : 'openai';
    if (kind === 'comfyui') {
      const workflow = validateComfyWorkflow(safe.comfyWorkflow);
      const mapping = normalizeComfyMapping(safe.comfyMapping, workflow);
      return { ...safe, kind, comfyWorkflow: workflow, comfyMapping: mapping };
    }
    return { ...safe, kind };
  });  const worldbooks = requireObjectArray(raw.worldbooks, 'worldbooks')?.map((item) => {
    requireString(item, 'id', 'worldbooks'); requireString(item, 'name', 'worldbooks');
    if (!Array.isArray(item.entries)) throw new Error('worldbooks is missing entries');
    return item;
  });
  const globalStates = requireObjectArray(raw.global_states, 'global_states')?.map((item) => { requireString(item, 'conversationId', 'global_states'); return item; });
  const stickerPacks = requireObjectArray(raw.sticker_packs, 'sticker_packs')?.map((item) => {
    requireString(item, 'id', 'sticker_packs'); requireString(item, 'name', 'sticker_packs');
    if (!Array.isArray(item.stickers) || item.stickers.length > MAX_STICKERS_PER_PACK) throw new Error('Invalid sticker pack');
    item.stickers.forEach((sticker) => {
      if (!isRecord(sticker)) throw new Error('Invalid sticker item');
      ['id', 'label', 'mimeType', 'dataUrl'].forEach((field) => requireString(sticker, field, 'sticker_packs.stickers'));
    });
    return item;
  });
  if ((stickerPacks?.length || 0) > MAX_STICKER_PACKS) throw new Error(`A backup can contain at most ${MAX_STICKER_PACKS} sticker packs`);
  const normalized: BackupData = { models, characters, conversations, conversation_folders: folders, message_nodes: nodes, worldbooks, global_states: globalStates, sticker_packs: stickerPacks, image_channels: imageChannels };
  if (!Object.values(normalized).some((value) => value !== undefined)) throw new Error('No importable data was found');
  return normalized;
}

/** Replaces business data only. Vault contents are intentionally unreachable from this function. */
export async function importBackupPayload(raw: unknown): Promise<void> {
  const data = normalizeBackupPayload(raw);
  const db = await import('../db/index');
  const stores = await import('../db/stores');
  const targets = [
    { store: db.modelsStore, value: data.models },
    { store: db.charactersStore, value: data.characters },
    { store: db.conversationsStore, value: data.conversations },
    { store: db.conversationFoldersStore, value: data.conversation_folders },
    { store: db.worldbooksStore, value: data.worldbooks },
    { store: db.globalStatesStore, value: data.global_states },
    { store: db.imageChannelsStore, value: data.image_channels },
  ].filter((item) => item.value !== undefined);
  const previous = await Promise.all(targets.map(async (target) => ({ store: target.store, value: await target.store.getItem('data') })));
  const previousNodes = data.message_nodes !== undefined ? await stores.getAllMessageNodes() : undefined;
  const previousStickers = data.sticker_packs !== undefined ? await stores.getAllStickerPacks() : undefined;
  const previousImageChannels = data.image_channels !== undefined ? await stores.getAllImageChannels() : undefined;
  try {
    const stickerPacks: StickerPack[] | undefined = data.sticker_packs?.map((rawPack) => {
      const pack = rawPack as Record<string, unknown>;
      const stickers = (pack.stickers as SerializedStickerItem[]).map((sticker) => {
        const blob = dataUrlToBlob(sticker.dataUrl);
        if (blob.size > MAX_ANIMATED_STICKER_BYTES) throw new Error(`Sticker ${sticker.label} exceeds 1.8 MiB`);
        return { id: sticker.id, label: sticker.label, mimeType: sticker.mimeType, size: blob.size, blob };
      });
      return { id: String(pack.id), name: String(pack.name), createdAt: Number(pack.createdAt) || Date.now(), stickers };
    });
    for (const target of targets) await target.store.setItem('data', target.value);
    if (data.message_nodes) await stores.replaceAllMessageNodes(data.message_nodes as MessageNode[]);
    if (stickerPacks) await stores.replaceAllStickerPacks(stickerPacks);
  } catch (error) {
    await Promise.allSettled(previous.map((item) => item.store.setItem('data', item.value)));
    if (previousNodes) await stores.replaceAllMessageNodes(previousNodes);
    if (previousStickers) await stores.replaceAllStickerPacks(previousStickers);
    if (previousImageChannels) await stores.replaceAllImageChannels(previousImageChannels);
    throw error;
  }
}

export function downloadJsonFile(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function readJsonFile(file: File): Promise<unknown> {
  return JSON.parse(await readFileAsTextRobust(file));
}
