import JSON5 from 'json5';
import { parse as parseYaml } from 'yaml';
import type { MessageNode, MvuNodeData, MvuOperation, MvuSchemaNode, MvuSnapshot, WorldBook, WorldBookEntry } from '../types';

export const MVU_CHECKPOINT_INTERVAL = 8;

export type MvuRole = 'charA' | 'charB';

/** 同一张角色卡可以同时绑定到 A/B，状态作用域必须包含对话角色位。 */
export function getMvuScopeId(characterId: string, role: MvuRole): string {
  return `${characterId}:${role}`;
}

export interface MvuChange {
  path: string;
  oldValue: unknown;
  newValue: unknown;
  reason?: string;
}

export interface MvuRuntimeState {
  snapshot: MvuSnapshot;
  replyCount: number;
  lastChanges: MvuChange[];
}

export interface ParsedMvuResponse {
  content: string;
  operations: MvuOperation[];
  diagnostics: string[];
}

const UPDATE_BLOCK = /<\s*(?:update[\s_-]*variable|variable[\s_-]*update|mvu[\s_-]*update|update)\b[^>]*>([\s\S]*?)<\s*\/\s*(?:update[\s_-]*variable|variable[\s_-]*update|mvu[\s_-]*update|update)\s*>/gi;
const JSON_PATCH_BLOCK = /<\s*(?:json[\s_-]*patch|patch)\b[^>]*>([\s\S]*?)<\s*\/\s*(?:json[\s_-]*patch|patch)\s*>/gi;

