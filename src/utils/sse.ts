import type { DebugSseResponse, DebugSseResponseEvent, SSEChunk } from '../types';

export interface TokenUsage {
  completion_tokens: number;
  prompt_tokens: number;
  total_tokens: number;
  reasoning_tokens?: number;
}

export class SSEParser {
  private buffer = '';
  private decoder = new TextDecoder();
  public tokenUsage: TokenUsage | null = null;
  private debugEvents: DebugSseResponseEvent[] = [];
  private reasoningContent = '';
  private finishReason: string | undefined;

  parse(chunk: Uint8Array): SSEChunk[] {
    const text = this.decoder.decode(chunk, { stream: true });
    this.buffer += text;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    return this.parseLines(lines);
  }

  /** Flushes a final SSE event even when the server closes without a trailing newline. */
  finish(): SSEChunk[] {
    const text = this.decoder.decode();
    if (text) this.buffer += text;
    if (!this.buffer.trim()) return [];
    const finalLine = this.buffer;
    this.buffer = '';
    return this.parseLines([finalLine]);
  }

  /** Returns every server response data event captured for a debug-mode message. */
  getDebugSnapshot(rawContent: string): DebugSseResponse {
    return {
      format: 'easyjiuguanpro.sse-response-debug.v1',
      transport: 'sse',
      capturedAt: Date.now(),
      events: this.debugEvents.map((event) => ({ ...event })),
      tokenUsage: this.tokenUsage ? { ...this.tokenUsage } : undefined,
      finishReason: this.finishReason,
      reasoningContent: this.reasoningContent || undefined,
      rawContent,
    };
  }

  private parseLines(lines: string[]): SSEChunk[] {
    const results: SSEChunk[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === 'data: [DONE]') {
        this.debugEvents.push({
          sequence: this.debugEvents.length + 1,
          kind: 'done',
          rawData: '[DONE]',
        });
        results.push({ content: '', done: true });
        continue;
      }
      if (!trimmed.startsWith('data:')) continue;

      const rawData = trimmed.slice(5).trimStart();
      try {
        const json = JSON.parse(rawData);
        this.debugEvents.push({
          sequence: this.debugEvents.length + 1,
          kind: 'json',
          rawData,
          data: json,
        });

        if (json.usage && typeof json.usage.completion_tokens === 'number') {
          this.tokenUsage = {
            completion_tokens: json.usage.completion_tokens,
            prompt_tokens: json.usage.prompt_tokens ?? 0,
            total_tokens: json.usage.total_tokens ?? 0,
            reasoning_tokens: json.usage.completion_tokens_details?.reasoning_tokens
              ?? json.usage.output_tokens_details?.reasoning_tokens
              ?? json.usage.reasoning_tokens,
          };
        }

        const choice = json.choices?.[0];
        const delta = choice?.delta;
        const reasoning = delta?.reasoning_content ?? delta?.reasoning;
        if (typeof reasoning === 'string' && reasoning) {
          this.reasoningContent += reasoning;
        }
        if (typeof choice?.finish_reason === 'string' && choice.finish_reason) {
          this.finishReason = choice.finish_reason;
        }

        const content = delta?.content;
        if (typeof content === 'string' && content) {
          results.push({ content, done: false });
        }
      } catch (error) {
        this.debugEvents.push({
          sequence: this.debugEvents.length + 1,
          kind: 'invalid_json',
          rawData,
          parseError: error instanceof Error ? error.message : 'Unknown JSON parse error',
        });
      }
    }
    return results;
  }

  reset(): void {
    this.buffer = '';
    this.decoder = new TextDecoder();
    this.tokenUsage = null;
    this.debugEvents = [];
    this.reasoningContent = '';
    this.finishReason = undefined;
  }
}
