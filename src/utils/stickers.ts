import type { StickerItem, StickerPack, StickerUsage } from '../types';
import { DEFAULT_TPL_STICKER_PROMPT, MAX_ANIMATED_STICKER_BYTES } from './constants';
import { generateId } from './id';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const STICKER_OPEN = '<EJP_STICKER>';
const STICKER_CLOSE = '</EJP_STICKER>';
const COMPLETE_STICKER_RE = /<EJP_STICKER(?:\s[^>]*)?>\s*([\s\S]*?)\s*<\/EJP_STICKER>/gi;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取这张图片'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片压缩失败')), type, quality);
  });
}

export async function prepareStickerFile(file: File, label: string): Promise<StickerItem> {
  const cleanLabel = label.trim();
  if (!cleanLabel) throw new Error('请先填写清楚的表情标签');
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('仅支持 PNG、JPEG、WebP 和 GIF 图片');

  if (file.type === 'image/gif') {
    if (file.size > MAX_ANIMATED_STICKER_BYTES) throw new Error('动图必须小于或等于 1.8 MiB');
    return { id: generateId(), label: cleanLabel, mimeType: file.type, size: file.size, blob: file };
  }

  if (file.size > 12 * 1024 * 1024) throw new Error('原始静态图片不能超过 12 MiB');
  const image = await loadImage(file);
  const maxSide = 512;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建图片压缩画布');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, 'image/webp', 0.82);
  if (blob.size > MAX_ANIMATED_STICKER_BYTES) throw new Error('压缩后的图片仍超过 1.8 MiB，请换一张尺寸更小的图片');
  return { id: generateId(), label: cleanLabel, mimeType: blob.type, size: blob.size, blob };
}

export function buildStickerPrompt(pack: StickerPack | null | undefined, maxCount: number, template?: string): string {
  if (!pack || pack.stickers.length === 0 || maxCount < 1) return '';
  const control = (template?.trim() || DEFAULT_TPL_STICKER_PROMPT).split('{maxCount}').join(String(maxCount));
  const catalog = pack.stickers.map((item) => ({ id: item.id, label: item.label }));
  return `${control}\n\n[只读可用表情 JSON]\n${JSON.stringify({ pack: pack.name, stickers: catalog })}`;
}

export interface ParsedStickerResponse {
  content: string;
  usages: StickerUsage[];
}

export type StickerContentSegment =
  | { type: 'text'; content: string }
  | { type: 'sticker'; usage: StickerUsage };

function normalizeStickerLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function collectStickerReferences(value: unknown, output: unknown[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectStickerReferences(item, output));
    return;
  }
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const direct = record.id ?? record.stickerId ?? record.sticker_id ?? record.label;
  if (direct !== undefined) output.push(direct);

  for (const key of ['stickers', 'usages', 'calls', 'items']) {
    if (record[key] !== undefined) collectStickerReferences(record[key], output);
  }
}

function parseStickerPayload(payload: string): unknown[] {
  const cleaned = payload.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const references: unknown[] = [];

  try {
    collectStickerReferences(JSON.parse(cleaned), references);
    return references;
  } catch {
    // Some models put multiple JSON objects in one protocol block.
  }

  for (const match of cleaned.matchAll(/\{[^{}]*\}/g)) {
    try {
      collectStickerReferences(JSON.parse(match[0]), references);
    } catch {
      // Ignore only this malformed object and continue checking the block.
    }
  }
  return references;
}

/** Remove the model protocol and keep only validated, position-aware usages. */
export function parseStickerResponse(
  text: string,
  pack: StickerPack | null | undefined,
  maxCount: number,
  streaming = false
): ParsedStickerResponse {
  const allowed = new Set(pack?.stickers.map((item) => item.id) || []);
  const labels = new Map<string, string | null>();
  for (const item of pack?.stickers || []) {
    const label = normalizeStickerLabel(item.label);
    labels.set(label, labels.has(label) ? null : item.id);
  }
  const usages: StickerUsage[] = [];
  const safeMaxCount = Number.isFinite(maxCount) ? Math.max(0, Math.floor(maxCount)) : 0;
  let content = '';
  let cursor = 0;
  COMPLETE_STICKER_RE.lastIndex = 0;

  for (let match = COMPLETE_STICKER_RE.exec(text); match; match = COMPLETE_STICKER_RE.exec(text)) {
    content += text.slice(cursor, match.index);
    cursor = match.index + match[0].length;
    for (const reference of parseStickerPayload(match[1])) {
      if (!pack || usages.length >= safeMaxCount) break;
      if (typeof reference !== 'string') continue;
      const rawReference = reference.trim();
      const stickerId = allowed.has(rawReference)
        ? rawReference
        : labels.get(normalizeStickerLabel(rawReference));
      if (stickerId) usages.push({ packId: pack.id, stickerId, offset: content.length });
    }
  }
  content += text.slice(cursor);

  if (streaming) {
    const lastOpen = content.lastIndexOf('<EJP_STICKER');
    if (lastOpen >= 0 && content.indexOf(STICKER_CLOSE, lastOpen) < 0) content = content.slice(0, lastOpen);
    const lastAngle = content.lastIndexOf('<');
    if (lastAngle >= 0 && STICKER_OPEN.startsWith(content.slice(lastAngle))) content = content.slice(0, lastAngle);
  }

  return { content, usages };
}

/** Keep stickers independent from Markdown parsing so later calls cannot become code or link text. */
export function splitStickerContent(content: string, usages: StickerUsage[]): StickerContentSegment[] {
  const ordered = usages
    .map((usage, index) => ({ usage, index }))
    .sort((a, b) => a.usage.offset - b.usage.offset || a.index - b.index);
  const segments: StickerContentSegment[] = [];
  let cursor = 0;
  for (const { usage } of ordered) {
    const offset = Number.isFinite(usage.offset)
      ? Math.max(cursor, Math.min(content.length, Math.floor(usage.offset)))
      : cursor;
    if (offset > cursor) segments.push({ type: 'text', content: content.slice(cursor, offset) });
    segments.push({ type: 'sticker', usage });
    cursor = offset;
  }
  if (cursor < content.length || segments.length === 0) {
    segments.push({ type: 'text', content: content.slice(cursor) });
  }
  return segments;
}
