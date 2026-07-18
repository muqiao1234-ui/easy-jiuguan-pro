import type { WorldBook, WorldBookEntry } from '../types';
import { generateId } from './id';
import { DEFAULT_TPL_CACHE_WORLD_BOOK_PROMPT } from './constants';

export const CACHE_WORLD_BOOK_LIMIT = 10;
const CACHE_ENTRY_VALUE_LIMIT = 12000;
const MANUAL_KEY_PROMPT_LIMIT = 200;
const MANUAL_KEY_PROMPT_CHAR_LIMIT = 4000;

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
  if (wb.kind === 'cache') {
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
  return raw
    .filter((key): key is string | number => typeof key === 'string' || typeof key === 'number')
    .map((key) => String(key).trim())
    .filter(Boolean)
    .slice(0, 6);
}

export function mergeCacheWorldBookEntries(
  current: WorldBookEntry[],
  operations: unknown,
  blockedKeys: Iterable<string> = []
): WorldBookEntry[] {
  let entries = Array.isArray(current) ? [...current] : [];
  if (!Array.isArray(operations)) return entries.slice(0, CACHE_WORLD_BOOK_LIMIT);
  const blocked = new Set(
    Array.from(blockedKeys, (key) => key.trim().toLocaleLowerCase()).filter(Boolean)
  );

  for (const operation of operations) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) continue;
    const candidate = operation as CacheWorldBookOperation;
    const keys = normalizeKeys(candidate.keys, candidate.key);
    if (keys.length === 0) continue;

    const op = candidate.op || 'upsert';
    if (op !== 'upsert' && op !== 'delete') continue;
    const primaryKey = keys[0].toLowerCase();
    const existingIndex = entries.findIndex((entry) =>
      entry.keys.some((key) => key.toLowerCase() === primaryKey)
    );

    if (op === 'delete') {
      if (existingIndex !== -1) entries.splice(existingIndex, 1);
      continue;
    }

    if (keys.some((key) => blocked.has(key.toLocaleLowerCase()))) continue;
    if (typeof candidate.value !== 'string') continue;
    const value = candidate.value.trim().slice(0, CACHE_ENTRY_VALUE_LIMIT);
    if (!value) continue;
    const priority = typeof candidate.priority === 'number' && Number.isFinite(candidate.priority)
      ? Math.max(1, Math.min(10, Math.floor(candidate.priority)))
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
  const allManualKeys = Array.from(new Set(
    (manualBook?.entries || []).flatMap((entry) => entry.keys).map((key) => key.trim()).filter(Boolean)
  ));
  const selectedManualKeys: string[] = [];
  let manualKeyChars = 0;
  for (const key of allManualKeys.slice(0, MANUAL_KEY_PROMPT_LIMIT)) {
    if (manualKeyChars + key.length > MANUAL_KEY_PROMPT_CHAR_LIMIT) break;
    selectedManualKeys.push(key);
    manualKeyChars += key.length;
  }
  const omittedCount = allManualKeys.length - selectedManualKeys.length;
  const manualKeys = selectedManualKeys.length
    ? `${selectedManualKeys.join(' / ')}${omittedCount > 0 ? ` / （另有 ${omittedCount} 个关键词已省略）` : ''}`
    : '（无）';

  return (template?.trim() || DEFAULT_TPL_CACHE_WORLD_BOOK_PROMPT)
    .split('{limit}').join(String(CACHE_WORLD_BOOK_LIMIT))
    .split('{manualKeys}').join(manualKeys)
    .split('{cacheEntries}').join(cacheEntries);
}