export type MvuProtocol = 'json-patch' | 'script' | 'hybrid' | 'generic';
export function hasMvuValidationFailure(diagnostics: string[]): boolean {
  return diagnostics.some((diagnostic) => !/^DeepSeek MVU maintenance fallback executed:/.test(diagnostic));
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function stableValue(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

function cleanInitSource(source: string): string {
  const cleaned = source
    .replace(/<\s*initvar\s*>/gi, '')
    .replace(/<\s*\/\s*initvar\s*>/gi, '')
    .trim();
  const fenced = cleaned.match(/```(?:json5?|ya?ml)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : cleaned).trim();
}

function compactPromptState(value: unknown): unknown {
  if (Array.isArray(value)) {
    // 酒馆 MVU 常用 [当前值, 字段说明] 元组；说明已由规则提供，发送时只保留当前值。
    if (value.length === 2 && typeof value[1] === 'string') return compactPromptState(value[0]);
    return value.map(compactPromptState);
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== '$meta' && key !== '$internal')
    .map(([key, child]) => [key, compactPromptState(child)]));
}

function stripUnresolvedTavernMacros(source: string): string {
  return source
    .replace(/<\s*status_current_variable\s*>[\s\S]*?<\s*\/\s*status_current_variable\s*>/gi, '')
    .replace(/<\s*status_current_variables\s*>[\s\S]*?<\s*\/\s*status_current_variables\s*>/gi, '')
    .replace(/<%[\s\S]*?%>/g, '')
    .replace(/\{\{\s*(?:format_message_variable|get_message_variable|set_message_variable|setvar|getvar)\b[\s\S]*?\}\}/gi, '')
    .replace(/<\s*StatusPlaceHolderImpl\s*\/?\s*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseMvuInitValue(source: string): unknown {
  const cleaned = cleanInitSource(source);
  let json5Error: unknown;
  try {
    const parsed = JSON5.parse(cleaned);
    if (isRecord(parsed)) return parsed;
    throw new Error('初始化数据必须是对象');
  } catch (error) {
    json5Error = error;
  }

  // Prefer an embedded JSON object when explanatory prose precedes it.
  const embeddedStart = cleaned.indexOf('{');
  const embeddedEnd = cleaned.lastIndexOf('}');
  if (embeddedStart >= 0 && embeddedEnd > embeddedStart) {
    try {
      const embedded = JSON5.parse(cleaned.slice(embeddedStart, embeddedEnd + 1));
      if (isRecord(embedded)) return embedded;
    } catch {
      // Fall through to YAML parsing.
    }
  }

  // 酒馆生态中 InitVar 既有 JSON5，也有 YAML 或两者混写的对象。
  // YAML 解析器可以安全覆盖 JSON 子集，但只有在 JSON5 失败后才使用，避免改变旧卡的语义。
  try {
    const parsed = parseYaml(cleaned, { schema: 'core' });
    if (isRecord(parsed)) return parsed;
    throw new Error('初始化数据必须是对象');
  } catch (yamlError) {
    // Some cards prepend prose such as "system variables:" before the
    // payload. Recover an embedded JSON5 object without executing card code.
    const objectStart = cleaned.indexOf('{');
    const objectEnd = cleaned.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        const embedded = JSON5.parse(cleaned.slice(objectStart, objectEnd + 1));
        if (isRecord(embedded)) return embedded;
      } catch {
        // Continue with YAML line candidates and preserve useful diagnostics.
      }
    }

    // YAML loaders tolerate a JSON object, but not arbitrary explanatory
    // prose before it. Try each line as a possible YAML document start.
    const lines = cleaned.split(/\r?\n/);
    for (let start = 1; start < lines.length; start += 1) {
      const candidate = lines.slice(start).join('\n').trim();
      if (!candidate || !/^[^#\s][^:]*\s*:/m.test(candidate)) continue;
      try {
        const embedded = parseYaml(candidate, { schema: 'core' });
        if (isRecord(embedded)) return embedded;
      } catch {
        // Try the next possible YAML root.
      }
    }

    const json5Message = json5Error instanceof Error ? json5Error.message : String(json5Error);
    const yamlMessage = yamlError instanceof Error ? yamlError.message : String(yamlError);
    throw new Error(`JSON5: ${json5Message}; YAML: ${yamlMessage}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeObjects(base: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const next = clone(base);
  for (const [key, incomingValue] of Object.entries(incoming)) {
    if (isRecord(next[key]) && isRecord(incomingValue)) {
      next[key] = mergeObjects(next[key] as Record<string, unknown>, incomingValue);
    } else {
      next[key] = clone(incomingValue);
    }
  }
  return next;
}

function extractMeta(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) && isRecord(value.$meta) ? value.$meta : undefined;
}

function buildSchema(value: unknown): MvuSchemaNode {
  const meta = extractMeta(value);
  const base = {
    extensible: meta?.extensible === true,
    recursiveExtensible: meta?.recursiveExtensible === true,
    required: Array.isArray(meta?.required) ? meta!.required.filter((item): item is string => typeof item === 'string') : undefined,
  };
  if (Array.isArray(value)) {
    if (value.length === 2 && typeof value[1] === 'string') return buildSchema(value[0]);
    const usable = value.filter((item) => item !== '$__META_EXTENSIBLE__$' && !(isRecord(item) && item.$arrayMeta === true));
    return { type: 'array', elementType: usable.length > 0 ? buildSchema(usable[0]) : { type: 'any' }, ...base };
  }
  if (isRecord(value)) {
    const properties: Record<string, MvuSchemaNode> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key !== '$meta') properties[key] = buildSchema(child);
    }
    return { type: 'object', properties, ...base };
  }
  if (value === null) return { type: 'null', ...base };
  if (typeof value === 'string') return { type: 'string', ...base };
  if (typeof value === 'number') return { type: 'number', ...base };
  if (typeof value === 'boolean') return { type: 'boolean', ...base };
  return { type: 'any', ...base };
}

function cleanForDisplay(value: unknown): unknown {
  if (Array.isArray(value)) return value.filter((item) => item !== '$__META_EXTENSIBLE__$').map(cleanForDisplay);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== '$meta' && key !== '$internal')
    .map(([key, child]) => [key, cleanForDisplay(child)]));
}

