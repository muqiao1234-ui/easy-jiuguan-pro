import { useState, useCallback } from 'react';
import type { WorldBook, WorldBookEntry } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';

export function useWorldBooks() {
  const [worldbooks, setWorldBooks] = useState<WorldBook[]>([]);
  const [loading, setLoading] = useState(false);

  const loadWorldBooks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await Stores.getAllWorldBooks();
      setWorldBooks(data);
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

  const updateWorldBook = useCallback(async (id: string, updates: Partial<WorldBook>) => {
    await Stores.updateWorldBook(id, updates);
    setWorldBooks((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...updates } : w))
    );
  }, []);

  const deleteWorldBook = useCallback(async (id: string) => {
    await Stores.deleteWorldBook(id);
    setWorldBooks((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const addEntry = useCallback(
    async (wbId: string, keys: string[], value: string, priority: number) => {
      const wb = worldbooks.find((w) => w.id === wbId);
      if (!wb) return;
      const entry: WorldBookEntry = { id: generateId(), keys, value, priority };
      const updatedEntries = [...wb.entries, entry];
      await Stores.updateWorldBook(wbId, { entries: updatedEntries });
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
      const entries: WorldBookEntry[] = newEntries.map((e) => ({
        id: generateId(),
        keys: e.keys,
        value: e.value,
        priority: e.priority,
      }));
      const updatedEntries = [...wb.entries, ...entries];
      await Stores.updateWorldBook(wbId, { entries: updatedEntries });
      setWorldBooks((prev) =>
        prev.map((w) => (w.id === wbId ? { ...w, entries: updatedEntries } : w))
      );
      return entries.length;
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
    updateWorldBook,
    deleteWorldBook,
    addEntry,
    bulkAddEntries,
    updateEntry,
    deleteEntry,
  };
}
