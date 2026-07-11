/**
 * 带节流 + 429 自动重试的 API 请求函数。
 *
 * 解决问题：
 * 1. 智谱 BigModel (GLM-4-Flash) 等限速严格的 API，即使串行触发也会因
 *    两次请求间隔过短（< 1 秒）而触发 429 "速率限制"。
 * 2. 主对话流式回复完成后，Galgame/scribe/蒸馏等后续触发紧跟着发出，
 *    实际请求间隔可能只有几百毫秒。
 *
 * 策略：
 * - 当「低速率模式」开启时，按 baseUrl 维度节流，同源请求间隔 ≥ MIN_INTERVAL_MS
 * - 收到 429 时，读取 Retry-After 头（或默认等待 2 秒），自动重试一次（无论开关）
 * - 低速率模式默认关闭（DeepSeek/OpenAI 等不限速 API 无需节流），
 *   用户在设置页手动开启
 */

import { chatCompletionsUrl } from './chatCompletionsUrl';

/** 同一 baseUrl 的最小请求间隔（毫秒）。1.5 秒适配智谱 1 QPS 限制 + 缓冲。 */
const MIN_INTERVAL_MS = 1500;

/** 429 重试最大次数（指数退避：3s → 6s → 12s） */
const MAX_RETRIES = 3;

/** 429 默认初始等待时间（毫秒），当响应无 Retry-After 头时使用 */
const DEFAULT_RETRY_AFTER_MS = 3000;

/** 每个 baseUrl 的上次请求时间戳 */
const lastRequestTime = new Map<string, number>();

/** 低速率模式开关（由 useApp 通过 setLowRateMode 注入） */
let lowRateModeEnabled = false;

/** 外部设置低速率模式开关 */
export function setLowRateMode(enabled: boolean): void {
  lowRateModeEnabled = enabled;
}

/** 节流等待：确保距上次同源请求至少 MIN_INTERVAL_MS（仅在低速率模式开启时生效） */
async function throttle(baseUrl: string): Promise<void> {
  if (!lowRateModeEnabled) return;
  const now = Date.now();
  const last = lastRequestTime.get(baseUrl) || 0;
  const elapsed = now - last;
  if (elapsed < MIN_INTERVAL_MS) {
    const wait = MIN_INTERVAL_MS - elapsed;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestTime.set(baseUrl, Date.now());
}

/** 解析 Retry-After 头（支持秒数或 HTTP 日期） */
function parseRetryAfter(header: string | null): number {
  if (!header) return DEFAULT_RETRY_AFTER_MS;
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  const date = new Date(header).getTime();
  if (!isNaN(date)) return Math.max(0, date - Date.now());
  return DEFAULT_RETRY_AFTER_MS;
}

/**
 * 带节流 + 429 重试的 API fetch。
 *
 * - 低速率模式开启时：请求前节流 1.5s + 429 自动重试
 * - 低速率模式关闭时：仅 429 自动重试（不节流）
 *
 * 用法：
 * ```ts
 * apiFetch(model.baseUrl, { method: 'POST', headers, body })
 * ```
 */
export async function apiFetch(
  baseUrl: string,
  init: RequestInit,
): Promise<Response> {
  const url = chatCompletionsUrl(baseUrl);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // 节流：仅在低速率模式开启时生效
    await throttle(baseUrl);

    const resp = await fetch(url, init);

    if (resp.status !== 429) return resp;

    // 429：指数退避重试
    if (attempt < MAX_RETRIES) {
      // 优先读 Retry-After 头；无则指数退避 3s → 6s → 12s
      const headerRetry = parseRetryAfter(resp.headers.get('retry-after'));
      const backoff = DEFAULT_RETRY_AFTER_MS * Math.pow(2, attempt);
      const waitMs = headerRetry > 0 ? headerRetry : backoff;
      console.warn(
        `[apiFetch] 429 速率限制，${Math.round(waitMs / 1000)}s 后重试 (baseUrl=${baseUrl}, attempt=${attempt + 1}/${MAX_RETRIES})`,
      );
      try { await resp.text(); } catch { /* ignore */ }
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      lastRequestTime.set(baseUrl, 0);
      continue;
    }

    console.warn(`[apiFetch] 429 重试已用尽（${MAX_RETRIES}次），返回错误响应 (baseUrl=${baseUrl})`);
    return resp;
  }

  return fetch(url, init);
}
