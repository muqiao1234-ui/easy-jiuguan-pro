import { useState, useCallback } from 'react';
import type { Character } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';

export function useCharacters() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCharacters = useCallback(async () => {
    try {
      setLoading(true);
      const data = await Stores.getAllCharacters();
      setCharacters(data);
    } catch (e) {
      console.error('loadCharacters failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const addCharacter = useCallback(
    async (
      name: string,
      systemPrompt: string,
      avatar: string = '🤖',
      worldBookId?: string,
      cacheWorldBookId?: string
    ) => {
      const char: Character = {
        id: generateId(),
        name,
        avatar,
        systemPrompt,
        worldBookId,
        cacheWorldBookId,
      };
      await Stores.addCharacter(char);
      setCharacters((prev) => [...prev, char]);
      return char;
    },
    []
  );

  const updateCharacter = useCallback(
    async (id: string, updates: Partial<Character>) => {
      await Stores.updateCharacter(id, updates);
      setCharacters((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
      );
    },
    []
  );

  const deleteCharacter = useCallback(async (id: string) => {
    await Stores.deleteCharacter(id);
    setCharacters((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return {
    characters,
    loading,
    loadCharacters,
    addCharacter,
    updateCharacter,
    deleteCharacter,
  };
}
