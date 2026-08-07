import { useState, useCallback, useEffect } from 'react';
import type { Character } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';

type CharacterChange =
  | { type: 'add'; character: Character }
  | { type: 'update'; id: string; updates: Partial<Character> }
  | { type: 'delete'; id: string };

const characterChangeListeners = new Set<(change: CharacterChange) => void>();

function notifyCharacterChange(change: CharacterChange): void {
  characterChangeListeners.forEach((listener) => listener(change));
}

export function useCharacters() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const listener = (change: CharacterChange) => {
      setCharacters((prev) => {
        if (change.type === 'add') {
          return prev.some((character) => character.id === change.character.id)
            ? prev
            : [...prev, change.character];
        }
        if (change.type === 'update') {
          return prev.map((character) =>
            character.id === change.id ? { ...character, ...change.updates } : character
          );
        }
        return prev.filter((character) => character.id !== change.id);
      });
    };

    characterChangeListeners.add(listener);
    return () => {
      characterChangeListeners.delete(listener);
    };
  }, []);

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
      cacheWorldBookId?: string,
      firstMessage?: string,
      mvuEnabled: boolean = true
    ) => {
      const char: Character = {
        id: generateId(),
        name,
        avatar,
        systemPrompt,
        worldBookId,
        cacheWorldBookId,
        firstMessage: firstMessage?.trim() || undefined,
        mvuEnabled,
      };
      await Stores.addCharacter(char);
      notifyCharacterChange({ type: 'add', character: char });
      return char;
    },
    []
  );

  const updateCharacter = useCallback(
    async (id: string, updates: Partial<Character>) => {
      await Stores.updateCharacter(id, updates);
      notifyCharacterChange({ type: 'update', id, updates });
    },
    []
  );

  const deleteCharacter = useCallback(async (id: string) => {
    await Stores.deleteCharacter(id);
    notifyCharacterChange({ type: 'delete', id });
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
