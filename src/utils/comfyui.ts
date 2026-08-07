import type { ComfyUiMapping } from '../types';

type JsonRecord = Record<string, unknown>;

type ComfyMappingInput = {
  version?: unknown;
  mappings?: unknown;
  static?: unknown;
  output_node_id?: unknown;
  outputNodeId?: unknown;
  poll_interval_ms?: unknown;
  pollIntervalMs?: unknown;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function paths(value: unknown, label: string, required = false): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`映射缺少 ${label}。`);
    return undefined;
  }
  const list = (Array.isArray(value) ? value : [value]).map((item) => String(item).trim()).filter(Boolean);
  if (required && list.length === 0) throw new Error(`映射缺少 ${label}。`);
  for (const path of list) validateComfyPath(path);
  return list.length ? [...new Set(list)] : undefined;
}

export function validateComfyPath(path: string): void {
  if (!/^\d+\.inputs(?:\.[A-Za-z0-9_-]+)+$/.test(path)) {
    throw new Error(`映射路径无效：${path}。路径必须形如“节点ID.inputs.字段名”。`);
  }
}

export function validateComfyWorkflow(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || Object.keys(value).length === 0) throw new Error('工作流必须是 ComfyUI 导出的 API JSON 对象。');
  if (Array.isArray(value.nodes)) throw new Error('导入的是 ComfyUI 前端画布 JSON。请在 ComfyUI 中使用“Save (API Format)”导出。');
  const nodes = Object.values(value).filter((node) => isRecord(node) && isRecord(node.inputs) && typeof node.class_type === 'string');
  if (nodes.length === 0) throw new Error('未识别到 API 工作流节点。请导入带有 class_type 与 inputs 的 ComfyUI API JSON。');
  return value;
}

export function normalizeComfyMapping(value: unknown, workflow?: Record<string, unknown>): ComfyUiMapping {
  if (!isRecord(value)) throw new Error('映射文件必须是 JSON 对象。');
  const input = value as ComfyMappingInput;
  const rawMappings = isRecord(input.mappings) ? input.mappings : {};
  const positive = paths(rawMappings.positive_prompt ?? rawMappings.prompt, '正向提示词', true)!;
  const negative = paths(rawMappings.negative_prompt, '负面提示词');
  const seed = paths(rawMappings.seed, '随机种子');
  const width = paths(rawMappings.width, '宽度');
  const height = paths(rawMappings.height, '高度');
  const rawStatic = isRecord(input.static) ? input.static : {};
  const staticValues: Record<string, string | number | boolean> = {};
  for (const [path, item] of Object.entries(rawStatic)) {
    validateComfyPath(path);
    if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') throw new Error(`静态映射 ${path} 只能使用字符串、数字或布尔值。`);
    staticValues[path] = item;
  }
  const outputNodeId = String(input.output_node_id ?? input.outputNodeId ?? '').trim();
  if (!/^\d+$/.test(outputNodeId)) throw new Error('映射必须指定最终输出节点 output_node_id。');
  const interval = Number(input.poll_interval_ms ?? input.pollIntervalMs ?? 1500);
  const pollIntervalMs = Number.isFinite(interval) ? Math.max(500, Math.min(10_000, Math.round(interval))) : 1500;
  const mapping: ComfyUiMapping = {
    version: 1,
    mappings: {
      positive_prompt: positive,
      ...(negative ? { negative_prompt: negative } : {}),
      ...(seed ? { seed } : {}),
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
    },
    ...(Object.keys(staticValues).length ? { static: staticValues } : {}),
    outputNodeId,
    pollIntervalMs,
  };
  if (workflow) validateComfyMappingTargets(workflow, mapping);
  return mapping;
}

function valueAtPath(workflow: Record<string, unknown>, path: string): unknown {
  const [nodeId, , ...inputPath] = path.split('.');
  let current: unknown = workflow[nodeId];
  for (const segment of ['inputs', ...inputPath]) {
    if (!isRecord(current) || !(segment in current)) throw new Error(`映射路径不存在：${path}。`);
    current = current[segment];
  }
  return current;
}

export function validateComfyMappingTargets(workflow: Record<string, unknown>, mapping: ComfyUiMapping): void {
  validateComfyWorkflow(workflow);
  const allPaths = [
    ...mapping.mappings.positive_prompt,
    ...(mapping.mappings.negative_prompt || []),
    ...(mapping.mappings.seed || []),
    ...(mapping.mappings.width || []),
    ...(mapping.mappings.height || []),
    ...Object.keys(mapping.static || {}),
  ];
  for (const path of allPaths) {
    const target = valueAtPath(workflow, path);
    if (Array.isArray(target) || isRecord(target)) throw new Error(`映射路径 ${path} 指向节点连线或对象，不能直接写入。`);
  }
  const output = workflow[mapping.outputNodeId];
  if (!isRecord(output)) throw new Error(`最终输出节点 ${mapping.outputNodeId} 不存在。`);
  if (!['SaveImage', 'PreviewImage'].includes(String(output.class_type || ''))) {
    throw new Error(`节点 ${mapping.outputNodeId} 不是 SaveImage 或 PreviewImage，请指定最终图像输出节点。`);
  }
}

