/**
 * 带队列节流 + 429 自动重试的 API 请求函数。
 *
 * 解决问题：
 * 1. 智谱 BigModel (GLM-4-Flash / GLM-4.7-Flash) 等 API 对请求频率较敏感。
 * 2. 多个功能入口可能在同一时间调用 API；仅记录 lastRequestTime 不足以防止并发竞态。
 * 3. 某些 429 响应没有 Retry-After 头，需要本地指数退避兜底。
 */

import { chatCompletionsUrl } from './chatCompletionsUrl';

/** 低速率模式下，同一 baseUrl 两次请求开始之间的最小间隔。 */
const LOW_RATE_INTERVAL_MS = 2500;

/** 429 重试最大次数（指数退避：3s -> 6s -> 12s） */
const MAX_RETRIES = 3;

/** 429 默认初始等待时间（毫秒），当响应无 Retry-After 头时使用。 */
const DEFAULT_RETRY_AFTER_MS = 3000;

/** 每个 baseUrl 的上次请求开始时间。 */
const lastRequestTime = new Map<string, number>();

/** 每个 baseUrl 的请求队列尾巴，用于真正串行化同源请求。 */
const requestQueues = new Map<string, Promise<void>>();

/** 低速率模式开关（由 useApp 通过 setLowRateMode 注入）。 */
let lowRateModeEnabled = false;

/** 外部设置低速率模式开关。 */
export function setLowRateMode(enabled: boolean): void {
  lowRateModeEnabled = enabled;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 解析 Retry-After 头；无头或解析失败返回 null，让调用方使用指数退避。 */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = parseInt(header, 10);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
  const date = new Date(header).getTime();
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function retryDelayMs(resp: Response, attempt: number): number {
  const retryAfter = parseRetryAfter(resp.headers.get('retry-after'));
  if (retryAfter !== null) return retryAfter;
  return DEFAULT_RETRY_AFTER_MS * Math.pow(2, attempt);
}

async function lowRateGate(baseUrl: string): Promise<void> {
  if (!lowRateModeEnabled) return;

  const now = Date.now();
  const last = lastRequestTime.get(baseUrl) || 0;
  const elapsed = now - last;
  if (elapsed < LOW_RATE_INTERVAL_MS) {
    await sleep(LOW_RATE_INTERVAL_MS - elapsed);
  }
  lastRequestTime.set(baseUrl, Date.now());
}

async function runWithOptionalQueue<T>(baseUrl: string, task: () => Promise<T>): Promise<T> {
  if (!lowRateModeEnabled) return task();

  const previous = requestQueues.get(baseUrl) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  requestQueues.set(baseUrl, previous.then(() => current, () => current));

  try {
    await previous.catch(() => undefined);
    await lowRateGate(baseUrl);
    return await task();
  } finally {
    release();
    if (requestQueues.get(baseUrl) === current) {
      requestQueues.delete(baseUrl);
    }
  }
}

/**
 * 带队列节流 + 429 重试的 API fetch。
 *
 * - 低速率模式开启时：同 baseUrl 请求排队串行，且请求开始间隔 >= 2.5s
 * - 低速率模式关闭时：不排队、不节流，仅保留 429 自动重试
 */
export async function apiFetch(
  baseUrl: string,
  init: RequestInit,
): Promise<Response> {
  const url = chatCompletionsUrl(baseUrl);

  return runWithOptionalQueue(baseUrl, async () => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const resp = await fetch(url, init);

      if (resp.status !== 429) return resp;

      if (attempt < MAX_RETRIES) {
        const waitMs = retryDelayMs(resp, attempt);
        console.warn(
          `[apiFetch] 429 速率限制，${Math.round(waitMs / 1000)}s 后重试 (baseUrl=${baseUrl}, attempt=${attempt + 1}/${MAX_RETRIES})`,
        );
        try { await resp.text(); } catch { /* ignore */ }
        await sleep(waitMs);
        continue;
      }

      console.warn(`[apiFetch] 429 重试已用尽（${MAX_RETRIES}次），返回错误响应 (baseUrl=${baseUrl})`);
      return resp;
    }

    return fetch(url, init);
  });
}
