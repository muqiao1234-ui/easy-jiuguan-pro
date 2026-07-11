import { useState, useCallback } from 'react';
import type { MessageNode, ModelConfig, DistillationResult } from '../types';
import { generateId } from '../utils/id';
import { DEFAULT_DISTILLATION_PROMPT, DEFAULT_TPL_DISTILLED_NODE_PREFIX } from '../utils/constants';

import { apiFetch } from '../utils/apiFetch';
interface PerformParams {
  nodes: MessageNode[];
  distillModelId: string;
  distillationPrompt: string;
  tplDistilledNodePrefix?: string;
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

      // Use custom prompt template; {dialogue} is replaced with the actual text
      const prompt = (params.distillationPrompt || DEFAULT_DISTILLATION_PROMPT).replace(
        '{dialogue}',
        dialogueText
      );

      const resp = await apiFetch(model.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${model.apiKey}`,
        },
        body: JSON.stringify({
          model: model.defaultModel,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
      });

      if (!resp.ok) throw new Error(`蒸馏 API 错误: ${resp.status}`);

      const data = await resp.json();
      const summary = data.choices?.[0]?.message?.content || '蒸馏失败';
      const content = (params.tplDistilledNodePrefix || DEFAULT_TPL_DISTILLED_NODE_PREFIX)
        .replace('{total}', String(sorted.length))
        .replace('{summary}', summary);

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
        summary,
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
