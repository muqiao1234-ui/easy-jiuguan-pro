/**
 * 从用户配置的 Base URL 构建 Chat Completions API 地址。
 *
 * 场景覆盖：
 * 1. 用户填根地址（如 https://api.deepseek.com）→ 补齐 /v1/chat/completions
 * 2. 用户填 v1 路径（如 https://api.openai.com/v1）→ 补齐 /chat/completions
 * 3. 用户填完整端点（如 https://open.bigmodel.cn/api/paas/v4/chat/completions）→ 原样返回
 * 4. 用户填带尾部斜杠或 v1/ 的地址 → 去除冗余后补全
 */
export function chatCompletionsUrl(baseUrl: string): string {
  // 去尾部斜杠
  let url = baseUrl.replace(/\/+$/, '');

  // 已经是完整端点：原样返回（智谱、MiniMax 等非 OpenAI 格式 API 直填完整路径）
  if (url.endsWith('/chat/completions')) return url;

  // 去除尾部 /v1/chat/completions 的残留（用户填了带路径前缀的但又不完整的情况极罕见，防御掉）
  url = url.replace(/\/chat\/completions$/, '');

  // 已以 /v1 结尾：补齐 /chat/completions
  if (url.endsWith('/v1')) return `${url}/chat/completions`;

  // 默认补齐 /v1/chat/completions
  return `${url}/v1/chat/completions`;
}
