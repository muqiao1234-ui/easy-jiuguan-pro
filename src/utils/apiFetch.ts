/**
 * 带节流 + 429 自动重试的 API 请求函数。
 *
 * 解决问题：
 * 1. 智谱 BigModel (glm-4-flash) 等限速严格的 API，即使串行触发也会因
 *    两次请求间隔过短（< 1 秒）而触发 429 "速率限制"。
 * 2. 主对话流式回复完成后，Galgame/scribe/蒸馏等后续触发紧跟着发出，
 *    实际请求间隔可能只有几百毫秒。
 *
 * 策略：
 * - 按 baseUrl 维度维护"上次请求时间戳"，确保同源请求间隔 ≥ MIN_INTERVAL_MS
 * - 收到 429 时，读取 Retry-After 头（或默认等待 2 秒），自动重试一次
 * - 节流和重试对调用方透明，用法同原生 fetch
 */

import { chatCompletionsUrl } from './chatCompletionsUrl';

/** 同一 baseUrl 的最小请求间隔（毫秒）。1.5 秒适配智谱 1 QPS 限制 + 缓冲。 */
const MIN_INTERVAL_MS = 1500;

/** 429 重试最大次数 */
const MAX_RETRIES = 1;

/** 429 默认等待时间（毫秒），当响应无 Retry-After 头时使用 */
const DEFAULT_RETRY_AFTER_MS = 2000;

/** 每个 baseUrl 的上次请求时间戳 */
const lastRequestTime = new Map<string, number>();

/** 节流等待：确保距上次同源请求至少 MIN_INTERVAL_MS */
async function throttle(baseUrl: string): Promise<void> {
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
  // 纯数字 = 秒
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  // HTTP 日期
  const date = new Date(header).getTime();
  if (!isNaN(date)) return Math.max(0, date - Date.now());
  return DEFAULT_RETRY_AFTER_MS;
}

/**
 * 带节流 + 429 重试的 API fetch。
 *
 * 用法（替换原 fetch + chatCompletionsUrl 两步操作）：
 * ```ts
 * // 原来：
 * fetch(`${chatCompletionsUrl(model.baseUrl)}`, { method: 'POST', ... })
 *
 * // 现在：
 * apiFetch(model.baseUrl, { method: 'POST', ... })
 * ```
 *
 * 内部自动：1) 转换 URL  2) 节流等待  3) 发请求  4) 429 时重试
 */
export async function apiFetch(
  baseUrl: string,
  init: RequestInit,
): Promise<Response> {
  const url = chatCompletionsUrl(baseUrl);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // 节流：确保同源请求间隔
    await throttle(baseUrl);

    const resp = await fetch(url, init);

    // 非 429 直接返回
    if (resp.status !== 429) return resp;

    // 429：读取 Retry-After，等待后重试（仅重试一次）
    if (attempt < MAX_RETRIES) {
      const retryAfter = parseRetryAfter(resp.headers.get('retry-after'));
      console.warn(
        `[apiFetch] 429 速率限制，${retryAfter}ms 后重试 (baseUrl=${baseUrl}, attempt=${attempt + 1}/${MAX_RETRIES})`,
      );
      // 丢弃响应体
      try { await resp.text(); } catch { /* ignore */ }
      // 等待后重试
      await new Promise((resolve) => setTimeout(resolve, retryAfter));
      // 重试前重置节流时间戳（因为已经等了 retryAfter）
      lastRequestTime.set(baseUrl, 0);
      continue;
    }

    // 重试次数用尽，返回 429 响应让调用方处理
    console.warn(`[apiFetch] 429 重试已用尽，返回错误响应 (baseUrl=${baseUrl})`);
    return resp;
  }

  // 理论上不会到达
  return fetch(url, init);
}
