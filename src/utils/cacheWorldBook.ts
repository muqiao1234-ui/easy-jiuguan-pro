import type { WorldBook, WorldBookEntry } from '../types';
import { generateId } from './id';
import { DEFAULT_TPL_CACHE_WORLD_BOOK_PROMPT } from './constants';

export const CACHE_WORLD_BOOK_LIMIT = 10;

export interface CacheWorldBookOperation {
  op?: 'upsert' | 'delete';
  keys?: unknown;
  key?: unknown;
  value?: unknown;
  priority?: unknown;
}

export interface CacheWorldBookPatch {
  operations?: CacheWorldBookOperation[];
}

export function createCacheWorldBook(name: string): WorldBook {
  return {
    id: generateId(),
    name: name.trim() || '<缓存世界书>',
    kind: 'cache',
    entryLimit: CACHE_WORLD_BOOK_LIMIT,
    entries: [],
  };
}

export function normalizeCacheWorldBook(wb: WorldBook): WorldBook {
  if (wb.kind === 'cache' || wb.entryLimit === CACHE_WORLD_BOOK_LIMIT || wb.name.includes('缓存世界书')) {
    return {
      ...wb,
      kind: 'cache',
      entryLimit: CACHE_WORLD_BOOK_LIMIT,
      entries: wb.entries.slice(0, CACHE_WORLD_BOOK_LIMIT),
    };
  }
  return wb;
}

function normalizeKeys(keys: unknown, fallbackKey?: unknown): string[] {
  const raw = Array.isArray(keys) ? keys : keys !== undefined ? [keys] : fallbackKey !== undefined ? [fallbackKey] : [];
  return raw.map((key) => String(key).trim()).filter(Boolean).slice(0, 6);
}

export function mergeCacheWorldBookEntries(
  current: WorldBookEntry[],
  operations: CacheWorldBookOperation[]
): WorldBookEntry[] {
  let entries = [...current];

  for (const operation of operations) {
    const keys = normalizeKeys(operation.keys, operation.key);
    if (keys.length === 0) continue;

    const op = operation.op || 'upsert';
    const primaryKey = keys[0].toLowerCase();
    const existingIndex = entries.findIndex((entry) =>
      entry.keys.some((key) => key.toLowerCase() === primaryKey)
    );

    if (op === 'delete') {
      if (existingIndex !== -1) entries.splice(existingIndex, 1);
      continue;
    }

    const value = String(operation.value ?? '').trim();
    if (!value) continue;
    const priority = typeof operation.priority === 'number'
      ? Math.max(1, Math.min(10, Math.floor(operation.priority)))
      : 5;
    const entry: WorldBookEntry = {
      id: existingIndex !== -1 ? entries[existingIndex].id : generateId(),
      keys,
      value,
      priority,
    };

    if (existingIndex !== -1) {
      entries[existingIndex] = entry;
    } else {
      entries.unshift(entry);
    }
  }

  return entries
    .sort((a, b) => (b.priority ?? 5) - (a.priority ?? 5))
    .slice(0, CACHE_WORLD_BOOK_LIMIT);
}

export function extractCacheWorldBookPatch(raw: string): { displayText: string; patch: CacheWorldBookPatch | null } {
  const tagPattern = /<CACHE_WORLDBOOK_JSON>\s*([\s\S]*?)\s*<\/CACHE_WORLDBOOK_JSON>/i;
  const tagMatch = raw.match(tagPattern);
  const jsonText = tagMatch?.[1];
  if (!jsonText) return { displayText: raw.trim(), patch: null };

  try {
    const parsed = JSON.parse(jsonText);
    const operations = Array.isArray(parsed?.operations) ? parsed.operations : [];
    return {
      displayText: raw.replace(tagPattern, '').trim(),
      patch: { operations },
    };
  } catch {
    return { displayText: raw.replace(tagPattern, '').trim(), patch: null };
  }
}

export function buildCacheWorldBookPrompt(
  cacheBook: WorldBook,
  manualBook: WorldBook | null,
  template?: string
): string {
  const cacheEntries = cacheBook.entries
    .map((entry, index) => `${index + 1}. keys=${JSON.stringify(entry.keys)} priority=${entry.priority}\n${entry.value}`)
    .join('\n\n') || '（当前为空）';
  const manualKeys = manualBook?.entries
    ?.flatMap((entry) => entry.keys)
    .filter(Boolean)
    .join(' / ') || '（无）';

  return (template?.trim() || DEFAULT_TPL_CACHE_WORLD_BOOK_PROMPT)
    .split('{limit}').join(String(CACHE_WORLD_BOOK_LIMIT))
    .split('{manualKeys}').join(manualKeys)
    .split('{cacheEntries}').join(cacheEntries);
}