export function getMvuEntryKind(entry: WorldBookEntry): 'init' | 'update' | 'plot' | null {
  const source = `${entry.comment || ''}\n${entry.keys.join(' ')}\n${entry.value}`;
  if (/\[\s*initvar\s*\]/i.test(source)) return 'init';
  if (/(?:\[\s*mvu_update\s*\]|mvu\s*变量更新|变量更新(?:详细规则|基础规则|规则)|更新变量|update\s*variable|updatevariable)/i.test(source)
    || /<\s*updatevariable\b|_\.(?:set|assign|insert|remove|delete|unset|add|move)\s*\(/i.test(entry.value)) return 'update';
  if (/\[\s*mvu_plot\s*\]/i.test(source)) return 'plot';
  return null;
}

export function getMvuEntryProtocol(entry: WorldBookEntry): MvuProtocol {
  const source = `${entry.comment || ''}\n${entry.value}`;
  const hasJsonPatch = /json[\s_-]*patch|rfc\s*6902|<\s*patch\b|["']op["']\s*:/i.test(source);
  const hasScript = /_\.(?:set|assign|insert|remove|delete|unset|add|move)\s*\(/i.test(source);
  if (hasJsonPatch && hasScript) return 'hybrid';
  if (hasJsonPatch) return 'json-patch';
  if (hasScript) return 'script';
  return 'generic';
}

function selectMvuRuleEntries(updateEntries: WorldBookEntry[]): { protocol: MvuProtocol; rules: string } {
  const normalized = updateEntries
    .map((entry) => ({ entry, protocol: getMvuEntryProtocol(entry), value: stripUnresolvedTavernMacros(entry.value) }))
    .filter(({ value }) => Boolean(value));
  const hasExplicitJsonPatch = normalized.some(({ protocol }) => protocol === 'json-patch' || protocol === 'hybrid');
  // 混合卡优先使用明确的 JSON Patch 规则，避免旧的 Tavern Helper _.set 说明覆盖新协议。
  const selected = hasExplicitJsonPatch
    ? normalized.filter(({ protocol }) => protocol === 'json-patch' || protocol === 'generic' || protocol === 'hybrid')
    : normalized;
  const protocol: MvuProtocol = hasExplicitJsonPatch
    ? (selected.some(({ protocol: itemProtocol }) => itemProtocol === 'hybrid') ? 'hybrid' : 'json-patch')
    : (selected.some(({ protocol: itemProtocol }) => itemProtocol === 'script') ? 'script' : 'generic');
  return { protocol, rules: selected.map(({ value }) => value).join('\n\n') };
}

export function isMvuControlEntry(entry: WorldBookEntry): boolean {
  const kind = getMvuEntryKind(entry);
  return kind === 'init' || kind === 'update';
}

export function parseMvuInitBooks(books: WorldBook[]): { snapshot: MvuSnapshot; diagnostics: string[] } {
  let statData: Record<string, unknown> = {};
  const initializedWorldBookIds: string[] = [];
  const diagnostics: string[] = [];
  for (const book of books) {
    const initEntries = book.entries.filter((entry) => getMvuEntryKind(entry) === 'init');
    if (initEntries.length === 0) continue;
    initializedWorldBookIds.push(book.id);
    for (const entry of initEntries) {
      try {
        const parsed = parseMvuInitValue(entry.value);
        if (!isRecord(parsed)) throw new Error('初始变量必须是对象');
        statData = mergeObjects(statData, parsed);
      } catch (error) {
        diagnostics.push(`${book.name}/${entry.keys[0] || 'InitVar'}: ${(error as Error).message}`);
      }
    }
  }
  return {
    snapshot: { statData, schema: buildSchema(statData), initializedWorldBookIds },
    diagnostics,
  };
}

function parsePath(path: string): string[] {
  const trimmed = path.trim();
  if (!trimmed) throw new Error('变量路径为空');
  const result: string[] = [];
  const regex = /(?:^|\.)([^.[\]]+)|\[(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|(\d+))\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(trimmed))) {
    const part = match[1] ?? match[2]?.replace(/\\([\\"])/g, '$1') ?? match[3]?.replace(/\\([\\'])/g, '$1') ?? match[4];
    if (part !== undefined) result.push(part);
  }
  if (result.length === 0 || result.join('.') !== trimmed.replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '').replace(/[\[\]'\"]/g, '')) {
    // Paths containing quoted dots are valid; only reject clearly unsupported syntax.
    if (/[^\w\u0080-\uffff.$\[\]'"-]/.test(trimmed)) throw new Error(`不支持的变量路径: ${path}`);
  }
  return result;
}

function getAtPath(root: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else if (isRecord(current)) {
      current = current[segment];
    } else return undefined;
  }
  return current;
}

function getParent(root: Record<string, unknown>, path: string[], create = false): { parent: Record<string, unknown> | unknown[]; key: string } {
  if (path.length === 0) throw new Error('变量路径为空');
  let current: Record<string, unknown> | unknown[] = root;
  for (const segment of path.slice(0, -1)) {
    const isArray = Array.isArray(current);
    const existing: unknown = isArray
      ? (current as unknown[])[Number(segment)]
      : (current as Record<string, unknown>)[segment];
    if (existing === undefined && create) {
      const next: Record<string, unknown> = {};
      if (isArray) (current as unknown[])[Number(segment)] = next;
      else (current as Record<string, unknown>)[segment] = next;
      current = next;
    } else if (Array.isArray(existing) || isRecord(existing)) {
      current = existing;
    } else {
      throw new Error(`路径 ${path.join('.')} 的父级不是对象`);
    }
  }
  return { parent: current, key: path[path.length - 1] };
}

function valueForSet(previous: unknown, next: unknown): unknown {
  // MVU 的 [value, description] 变量只替换第一个值，保留对模型的描述。
  if (Array.isArray(previous) && previous.length === 2 && typeof previous[1] === 'string') {
    return [clone(next), previous[1]];
  }
  return clone(next);
}

function applyOperation(statData: Record<string, unknown>, operation: MvuOperation): MvuChange {
  const path = parsePath(operation.path);
  const currentValue = getAtPath(statData, path);
  const oldValue = clone(currentValue);
  const comparableOldValue = Array.isArray(oldValue) && oldValue.length === 2 && typeof oldValue[1] === 'string'
    ? oldValue[0]
    : oldValue;
  if (operation.expectedValue !== undefined && stableValue(comparableOldValue) !== stableValue(operation.expectedValue)) {
    throw new Error(`${operation.path} 的旧值不匹配，已拒绝更新`);
  }

  if (operation.op === 'move') {
    if (!operation.from) throw new Error('move 缺少来源路径');
    const from = parsePath(operation.from);
    const movedValue = clone(getAtPath(statData, from));
    if (movedValue === undefined) throw new Error(`${operation.from} 不存在`);
    const fromParent = getParent(statData, from);
    if (Array.isArray(fromParent.parent)) fromParent.parent.splice(Number(fromParent.key), 1);
    else delete fromParent.parent[fromParent.key];
    const destination = getParent(statData, path, true);
    if (Array.isArray(destination.parent)) {
      if (destination.key === '-') destination.parent.push(movedValue);
      else destination.parent.splice(Number(destination.key), 0, movedValue);
    }
    else destination.parent[destination.key] = movedValue;
    return { path: operation.path, oldValue, newValue: movedValue, reason: operation.reason };
  }

  const target = getParent(statData, path, operation.op !== 'delete');
  if (operation.op === 'delete') {
    if (Array.isArray(target.parent)) {
      const index = Number(target.key);
      if (!Number.isInteger(index) || index < 0 || index >= target.parent.length) throw new Error(`${operation.path} 不存在`);
      target.parent.splice(index, 1);
    } else if (Object.prototype.hasOwnProperty.call(target.parent, target.key)) {
      delete target.parent[target.key];
    } else throw new Error(`${operation.path} 不存在`);
    return { path: operation.path, oldValue, newValue: undefined, reason: operation.reason };
  }

  if (operation.op === 'add') {
    if (typeof comparableOldValue !== 'number' || typeof operation.value !== 'number') throw new Error(`${operation.path} 只能对数字执行 add`);
    const next = comparableOldValue + operation.value;
    if (Array.isArray(target.parent)) target.parent[Number(target.key)] = valueForSet(currentValue, next);
    else target.parent[target.key] = valueForSet(currentValue, next);
    return { path: operation.path, oldValue, newValue: next, reason: operation.reason };
  }

  if (operation.op === 'insert' && Array.isArray(currentValue)) {
    const before = clone(currentValue);
    currentValue.push(clone(operation.value));
    return { path: operation.path, oldValue: before, newValue: clone(currentValue), reason: operation.reason };
  }

  // JSON Patch uses /- to append to an existing array.
  if (operation.op === 'insert' && path[path.length - 1] === '-') {
    const destination = getParent(statData, path, false);
    if (!Array.isArray(destination.parent)) throw new Error('追加目标不是数组');
    destination.parent.push(clone(operation.value));
    return { path: operation.path, oldValue: undefined, newValue: clone(operation.value), reason: operation.reason };
  }

  const nextValue = valueForSet(currentValue, operation.value);
  if (Array.isArray(target.parent)) {
    const index = Number(target.key);
    if (!Number.isInteger(index) || index < 0) throw new Error(`数组路径无效: ${operation.path}`);
    if (operation.op === 'insert') target.parent.splice(index, 0, nextValue);
    else target.parent[index] = nextValue;
  } else {
    target.parent[target.key] = nextValue;
  }
  return { path: operation.path, oldValue, newValue: cleanForDisplay(nextValue), reason: operation.reason };
}

export function applyMvuOperations(snapshot: MvuSnapshot, operations: MvuOperation[]): { snapshot: MvuSnapshot; changes: MvuChange[]; diagnostics: string[] } {
  const next: MvuSnapshot = clone(snapshot);
  const changes: MvuChange[] = [];
  const diagnostics: string[] = [];
  for (const operation of operations) {
    try {
      changes.push(applyOperation(next.statData, operation));
    } catch (error) {
      diagnostics.push(`${operation.op}(${operation.path}): ${(error as Error).message}`);
    }
  }
  next.schema = buildSchema(next.statData);
  return { snapshot: next, changes, diagnostics };
}

export function replayMvuState(
  nodes: MessageNode[],
  scopeId: string,
  initial: MvuSnapshot,
  legacyScopeId?: string
): MvuRuntimeState {
  let snapshot = clone(initial);
  let replyCount = 0;
  let lastChanges: MvuChange[] = [];
  for (const node of [...nodes].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))) {
    const data = node.mvuData;
    if (!data || (data.scopeId !== scopeId && data.scopeId !== legacyScopeId)) continue;
    replyCount += 1;
    const checkpointIsValid = !data.validationFailed && !hasMvuValidationFailure(data.diagnostics || []);
    if (data.checkpoint && checkpointIsValid) snapshot = clone(data.checkpoint);
    else if (data.operations.length > 0) {
      const result = applyMvuOperations(snapshot, data.operations);
      snapshot = result.snapshot;
    }
    lastChanges = (data.displayChanges || []).map((change) => ({ ...change }));
  }
  return { snapshot, replyCount, lastChanges };
}

function splitTopLevelArgs(source: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts;
}

function parseLiteral(source: string): unknown {
  const trimmed = source.trim();
  if (!trimmed) throw new Error('缺少参数');
  if (trimmed === 'undefined') throw new Error('不支持 undefined');
  return JSON5.parse(trimmed);
}

function parseStructuredResponse(source: string): unknown {
  const trimmed = source
    .replace(/^\s*```(?:json5?|ya?ml)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON5.parse(trimmed);
  } catch {
    return parseYaml(trimmed, { schema: 'core' });
  }
}

function readBalancedCall(source: string, start: number): { args: string; end: number } | null {
  let depth = 1;
  let quote = '';
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')' && --depth === 0) return { args: source.slice(start, index), end: index + 1 };
  }
  return null;
}

function parseScriptOperations(source: string, diagnostics: string[]): MvuOperation[] {
  const operations: MvuOperation[] = [];
  const matcher = /_\.(set|insert|assign|delete|remove|unset|add|move)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(source))) {
    const balanced = readBalancedCall(source, matcher.lastIndex);
    if (!balanced) {
      diagnostics.push(`未闭合的 _.${match[1]}() 调用`);
      break;
    }
    matcher.lastIndex = balanced.end;
    try {
      const args = splitTopLevelArgs(balanced.args);
      const rawOp = match[1] === 'assign' ? 'insert' : match[1] === 'remove' || match[1] === 'unset' ? 'delete' : match[1];
      const path = parseLiteral(args[0]);
      if (typeof path !== 'string') throw new Error('第一个参数必须是字符串路径');
      const reasonMatch = source.slice(balanced.end).match(/^\s*;?\s*\/\/\s*([^\n\r]*)/);
      const reason = reasonMatch?.[1]?.trim();
      if (rawOp === 'move') {
        const from = parseLiteral(args[0]);
        const to = parseLiteral(args[1]);
        if (typeof from !== 'string' || typeof to !== 'string') throw new Error('move 的路径必须是字符串');
        operations.push({ op: 'move', path: to, from, reason });
      } else if (rawOp === 'delete') {
        operations.push({ op: 'delete', path, reason });
      } else if (rawOp === 'set') {
        if (args.length < 2 || args.length > 3) throw new Error('set 需要 2 或 3 个参数');
        operations.push({ op: 'set', path, expectedValue: args.length === 3 ? parseLiteral(args[1]) : undefined, value: parseLiteral(args[args.length - 1]), reason });
      } else {
        if (args.length < 2) throw new Error(`${rawOp} 缺少新值`);
        operations.push({ op: rawOp as 'insert' | 'add', path, value: parseLiteral(args[1]), reason });
      }
    } catch (error) {
      diagnostics.push(`_.${match[1]}: ${(error as Error).message}`);
    }
  }
  return operations;
}

function jsonPointerToPath(path: string): string {
  if (!path.startsWith('/')) throw new Error('JSON Patch 路径必须以 / 开头');
  return path.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~')).join('.');
}

function normalizeJsonPatchPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) throw new Error('JSON Patch path is empty');
  // Support both RFC 6902 JSON Pointer and the dotted paths used by Tavern cards.
  if (!trimmed.startsWith('/')) return trimmed;
  return trimmed.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~')).join('.');
}

function parseJsonPatch(source: string, diagnostics: string[]): MvuOperation[] {
  try {
    const parsed = parseStructuredResponse(source);
    const entries = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.operations)
        ? parsed.operations
        : isRecord(parsed) && Array.isArray(parsed.patch)
          ? parsed.patch
          : isRecord(parsed) && typeof parsed.op === 'string' && typeof parsed.path === 'string'
            ? [parsed]
            : [];
    const operations: MvuOperation[] = [];
    for (const entry of entries) {
      if (!isRecord(entry) || typeof entry.op !== 'string' || typeof entry.path !== 'string') continue;
      const op = entry.op.toLowerCase();
      const path = normalizeJsonPatchPath(entry.path);
      if (op === 'replace' || op === 'set') operations.push({ op: 'set', path, value: entry.value, reason: typeof entry.reason === 'string' ? entry.reason : undefined });
      else if (op === 'add') {
        const isArrayAppend = path.endsWith('.-') || path === '-';
        operations.push({ op: 'insert', path: isArrayAppend ? path.replace(/(?:^|\.)-$/, '') : path, value: entry.value, reason: typeof entry.reason === 'string' ? entry.reason : undefined });
      } else if (op === 'insert') operations.push({ op: 'insert', path, value: entry.value, reason: typeof entry.reason === 'string' ? entry.reason : undefined });
      else if (op === 'remove' || op === 'delete') operations.push({ op: 'delete', path, reason: typeof entry.reason === 'string' ? entry.reason : undefined });
      else if (op === 'delta') operations.push({ op: 'add', path, value: entry.value, reason: typeof entry.reason === 'string' ? entry.reason : undefined });
      else if (op === 'move' && typeof entry.from === 'string') operations.push({ op: 'move', path, from: normalizeJsonPatchPath(entry.from), reason: typeof entry.reason === 'string' ? entry.reason : undefined });
    }
    return operations;
  } catch (error) {
    diagnostics.push(`JSON Patch: ${(error as Error).message}`);
    return [];
  }
}

export function parseMvuResponse(raw: string): ParsedMvuResponse {
  const diagnostics: string[] = [];
  const operations: MvuOperation[] = [];
  let content = raw;
  content = content.replace(UPDATE_BLOCK, (_block, inner: string) => {
    const beforeCount = operations.length;
    operations.push(...parseScriptOperations(inner, diagnostics));
    operations.push(...[...inner.matchAll(JSON_PATCH_BLOCK)].flatMap((match) => parseJsonPatch(match[1], diagnostics)));
    if (operations.length === beforeCount && /(?:^|[\[{\r\n])\s*["']?(?:op|operations|patch)["']?\s*:/i.test(inner)) {
      operations.push(...parseJsonPatch(inner, diagnostics));
    }
    return '';
  });
  content = content.replace(JSON_PATCH_BLOCK, (_block, inner: string) => {
    operations.push(...parseJsonPatch(inner, diagnostics));
    return '';
  });

  // Some models omit the XML wrapper but still return a fenced patch.
  content = content.replace(/```(?:json5?|ya?ml)?\s*([\s\S]*?)```/gi, (block, inner: string) => {
    if (!/(?:["']?op["']?\s*:|["']?(?:operations|patch)["']?\s*:)/i.test(inner)) return block;
    const parsed = parseJsonPatch(inner, diagnostics);
    if (parsed.length === 0) return block;
    operations.push(...parsed);
    return '';
  });
  return { content: content.trim(), operations, diagnostics };
}

/** Hides completed and still-streaming MVU control blocks before the bubble is rendered. */
export function filterMvuStreamingText(raw: string): string {
  const completed = parseMvuResponse(raw).content;
  const open = completed.match(/<\s*(?:update[\s_-]*variable|variable[\s_-]*update|mvu[\s_-]*update|update|json[\s_-]*patch|patch)\b[^>]*>/i);
  return open ? completed.slice(0, open.index).trimEnd() : completed;
}

export function createMvuNodeData(scopeId: string, runtime: MvuRuntimeState, operations: MvuOperation[], diagnostics: string[]): MvuNodeData {
  const applied = applyMvuOperations(runtime.snapshot, operations);
  const allDiagnostics = [...diagnostics, ...applied.diagnostics];
  const validationFailed = hasMvuValidationFailure(allDiagnostics);
  const nextReplyCount = runtime.replyCount + 1;
  const checkpoint = !validationFailed && (nextReplyCount === 1 || nextReplyCount % MVU_CHECKPOINT_INTERVAL === 0);
  return {
    scopeId,
    operations,
    checkpoint: checkpoint ? applied.snapshot : undefined,
    displayState: cleanForDisplay(applied.snapshot.statData) as Record<string, unknown>,
    displayChanges: applied.changes,
    diagnostics: allDiagnostics,
    validationFailed,
  };
}
export function buildMvuPrompt(template: string, runtime: MvuRuntimeState, updateEntries: WorldBookEntry[]): string {
  const selected = selectMvuRuleEntries(updateEntries);
  const protocolInstruction = selected.protocol === 'json-patch'
    ? '本卡使用 JSON Patch：只输出一个 <UpdateVariable><JSONPatch>[{"op":"replace","path":"/路径","value":新值}]</JSONPatch></UpdateVariable> 块。'
    : selected.protocol === 'script'
      ? '本卡使用脚本式协议：只输出一个 <UpdateVariable> 块，并使用 _.set、_.add、_.assign 或 _.remove。'
      : selected.protocol === 'hybrid'
        ? '本卡兼容两种协议，但本项目优先解析 JSON Patch；本轮只选择一种格式，不要混用。'
        : '没有识别到卡内专用协议；优先使用 JSON Patch 格式。';
  const resolved = template
    .replace('{state}', JSON.stringify(compactPromptState(cleanForDisplay(runtime.snapshot.statData))))
    .replace('{schema}', JSON.stringify(runtime.snapshot.schema))
    .replace('{rules}', selected.rules || '无额外角色卡规则。')
    .replace('{protocol}', protocolInstruction);
  if (template.includes('{protocol}')) return resolved;
  return `${resolved}` + '\n\n'
    + '<mvu_engine_contract>\n'
    + `以下为引擎兼容补充，优先级高于上文任何旧示例或旧格式。${protocolInstruction}\n`
    + '本轮出现明确的移动/到达、场景转换、休息、进食、交易、受伤或治疗、物品得失、任务或关系变化时，必须维护相应的已有状态，不能只写剧情正文。\n'
    + '不要输出分析、观察、计划或思考标题；只输出角色扮演正文和末尾机器更新块。\n'
    + '无变化才不输出更新块；有变化时只在正文末尾输出一次完整、闭合的 <UpdateVariable>。\n'
    + '</mvu_engine_contract>';
}

/** Builds the deterministic JSON-only maintenance prompt used after a non-compliant DeepSeek reply. */
export function buildMvuFallbackPrompt(
  template: string,
  runtime: MvuRuntimeState,
  updateEntries: WorldBookEntry[],
  dialogue: string
): string {
  const selected = selectMvuRuleEntries(updateEntries);
  const protocolInstruction = selected.protocol === 'script'
    ? 'Use JSON Patch-compatible operations: replace, add, or remove. Do not output scripts.'
    : 'Use JSON Patch operations: replace, add, or remove. Paths use /nested/field notation.';
  return template
    .replace('{state}', JSON.stringify(compactPromptState(cleanForDisplay(runtime.snapshot.statData))))
    .replace('{schema}', JSON.stringify(runtime.snapshot.schema))
    .replace('{rules}', selected.rules || 'No additional character-card update rules.')
    .replace('{protocol}', protocolInstruction)
    .replace('{dialogue}', dialogue.trim());
}

export function getDisplayMvuState(runtime: MvuRuntimeState): Record<string, unknown> {
  return cleanForDisplay(runtime.snapshot.statData) as Record<string, unknown>;
}

export function createMvuSnapshot(statData: Record<string, unknown>, initializedWorldBookIds: string[]): MvuSnapshot {
  const next = clone(statData);
  return { statData: next, schema: buildSchema(next), initializedWorldBookIds: [...initializedWorldBookIds] };
}
