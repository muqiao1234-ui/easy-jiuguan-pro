import { useState, useCallback } from 'react';
import type { WorldBook, WorldBookEntry } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';
import { CACHE_WORLD_BOOK_LIMIT, createCacheWorldBook, normalizeCacheWorldBook } from '../utils/cacheWorldBook';

export function useWorldBooks() {
  const [worldbooks, setWorldBooks] = useState<WorldBook[]>([]);
  const [loading, setLoading] = useState(false);

  const loadWorldBooks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await Stores.getAllWorldBooks();
      setWorldBooks(data.map(normalizeCacheWorldBook));
    } catch (e) {
      console.error('loadWorldBooks failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const addWorldBook = useCallback(async (name: string) => {
    const wb: WorldBook = { id: generateId(), name, entries: [] };
    await Stores.addWorldBook(wb);
    setWorldBooks((prev) => [...prev, wb]);
    return wb;
  }, []);

  const addCacheWorldBook = useCallback(async (name: string) => {
    const wb = createCacheWorldBook(name);
    await Stores.addWorldBook(wb);
    setWorldBooks((prev) => [...prev, wb]);
    return wb;
  }, []);

  const updateWorldBook = useCallback(async (id: string, updates: Partial<WorldBook>) => {
    const current = worldbooks.find((w) => w.id === id);
    const isCache = current?.kind === 'cache' || updates.kind === 'cache';
    const safeUpdates = isCache && updates.entries
      ? { ...updates, kind: 'cache' as const, entryLimit: CACHE_WORLD_BOOK_LIMIT, entries: updates.entries.slice(0, CACHE_WORLD_BOOK_LIMIT) }
      : updates;
    await Stores.updateWorldBook(id, safeUpdates);
    setWorldBooks((prev) =>
      prev.map((w) => (w.id === id ? normalizeCacheWorldBook({ ...w, ...safeUpdates }) : w))
    );
  }, [worldbooks]);

  const deleteWorldBook = useCallback(async (id: string) => {
    await Stores.deleteWorldBook(id);
    setWorldBooks((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const addEntry = useCallback(
    async (wbId: string, keys: string[], value: string, priority: number) => {
      const wb = worldbooks.find((w) => w.id === wbId);
      if (!wb) return;
      const isCache = wb.kind === 'cache';
      if (isCache && wb.entries.length >= CACHE_WORLD_BOOK_LIMIT) return;
      const entry: WorldBookEntry = { id: generateId(), keys, value, priority };
      const updatedEntries = isCache
        ? [...wb.entries, entry].slice(0, CACHE_WORLD_BOOK_LIMIT)
        : [...wb.entries, entry];
      await Stores.updateWorldBook(wbId, {
        entries: updatedEntries,
        ...(isCache ? { kind: 'cache' as const, entryLimit: CACHE_WORLD_BOOK_LIMIT } : {}),
      });
      setWorldBooks((prev) =>
        prev.map((w) => (w.id === wbId ? { ...w, entries: updatedEntries } : w))
      );
      return entry;
    },
    [worldbooks]
  );

  const updateEntry = useCallback(
    async (wbId: string, entryId: string, updates: Partial<WorldBookEntry>) => {
      const wb = worldbooks.find((w) => w.id === wbId);
      if (!wb) return;
      const updatedEntries = wb.entries.map((e) =>
        e.id === entryId ? { ...e, ...updates } : e
      );
      await Stores.updateWorldBook(wbId, { entries: updatedEntries });
      setWorldBooks((prev) =>
        prev.map((w) => (w.id === wbId ? { ...w, entries: updatedEntries } : w))
      );
    },
    [worldbooks]
  );

  const bulkAddEntries = useCallback(
    async (
      wbId: string,
      newEntries: { keys: string[]; value: string; priority: number }[]
    ) => {
      const wb = worldbooks.find((w) => w.id === wbId);
      if (!wb) return 0;
      const isCache = wb.kind === 'cache';
      const entries: WorldBookEntry[] = newEntries.map((e) => ({
        id: generateId(),
        keys: e.keys,
        value: e.value,
        priority: e.priority,
      }));
      const availableSlots = isCache ? Math.max(0, CACHE_WORLD_BOOK_LIMIT - wb.entries.length) : entries.length;
      const entriesToAdd = isCache ? entries.slice(0, availableSlots) : entries;
      const updatedEntries = [...wb.entries, ...entriesToAdd];
      await Stores.updateWorldBook(wbId, {
        entries: updatedEntries,
        ...(isCache ? { kind: 'cache' as const, entryLimit: CACHE_WORLD_BOOK_LIMIT } : {}),
      });
      setWorldBooks((prev) =>
        prev.map((w) => (w.id === wbId ? { ...w, entries: updatedEntries } : w))
      );
      return entriesToAdd.length;
    },
    [worldbooks]
  );

  const deleteEntry = useCallback(
    async (wbId: string, entryId: string) => {
      const wb = worldbooks.find((w) => w.id === wbId);
      if (!wb) return;
      const updatedEntries = wb.entries.filter((e) => e.id !== entryId);
      await Stores.updateWorldBook(wbId, { entries: updatedEntries });
      setWorldBooks((prev) =>
        prev.map((w) => (w.id === wbId ? { ...w, entries: updatedEntries } : w))
      );
    },
    [worldbooks]
  );

  return {
    worldbooks,
    loading,
    loadWorldBooks,
    addWorldBook,
    addCacheWorldBook,
    updateWorldBook,
    deleteWorldBook,
    addEntry,
    bulkAddEntries,
    updateEntry,
    deleteEntry,
  };
}
