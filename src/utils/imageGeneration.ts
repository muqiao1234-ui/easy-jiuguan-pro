import type { Character, ImageChannel, MessageNode, ModelConfig, WorldBookEntry } from '../types';
import * as Stores from '../db/stores';
import { apiFetch } from './apiFetch';
import { applyComfyMapping, normalizeComfyMapping, validateComfyWorkflow } from './comfyui';
import {
  DEFAULT_IMAGE_REQUEST_TIMEOUT_SECONDS,
  DEFAULT_IMAGE_WORLD_BOOK_LIMIT,
  MAX_IMAGE_REQUEST_TIMEOUT_SECONDS,
  MIN_IMAGE_REQUEST_TIMEOUT_SECONDS,
  NOVELAI_IMAGE_API_URL,
  NANO_BANANA_IMAGE_API_URL,
} from './constants';

export interface ImagePromptResult {
  positive: string;
  negative: string;
  matchedEntries: WorldBookEntry[];
}

function imageUrl(baseUrl: string): string {
  let url = baseUrl.replace(/\/+$/, '');
  if (url.endsWith('/images/generations')) return url;
  url = url.replace(/\/chat\/completions$/, '').replace(/\/v1$/, '');
  return `${url}/v1/images/generations`;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  const clean = value.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(clean.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function entryMatches(entry: WorldBookEntry, haystack: string): boolean {
  return entry.alwaysActive || entry.keys.some((key) => key.trim() && haystack.includes(key.toLowerCase()));
}

export async function queryImageWorldBookEntries(
  characters: Array<Character | null>,
  scanText: string,
  limit = DEFAULT_IMAGE_WORLD_BOOK_LIMIT,
): Promise<WorldBookEntry[]> {
  const lower = scanText.toLowerCase();
  const ids = [...new Set(characters.flatMap((character) =>
    character ? [character.worldBookId, character.cacheWorldBookId] : []
  ).filter((id): id is string => Boolean(id)))];
  const books = await Promise.all(ids.map((id) => Stores.getWorldBookById(id)));
  const seen = new Set<string>();
  const matches: WorldBookEntry[] = [];
  for (const book of books) {
    for (const entry of book?.entries || []) {
      if (!seen.has(entry.id) && entryMatches(entry, lower)) {
        seen.add(entry.id);
        matches.push(entry);
      }
    }
  }
  return matches.sort((a, b) => b.priority - a.priority).slice(0, Math.max(1, limit));
}

export async function extractImagePrompt(params: {
  model: ModelConfig;
  template: string;
  userHint: string;
  aspectRatio: string;
  style: string;
  characterText: string;
  contextText: string;
  worldBookEntries: WorldBookEntry[];
}): Promise<ImagePromptResult> {
  const worldbook = params.worldBookEntries.map((entry) =>
    `[${entry.keys[0] || '世界设定'}] ${entry.value}`
  ).join('\n') || '无匹配世界书条目';
  const prompt = params.template
    .split('{userHint}').join(params.userHint)
    .split('{aspectRatio}').join(params.aspectRatio)
    .split('{style}').join(params.style)
    .split('{character}').join(params.characterText || '无')
    .split('{context}').join(params.contextText || '无可用对话')
    .split('{worldbook}').join(worldbook);

  const response = await apiFetch(params.model.baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${params.model.apiKey}` },
    body: JSON.stringify({
      model: params.model.defaultModel,
      messages: [{ role: 'system', content: prompt }],
      stream: false,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`提示词提炼失败 (${response.status}): ${(await response.text()).slice(0, 240)}`);
  const data = await response.json();
  const content = String(data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '');
  const parsed = parseJsonObject(content);
  const positive = String(parsed?.positive_prompt_zh || parsed?.positive_prompt || '').trim();
  const negative = String(parsed?.negative_prompt_zh || parsed?.negative_prompt || '').trim();
  if (!positive) throw new Error('提示词提炼模型未返回有效 JSON，请更换模型或修改生图高级提示词。');
  return { positive, negative, matchedEntries: params.worldBookEntries };
}

function decodeBase64Image(value: string, mimeType = 'image/png'): Blob {
  const binary = atob(value.replace(/^data:[^;]+;base64,/, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

function imageMimeType(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

/** NovelAI returns a ZIP archive. Extract only the first rendered image, never its metadata. */
async function extractImageFromZip(archive: Blob): Promise<{ blob: Blob; mimeType: string }> {
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const compression = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const dataStart = offset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) break;
    const filename = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const mimeType = imageMimeType(filename);
    if (mimeType) {
      const payload = bytes.slice(dataStart, dataEnd);
      if (compression === 0) return { blob: new Blob([payload], { type: mimeType }), mimeType };
      if (compression === 8 && typeof DecompressionStream !== 'undefined') {
        const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return { blob: await new Response(stream).blob(), mimeType };
      }
      throw new ImageGenerationRequestError(`NovelAI 返回的图片压缩格式（${compression}）无法在当前浏览器解压。`);
    }
    offset = dataEnd;
  }
  throw new ImageGenerationRequestError('NovelAI 未返回可用图片文件。');
}

function dimensionsFromSize(size: string): { width: number; height: number } {
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(size);
  if (!match) return { width: 1024, height: 1024 };
  return { width: Number(match[1]), height: Number(match[2]) };
}
export type ImageRequestPhase = 'generating' | 'downloading';

export class ImageGenerationRequestError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly timedOut: boolean;

  constructor(message: string, options: { status?: number; retryable?: boolean; retryAfterMs?: number; timedOut?: boolean } = {}) {
    super(message);
    this.name = 'ImageGenerationRequestError';
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.timedOut = options.timedOut ?? false;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(120_000, Math.round(seconds * 1000));
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, Math.min(120_000, timestamp - Date.now())) : undefined;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
  timeoutMessage: string,
  retryOnTimeout = true,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) forwardAbort();
  else parentSignal?.addEventListener('abort', forwardAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new ImageGenerationRequestError(timeoutMessage, { retryable: retryOnTimeout, timedOut: true });
    }
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', forwardAbort);
  }
}

/** Returns true only for failures where another identical request is meaningful. */
export function isRetryableImageError(error: unknown): boolean {
  if (error instanceof ImageGenerationRequestError) return error.retryable;
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  // Browsers report CORS, interrupted sockets and DNS failures as TypeError.
  return error instanceof TypeError;
}


function nanoBananaEndpoint(baseUrl: string, model: string): string {
  const url = baseUrl.trim().replace(/\/+$/, '');
  if (url.endsWith(':generateContent')) return url;
  const modelPath = `/models/${encodeURIComponent(model)}:generateContent`;
  if (url.endsWith('/v1') || url.endsWith('/v1beta')) return `${url}${modelPath}`;
  return `${url}/v1${modelPath}`;
}

function nanoBananaAspectRatio(size: string): '1:1' | '3:4' | '16:9' {
  const { width, height } = dimensionsFromSize(size);
  if (width === 768 && height === 1024) return '3:4';
  if (width === 1536 && height === 864) return '16:9';
  return '1:1';
}

async function requestNanoBananaImage(params: {
  channel: ImageChannel;
  positive: string;
  negative: string;
  size: string;
  signal?: AbortSignal;
  onPhase?: (phase: ImageRequestPhase) => void;
}): Promise<{ blob: Blob; mimeType: string }> {
  const secret = await Stores.getSecretById(params.channel.secretId);
  if (!secret?.value) throw new ImageGenerationRequestError('Nano Banana 渠道未绑定本机 Google AI API Key 或中转密钥。');
  if (!params.channel.baseUrl.trim()) throw new ImageGenerationRequestError('Nano Banana 渠道缺少 Gemini API 地址。');
  if (!params.channel.imageModel.trim()) throw new ImageGenerationRequestError('Nano Banana 渠道缺少模型名。');
  const configuredTimeout = params.channel.requestTimeoutSeconds ?? DEFAULT_IMAGE_REQUEST_TIMEOUT_SECONDS;
  const timeoutSeconds = Math.max(MIN_IMAGE_REQUEST_TIMEOUT_SECONDS, Math.min(MAX_IMAGE_REQUEST_TIMEOUT_SECONDS, Math.round(configuredTimeout)));
  const prompt = params.negative.trim()
    ? `${params.positive.trim()}\n\nNegative prompt / avoid: ${params.negative.trim()}`
    : params.positive.trim();

  params.onPhase?.('generating');
  const response = await fetchWithTimeout(nanoBananaEndpoint(params.channel.baseUrl.trim() || NANO_BANANA_IMAGE_API_URL, params.channel.imageModel.trim()), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': secret.value },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        responseFormat: { image: { aspectRatio: nanoBananaAspectRatio(params.size) } },
      },
    }),
  }, params.signal, timeoutSeconds * 1000, `Nano Banana 生图等待超过 ${timeoutSeconds} 秒，本机已停止等待；服务端可能仍在继续生成，请检查渠道记录后再重试。`, false);
  if (!response.ok) {
    throw new ImageGenerationRequestError(
      `Nano Banana 生图失败 (${response.status}): ${(await response.text()).slice(0, 300)}`,
      { status: response.status, retryable: isRetryableStatus(response.status), retryAfterMs: parseRetryAfterMs(response.headers.get('Retry-After')) },
    );
  }
  const data = await response.json();
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inline = part?.inlineData || part?.inline_data;
      if (typeof inline?.data === 'string' && inline.data) {
        const mimeType = typeof inline.mimeType === 'string' ? inline.mimeType : typeof inline.mime_type === 'string' ? inline.mime_type : 'image/png';
        const blob = decodeBase64Image(inline.data, mimeType);
        return { blob, mimeType: blob.type || mimeType };
      }
    }
  }
  throw new ImageGenerationRequestError('Nano Banana 返回成功，但没有找到 inlineData 图片。请检查模型名、响应模态和渠道兼容性。');
}
async function requestNovelAiImage(params: {
  channel: ImageChannel;
  positive: string;
  negative: string;
  size: string;
  signal?: AbortSignal;
  onPhase?: (phase: ImageRequestPhase) => void;
}): Promise<{ blob: Blob; mimeType: string }> {
  const secret = await Stores.getSecretById(params.channel.secretId);
  if (!secret?.value) throw new ImageGenerationRequestError('该 NovelAI 渠道未绑定本机 Access Token，请在生图渠道设置中重新选择或输入密钥。');
  const configuredTimeout = params.channel.requestTimeoutSeconds ?? DEFAULT_IMAGE_REQUEST_TIMEOUT_SECONDS;
  const timeoutSeconds = Math.max(MIN_IMAGE_REQUEST_TIMEOUT_SECONDS, Math.min(MAX_IMAGE_REQUEST_TIMEOUT_SECONDS, Math.round(configuredTimeout)));
  const { width, height } = dimensionsFromSize(params.size);

  params.onPhase?.('generating');
  const response = await fetchWithTimeout(NOVELAI_IMAGE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret.value}` },
    body: JSON.stringify({
      input: params.positive,
      model: params.channel.imageModel,
      action: 'generate',
      parameters: {
        width,
        height,
        scale: 5,
        sampler: 'k_euler_ancestral',
        steps: 28,
        n_samples: 1,
        ucPreset: 0,
        qualityToggle: true,
        sm: false,
        sm_dyn: false,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        add_original_image: false,
        cfg_rescale: 0,
        noise_schedule: 'native',
        legacy_v3_extend: false,
        skip_cfg_above_sigma: null,
        seed: Math.floor(Math.random() * 0xFFFFFFFF),
        negative_prompt: params.negative,
      },
    }),
  }, params.signal, timeoutSeconds * 1000, `NovelAI 生图等待超过 ${timeoutSeconds} 秒，本机已停止等待。服务端可能仍在继续生成，请先检查 NovelAI 历史记录后再手动重新生成。`, false);
  if (!response.ok) {
    throw new ImageGenerationRequestError(
      `NovelAI 生图失败 (${response.status}): ${(await response.text()).slice(0, 300)}`,
      { status: response.status, retryable: isRetryableStatus(response.status), retryAfterMs: parseRetryAfterMs(response.headers.get('Retry-After')) },
    );
  }
  params.onPhase?.('downloading');
  const blob = await response.blob();
  if (blob.type.startsWith('image/')) return { blob, mimeType: blob.type };
  return extractImageFromZip(blob);
}

function comfyEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

function outputImage(history: unknown, promptId: string, outputNodeId: string): { filename: string; subfolder?: string; type?: string } | null {
  if (!history || typeof history !== 'object') return null;
  const record = (history as Record<string, unknown>)[promptId] ?? history;
  if (!record || typeof record !== 'object') return null;
  const outputs = (record as Record<string, unknown>).outputs;
  if (!outputs || typeof outputs !== 'object') return null;
  const selected = (outputs as Record<string, unknown>)[outputNodeId];
  if (!selected || typeof selected !== 'object') return null;
  const images = (selected as Record<string, unknown>).images;
  if (!Array.isArray(images) || images.length === 0) return null;
  const image = images[0];
  if (!image || typeof image !== 'object' || typeof (image as Record<string, unknown>).filename !== 'string') return null;
  const data = image as Record<string, unknown>;
  return { filename: String(data.filename), ...(typeof data.subfolder === 'string' ? { subfolder: data.subfolder } : {}), ...(typeof data.type === 'string' ? { type: data.type } : {}) };
}

function waitForComfyPoll(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('任务已取消', 'AbortError'));
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function requestComfyUiImage(params: {
  channel: ImageChannel;
  positive: string;
  negative: string;
  size: string;
  signal?: AbortSignal;
  onPhase?: (phase: ImageRequestPhase) => void;
}): Promise<{ blob: Blob; mimeType: string }> {
  if (!params.channel.baseUrl.trim()) throw new ImageGenerationRequestError('ComfyUI 渠道缺少服务地址。');
  if (!params.channel.comfyWorkflow || !params.channel.comfyMapping) throw new ImageGenerationRequestError('ComfyUI 渠道尚未导入 API 工作流或映射文件。');
  const workflow = validateComfyWorkflow(params.channel.comfyWorkflow);
  const mapping = normalizeComfyMapping(params.channel.comfyMapping, workflow);
  const configuredTimeout = params.channel.requestTimeoutSeconds ?? DEFAULT_IMAGE_REQUEST_TIMEOUT_SECONDS;
  const timeoutSeconds = Math.max(MIN_IMAGE_REQUEST_TIMEOUT_SECONDS, Math.min(MAX_IMAGE_REQUEST_TIMEOUT_SECONDS, Math.round(configuredTimeout)));
  const { width, height } = dimensionsFromSize(params.size);
  const patchedWorkflow = applyComfyMapping(workflow, mapping, {
    positive: params.positive,
    negative: params.negative,
    seed: Math.floor(Math.random() * 0xFFFFFFFF),
    width,
    height,
  });

  const secretValue = params.channel.secretId ? (await Stores.getSecretById(params.channel.secretId))?.value : '';
  if (params.channel.secretId && !secretValue) throw new ImageGenerationRequestError('ComfyUI 渠道绑定的本机密钥不存在，请重新选择或输入密钥。');

  params.onPhase?.('generating');
  let queued: Response;
  try {
    queued = await fetchWithTimeout(comfyEndpoint(params.channel.baseUrl, '/prompt'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(params.channel.secretId ? (() => ({ Authorization: `Bearer ${secretValue}` }))() : {}),
      },
      body: JSON.stringify({
        prompt: patchedWorkflow,
        client_id: `easyjiuguanpro-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...(params.channel.imageModel.trim() ? { model: params.channel.imageModel.trim() } : {}),
      }),
    }, params.signal, 60_000, 'ComfyUI 工作流提交超时，无法确认服务端是否已收到请求；请先检查 ComfyUI 队列后再手动重试。', false);
  } catch (error) {
    if (error instanceof ImageGenerationRequestError || error instanceof DOMException) throw error;
    throw new ImageGenerationRequestError('ComfyUI 工作流提交失败，无法确认服务端是否已收到请求；请先检查 ComfyUI 队列后再手动重试。');
  }
  if (!queued.ok) throw new ImageGenerationRequestError(`ComfyUI 工作流提交失败 (${queued.status}): ${(await queued.text()).slice(0, 300)}`);
  const submitData = await queued.json();
  const promptId = typeof submitData?.prompt_id === 'string' ? submitData.prompt_id : '';
  if (!promptId) throw new ImageGenerationRequestError('ComfyUI 未返回 prompt_id，无法跟踪生成任务。');

  const deadline = Date.now() + timeoutSeconds * 1000;
  const pollIntervalMs = mapping.pollIntervalMs ?? 1500;
  while (Date.now() < deadline) {
    if (params.signal?.aborted) throw new DOMException('任务已取消', 'AbortError');
    const remaining = Math.max(1_000, deadline - Date.now());
    let historyResponse: Response;
    try {
      historyResponse = await fetchWithTimeout(comfyEndpoint(params.channel.baseUrl, `/history/${encodeURIComponent(promptId)}`), {}, params.signal, Math.min(30_000, remaining), 'ComfyUI 状态查询超时，请检查服务状态后再手动重试。', false);
    } catch (error) {
      if (error instanceof ImageGenerationRequestError || error instanceof DOMException) throw error;
      throw new ImageGenerationRequestError('ComfyUI 状态查询失败，请检查服务状态后再手动重试。');
    }
    if (!historyResponse.ok) throw new ImageGenerationRequestError(`ComfyUI 状态查询失败 (${historyResponse.status})。`);
    const image = outputImage(await historyResponse.json(), promptId, mapping.outputNodeId);
    if (image) {
      params.onPhase?.('downloading');
      const url = new URL(comfyEndpoint(params.channel.baseUrl, '/view'));
      url.searchParams.set('filename', image.filename);
      if (image.subfolder) url.searchParams.set('subfolder', image.subfolder);
      if (image.type) url.searchParams.set('type', image.type);
      const download = await fetchWithTimeout(url, {}, params.signal, 90_000, 'ComfyUI 图片下载超时，请稍后在 ComfyUI 历史记录中确认结果。', false);
      if (!download.ok) throw new ImageGenerationRequestError(`ComfyUI 图片下载失败 (${download.status})。`);
      const blob = await download.blob();
      if (!blob.type.startsWith('image/')) throw new ImageGenerationRequestError('ComfyUI 未返回可用图片数据。');
      return { blob, mimeType: blob.type };
    }
    await waitForComfyPoll(Math.min(pollIntervalMs, Math.max(250, deadline - Date.now())), params.signal);
  }
  throw new ImageGenerationRequestError(`ComfyUI 等待超过 ${timeoutSeconds} 秒，本机已停止轮询。工作流可能仍在队列或生成中，请在 ComfyUI 历史记录确认后再手动重试。`);
}
export async function requestOpenAiImage(params: {
  channel: ImageChannel;
  positive: string;
  negative: string;
  size: string;
  signal?: AbortSignal;
  onPhase?: (phase: ImageRequestPhase) => void;
}): Promise<{ blob: Blob; mimeType: string }> {
  if (params.channel.kind === 'novelai') return requestNovelAiImage(params);
  if (params.channel.kind === 'nano_banana') return requestNanoBananaImage(params);
  if (params.channel.kind === 'comfyui') return requestComfyUiImage(params);
  if (!params.channel.baseUrl) throw new ImageGenerationRequestError('该生图渠道是旧版配置，请在设置中补充独立 API 地址。');
  const secret = await Stores.getSecretById(params.channel.secretId);
  if (!secret?.value) throw new ImageGenerationRequestError('该生图渠道未绑定本机 API Key，请在生图渠道设置中重新选择或输入密钥。');

  const configuredTimeout = params.channel.requestTimeoutSeconds ?? DEFAULT_IMAGE_REQUEST_TIMEOUT_SECONDS;
  const timeoutSeconds = Math.max(MIN_IMAGE_REQUEST_TIMEOUT_SECONDS, Math.min(MAX_IMAGE_REQUEST_TIMEOUT_SECONDS, Math.round(configuredTimeout)));

  params.onPhase?.('generating');
  const response = await fetchWithTimeout(imageUrl(params.channel.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret.value}` },
    body: JSON.stringify({
      model: params.channel.imageModel,
      prompt: params.positive,
      extra_body: { negative_prompt: params.negative },
      size: params.size,
      n: 1,
      response_format: 'b64_json',
    }),
  }, params.signal, timeoutSeconds * 1000, `生图请求等待超过 ${timeoutSeconds} 秒，本机已停止等待。服务端可能仍在继续生成，请先检查渠道记录后再手动重新生成。`, false);
  if (!response.ok) {
    throw new ImageGenerationRequestError(
      `生图请求失败 (${response.status}): ${(await response.text()).slice(0, 300)}`,
      { status: response.status, retryable: isRetryableStatus(response.status), retryAfterMs: parseRetryAfterMs(response.headers.get('Retry-After')) },
    );
  }
  const data = await response.json();
  const item = data?.data?.[0];
  if (typeof item?.b64_json === 'string' && item.b64_json) {
    const blob = decodeBase64Image(item.b64_json);
    return { blob, mimeType: blob.type || 'image/png' };
  }
  if (typeof item?.url === 'string' && item.url) {
    params.onPhase?.('downloading');
    const download = await fetchWithTimeout(item.url, {}, params.signal, 90_000, '图片下载超时，请稍后重试。');
    if (!download.ok) {
      throw new ImageGenerationRequestError(
        `图片下载失败 (${download.status})。`,
        { status: download.status, retryable: isRetryableStatus(download.status), retryAfterMs: parseRetryAfterMs(download.headers.get('Retry-After')) },
      );
    }
    const blob = await download.blob();
    if (!blob.type.startsWith('image/')) throw new ImageGenerationRequestError('图片服务未返回可用图片数据。');
    return { blob, mimeType: blob.type };
  }
  throw new ImageGenerationRequestError('生图服务未返回 b64_json 或图片 URL。');
}
export function sizeForAspectRatio(aspectRatio: '1:1' | '3:4' | '16:9'): string {
  if (aspectRatio === '3:4') return '768x1024';
  if (aspectRatio === '16:9') return '1536x864';
  return '1024x1024';
}

export function selectImageHistory(nodes: MessageNode[], anchorId: string, rounds: number): MessageNode[] {
  const cutoff = nodes.findIndex((node) => node.id === anchorId);
  const upstream = (cutoff >= 0 ? nodes.slice(0, cutoff + 1) : nodes)
    .filter((node) => ['user', 'charA', 'charB'].includes(node.role));
  let userCount = 0;
  let start = 0;
  for (let index = upstream.length - 1; index >= 0; index -= 1) {
    if (upstream[index].role === 'user') userCount += 1;
    if (userCount >= rounds) { start = index; break; }
  }
  return upstream.slice(start);
}