function valueForTarget(target: unknown, value: string | number | boolean): string | number | boolean {
  if (typeof target === 'number') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error('数值节点不能写入非数值内容。');
    return numeric;
  }
  if (typeof target === 'boolean') return value === true || value === 'true' || value === 1;
  if (typeof target === 'string' || target === undefined || target === null) return String(value);
  throw new Error('映射目标不是可写的基础输入值。');
}

function setPath(workflow: Record<string, unknown>, path: string, value: string | number | boolean): void {
  const [nodeId, , ...inputPath] = path.split('.');
  const node = workflow[nodeId];
  if (!isRecord(node) || !isRecord(node.inputs)) throw new Error(`映射路径不存在：${path}。`);
  let current: JsonRecord = node.inputs;
  for (let index = 0; index < inputPath.length - 1; index += 1) {
    const segment = inputPath[index];
    if (!isRecord(current[segment])) throw new Error(`映射路径不存在：${path}。`);
    current = current[segment] as JsonRecord;
  }
  const leaf = inputPath[inputPath.length - 1];
  if (!(leaf in current) || Array.isArray(current[leaf]) || isRecord(current[leaf])) throw new Error(`映射路径 ${path} 不是可写的普通输入。`);
  current[leaf] = valueForTarget(current[leaf], value);
}

export function applyComfyMapping(workflow: Record<string, unknown>, mapping: ComfyUiMapping, values: {
  positive: string;
  negative: string;
  seed: number;
  width: number;
  height: number;
}): Record<string, unknown> {
  validateComfyMappingTargets(workflow, mapping);
  const copy = structuredClone(workflow);
  mapping.mappings.positive_prompt.forEach((path) => setPath(copy, path, values.positive));
  (mapping.mappings.negative_prompt || []).forEach((path) => setPath(copy, path, values.negative));
  (mapping.mappings.seed || []).forEach((path) => setPath(copy, path, values.seed));
  (mapping.mappings.width || []).forEach((path) => setPath(copy, path, values.width));
  (mapping.mappings.height || []).forEach((path) => setPath(copy, path, values.height));
  Object.entries(mapping.static || {}).forEach(([path, value]) => setPath(copy, path, value));
  return copy;
}

function shortValue(value: unknown): string {
  if (Array.isArray(value)) return `[连线: ${value.map((item) => String(item)).join(', ')}]`;
  if (typeof value === 'string') return value.length > 100 ? `${value.slice(0, 100)}...` : value;
  return String(value);
}

export interface ComfyWritableInput {
  path: string;
  label: string;
}

export interface ComfyOutputNode {
  id: string;
  label: string;
}

export function listComfyWritableInputs(workflow: Record<string, unknown>): ComfyWritableInput[] {
  const entries: ComfyWritableInput[] = [];
  for (const [id, rawNode] of Object.entries(validateComfyWorkflow(workflow))) {
    if (!isRecord(rawNode) || !isRecord(rawNode.inputs)) continue;
    const nodeLabel = `${id} · ${String(rawNode.class_type || '未知节点')}`;
    for (const [key, value] of Object.entries(rawNode.inputs)) {
      if (Array.isArray(value) || isRecord(value)) continue;
      const fullLabel = [id, key, shortValue(value)].join(' · ');
      entries.push({ path: `${id}.inputs.${key}`, label: fullLabel.length > 96 ? `${fullLabel.slice(0, 93)}...` : fullLabel });
    }
  }
  return entries;
}

export function listComfyOutputNodes(workflow: Record<string, unknown>): ComfyOutputNode[] {
  return Object.entries(validateComfyWorkflow(workflow)).flatMap(([id, rawNode]) => {
    if (!isRecord(rawNode) || !['SaveImage', 'PreviewImage'].includes(String(rawNode.class_type || ''))) return [];
    return [{ id, label: `${id} · ${String(rawNode.class_type)}` }];
  });
}
export function summarizeComfyWorkflow(workflow: Record<string, unknown>): string {
  const lines = Object.entries(validateComfyWorkflow(workflow)).map(([id, rawNode]) => {
    if (!isRecord(rawNode)) return null;
    const inputs = isRecord(rawNode.inputs)
      ? Object.entries(rawNode.inputs).map(([key, value]) => `${id}.inputs.${key} = ${shortValue(value)}`).join('；')
      : '';
    return `节点 ${id} | ${String(rawNode.class_type || '未知类型')} | ${inputs}`;
  }).filter((line): line is string => Boolean(line));
  return lines.join('\n').slice(0, 24_000);
}