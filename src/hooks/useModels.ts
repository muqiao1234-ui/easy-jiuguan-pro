import { useState, useCallback } from 'react';
import type { ModelConfig } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';

import { chatCompletionsUrl } from '../utils/chatCompletionsUrl';
export function useModels() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [pinging, setPinging] = useState<Record<string, boolean>>({});

  const loadModels = useCallback(async () => {
    try {
      setLoading(true);
      const data = await Stores.getAllModels();
      setModels(data);
    } catch (e) {
      console.error('loadModels failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const addModel = useCallback(
    async (name: string, baseUrl: string, apiKey: string, defaultModel: string, maxContextTokens?: number, temperature?: number, topP?: number) => {
      const model: ModelConfig = {
        id: generateId(),
        name,
        baseUrl,
        apiKey,
        defaultModel,
        latency: -1,
        maxContextTokens: maxContextTokens && maxContextTokens > 0 ? maxContextTokens : 4000,
        temperature: temperature ?? 0.8,
        topP: topP ?? 0.95,
      };
      await Stores.addModel(model);
      setModels((prev) => [...prev, model]);
      return model;
    },
    []
  );

  const updateModel = useCallback(async (id: string, updates: Partial<ModelConfig>) => {
    await Stores.updateModel(id, updates);
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  }, []);

  const deleteModel = useCallback(async (id: string) => {
    await Stores.deleteModel(id);
    setModels((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const pingModel = useCallback(
    async (id: string) => {
      setPinging((prev) => ({ ...prev, [id]: true }));
      const model = models.find((m) => m.id === id);
      if (!model) {
        setPinging((prev) => ({ ...prev, [id]: false }));
        return;
      }
      const t1 = Date.now();
      let latency: number;
      try {
        const resp = await fetch(`${chatCompletionsUrl(model.baseUrl)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${model.apiKey}`,
          },
          body: JSON.stringify({
            model: model.defaultModel,
            messages: [{ role: 'user', content: 'p' }],
            max_tokens: 1,
            stream: false,
          }),
          signal: AbortSignal.timeout(10000),
        });
        // 检查 HTTP 状态：401/403/404/500 等均不应视为"通道可用"
        // 旧实现无视 resp.ok，API Key 错误返回 401 时仍显示绿色延迟，
        // 误导用户以为通道正常。
        if (!resp.ok) {
          // 编码方式：-400 - status，例如 401 → -401，500 → -500。
          // 既能在 ModelPing 中精确区分 HTTP 状态码，
          // 又天然 < -3，与 -1（未测试）/ -2（超时）/ -3（网络/CORS）不冲突。
          latency = -400 - resp.status;
          console.warn(`[Ping] ${model.name} HTTP ${resp.status} ${resp.statusText}`);
        } else {
          latency = Date.now() - t1;
        }
      } catch (e: any) {
        if (e.name === 'TimeoutError' || e.name === 'AbortError') {
          latency = -2;
        } else {
          latency = -3;
        }
      }
      await Stores.updateModel(id, { latency });
      setModels((prev) =>
        prev.map((m) => (m.id === id ? { ...m, latency } : m))
      );
      setPinging((prev) => ({ ...prev, [id]: false }));
    },
    [models]
  );

  return { models, loading, pinging, loadModels, addModel, updateModel, deleteModel, pingModel };
}
