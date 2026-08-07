import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StickerItem, StickerPack } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';
import { MAX_STICKER_PACKS, MAX_STICKERS_PER_PACK } from '../utils/constants';

const listeners = new Set<() => void>();
function notifyStickerPacksChanged() {
  listeners.forEach((listener) => listener());
}

export function useStickerPacks() {
  const [packs, setPacks] = useState<StickerPack[]>([]);

  const loadPacks = useCallback(async () => {
    setPacks(await Stores.getAllStickerPacks());
  }, []);

  useEffect(() => {
    listeners.add(loadPacks);
    void loadPacks();
    return () => { listeners.delete(loadPacks); };
  }, [loadPacks]);

  const assetUrls = useMemo(() => {
    const urls: Record<string, string> = {};
    for (const pack of packs) {
      for (const sticker of pack.stickers) urls[sticker.id] = URL.createObjectURL(sticker.blob);
    }
    return urls;
  }, [packs]);

  useEffect(() => () => {
    Object.values(assetUrls).forEach((url) => URL.revokeObjectURL(url));
  }, [assetUrls]);

  const createPack = useCallback(async (name: string) => {
    const existing = await Stores.getAllStickerPacks();
    if (existing.length >= MAX_STICKER_PACKS) throw new Error(`最多只能创建 ${MAX_STICKER_PACKS} 组表情包`);
    const pack: StickerPack = {
      id: generateId(),
      name: name.trim() || `表情包 ${existing.length + 1}`,
      stickers: [],
      createdAt: Date.now(),
    };
    await Stores.addStickerPack(pack);
    notifyStickerPacksChanged();
    return pack;
  }, []);

  const updatePack = useCallback(async (id: string, updates: Partial<StickerPack>) => {
    await Stores.updateStickerPack(id, updates);
    notifyStickerPacksChanged();
  }, []);

  const addSticker = useCallback(async (packId: string, sticker: StickerItem) => {
    const pack = (await Stores.getAllStickerPacks()).find((item) => item.id === packId);
    if (!pack) throw new Error('表情包不存在');
    if (pack.stickers.length >= MAX_STICKERS_PER_PACK) throw new Error(`每组最多 ${MAX_STICKERS_PER_PACK} 张表情`);
    await Stores.updateStickerPack(packId, { stickers: [...pack.stickers, sticker] });
    notifyStickerPacksChanged();
  }, []);

  const removeSticker = useCallback(async (packId: string, stickerId: string) => {
    const pack = (await Stores.getAllStickerPacks()).find((item) => item.id === packId);
    if (!pack) return;
    await Stores.updateStickerPack(packId, { stickers: pack.stickers.filter((item) => item.id !== stickerId) });
    notifyStickerPacksChanged();
  }, []);

  const deletePack = useCallback(async (id: string) => {
    await Stores.deleteStickerPack(id);
    notifyStickerPacksChanged();
  }, []);

  return { packs, assetUrls, loadPacks, createPack, updatePack, addSticker, removeSticker, deletePack };
}
