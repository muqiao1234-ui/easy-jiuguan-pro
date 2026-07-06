import type { SSEChunk } from '../types';

export interface TokenUsage {
  completion_tokens: number;
  prompt_tokens: number;
  total_tokens: number;
}

export class SSEParser {
  private buffer = '';
  private decoder = new TextDecoder();
  /** 从流式响应中捕获的最终 token 用量（精确值） */
  public tokenUsage: TokenUsage | null = null;

  parse(chunk: Uint8Array): SSEChunk[] {
    const text = this.decoder.decode(chunk, { stream: true });
    this.buffer += text;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    const results: SSEChunk[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === 'data: [DONE]') {
        results.push({ content: '', done: true });
        continue;
      }
      if (!trimmed.startsWith('data: ')) continue;
      try {
        const json = JSON.parse(trimmed.slice(6));
        // 尝试从任意 SSE 数据行捕获 usage（通常在最后一行）
        if (json.usage && typeof json.usage.completion_tokens === 'number') {
          this.tokenUsage = {
            completion_tokens: json.usage.completion_tokens,
            prompt_tokens: json.usage.prompt_tokens ?? 0,
            total_tokens: json.usage.total_tokens ?? 0,
          };
        }
        const content = json.choices?.[0]?.delta?.content || '';
        if (content) {
          results.push({ content, done: false });
        }
      } catch {
        /* skip invalid JSON lines */
      }
    }
    return results;
  }

  reset(): void {
    this.buffer = '';
    this.tokenUsage = null;
  }
}
