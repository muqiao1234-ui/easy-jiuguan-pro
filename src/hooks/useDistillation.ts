import { useState, useCallback } from 'react';
import type { MessageNode, ModelConfig, DistillationResult, WorldBookEntry } from '../types';
import { generateId } from '../utils/id';
import { DEFAULT_DISTILLATION_PROMPT, DEFAULT_TPL_DISTILLED_NODE_PREFIX } from '../utils/constants';

import { apiFetch } from '../utils/apiFetch';

interface PerformParams {
  nodes: MessageNode[];
  distillModelId: string;
  distillationPrompt: string;
  tplDistilledNodePrefix?: string;
  /** 上一轮记忆结晶的完整内容（无则 null） */
  prevDistilledContent?: string | null;
  /** 蒸馏区间对话中激活的世界书条目 */
  activatedWorldBookEntries?: WorldBookEntry[];
  getModelById: (id: string) => Promise<ModelConfig | undefined>;
  addMessageNode: (node: MessageNode) => Promise<void>;
  batchUpdateNodes: (
    updates: Array<{ id: string; changes: Partial<MessageNode> }>
  ) => Promise<void>;
}

export function useDistillation() {
  const [isDistilling, setIsDistilling] = useState(false);
  const [lastResult, setLastResult] = useState<DistillationResult | null>(null);

  const checkNeeded = (unarchivedCount: number, threshold: number): boolean => {
    return unarchivedCount >= threshold;
  };

  /**
   * 将世界书条目格式化为粘连到记忆结晶尾部的文本块。
   * 只保留条目名词，不包含正文，节约 token。
   * 格式：(附带：区间激活的世界书条目表)
   *       [词条1] [词条2] [词条3]
   */
  function formatWorldBookAppendix(entries: WorldBookEntry[]): string {
    if (!entries || entries.length === 0) return '';
    const names = entries.map((e) => `[${e.keys?.[0] || '未知'}]`).join(' ');
    return '\n\n(附带：区间激活的世界书条目表)\n' + names;
  }

  const performDistillation = useCallback(async (params: PerformParams) => {
    setIsDistilling(true);
    try {
      const model = await params.getModelById(params.distillModelId);
      if (!model) throw new Error('蒸馏模型未配置');

      const sorted = [...params.nodes].sort((a, b) => a.timestamp - b.timestamp);
      if (sorted.length === 0) throw new Error('无可蒸馏节点');

      const dialogueText = sorted
        .map((n) => `${n.senderName}: ${n.content}`)
        .join('\n\n');

      // ── 构建蒸馏 AI 的 messages 数组 ──
      // 结构：(提示词) → (上一轮记忆结晶) → (区间对话+激活世界书) → (提示词·尾部强化)
      const basePrompt = params.distillationPrompt || DEFAULT_DISTILLATION_PROMPT;
      const wbEntries = params.activatedWorldBookEntries || [];
      const wbText = wbEntries.length > 0
        ? '\n\n--- 本区间激活的世界书条目 ---\n' +
          wbEntries.map((e) => `[${e.keys?.[0] || '未知'}] ${e.value}`).join('\n')
        : '';

      const messages: Array<{ role: string; content: string }> = [];

      // 1. 蒸馏提示词（首部）
      messages.push({ role: 'user', content: basePrompt });

      // 2. 上一轮记忆结晶（如有）
      if (params.prevDistilledContent) {
        messages.push({
          role: 'user',
          content:
            '这是上一轮蒸馏产出的记忆结晶，请在其基础上续写，保持记忆连贯性，不要重复已有内容：\n\n' +
            params.prevDistilledContent,
        });
      }

      // 3. 需要蒸馏的区间对话 + 激活的世界书内容
      messages.push({
        role: 'user',
        content:
          '以下是本轮需要蒸馏的对话内容' +
          (wbText ? '（含区间激活的世界书信息）' : '') +
          '：\n\n' +
          dialogueText +
          wbText,
      });

      // 4. 蒸馏提示词（尾部强化 — 确保输出格式）
      messages.push({ role: 'user', content: basePrompt });

      const resp = await apiFetch(model.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${model.apiKey}`,
        },
        body: JSON.stringify({
          model: model.defaultModel,
          messages,
          stream: false,
        }),
      });

      if (!resp.ok) throw new Error(`蒸馏 API 错误: ${resp.status}`);

      const data = await resp.json();
      const summary = data.choices?.[0]?.message?.content || '蒸馏失败';

      // ── 记忆结晶尾部粘连世界书条目 ──
      // 格式：记忆结晶正文 + (附带：区间激活的世界书条目表)
      const wbAppendix = formatWorldBookAppendix(wbEntries);
      const fullSummary = summary + wbAppendix;

      const content = (params.tplDistilledNodePrefix || DEFAULT_TPL_DISTILLED_NODE_PREFIX)
        .replace('{total}', String(sorted.length))
        .replace('{summary}', fullSummary);

      // 蒸馏是 fire-and-forget 异步触发的，蒸馏过程中用户可能继续发消息。
      // 若摘要节点用 Date.now()，其时间戳会落在"蒸馏期间新发消息"之后，
      // 导致记忆结晶在时间线上插到新消息后面，上下文顺序错乱。
      // 因此取被蒸馏的最后一条消息 timestamp + 1ms，保证记忆结晶的时序
      // 紧贴被蒸馏内容的末尾，无论蒸馏耗时多久都不会越过其后产生的新消息。
      const lastDistilledTs = sorted[sorted.length - 1].timestamp;
      const distilledNode: MessageNode = {
        id: generateId(),
        conversationId: sorted[0].conversationId,
        role: 'distilled',
        senderName: '记忆结晶',
        content,
        isArchived: false,
        timestamp: lastDistilledTs + 1,
      };

      await params.addMessageNode(distilledNode);

      await params.batchUpdateNodes(
        params.nodes.map((n) => ({ id: n.id, changes: { isArchived: true } }))
      );

      const result: DistillationResult = {
        roundStart: 1,
        roundEnd: sorted.length,
        summary: fullSummary,
        nodeId: distilledNode.id,
      };
      setLastResult(result);
      return result;
    } catch (e) {
      console.error('蒸馏失败:', e);
      throw e;
    } finally {
      setIsDistilling(false);
    }
  }, []);

  return { isDistilling, lastResult, checkNeeded, performDistillation };
}