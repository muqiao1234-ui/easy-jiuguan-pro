import { useState, useCallback } from 'react';
import type { ModelConfig } from '../types';
import * as Stores from '../db/stores';
import { generateId } from '../utils/id';

import { apiFetch } from '../utils/apiFetch';
import { modelsUrl } from '../utils/modelsUrl';

export async function fetchAvailableModelIds(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = modelsUrl(baseUrl);
  if (!url) throw new Error('请先填写 Base URL。');
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.text()).slice(0, 180); } catch { /* ignore response body errors */ }
    throw new Error(`获取模型失败（HTTP ${response.status}）${detail ? `：${detail}` : ''}`);
  }
  const payload: unknown = await response.json();
  const rawItems = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === 'object' && 'data' in payload && Array.isArray(payload.data)
      ? payload.data
      : (payload && typeof payload === 'object' && 'models' in payload && Array.isArray(payload.models) ? payload.models : []));
  const ids = rawItems.flatMap((item) => {
    if (typeof item === 'string') return [item];
    if (item && typeof item === 'object' && 'id' in item && typeof item.id === 'string') return [item.id];
    return [];
  }).map((id) => id.trim()).filter(Boolean);
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw new Error('接口返回成功，但没有找到可用模型。');
  return unique;
}
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
    async (name: string, baseUrl: string, apiKey: string, defaultModel: string, maxContextTokens?: number, temperature?: number, topP?: number, secretId?: string) => {
      const model: ModelConfig = {
        id: generateId(),
        name,
        baseUrl,
        apiKey,
        secretId,
        defaultModel,
        latency: -1,
        maxContextTokens: maxContextTokens && maxContextTokens > 0 ? maxContextTokens : 4000,
        temperature: temperature ?? 0.8,
        topP: topP ?? 0.95,
      };
      await Stores.addModel(model);
      // API Key lives in the vault, so refresh the resolved model before exposing it
      // to the UI. The input model intentionally contains no inline key.
      const resolvedModel = await Stores.getModelById(model.id) || model;
      setModels((prev) => [...prev, resolvedModel]);
      return resolvedModel;
    },
    []
  );

  const updateModel = useCallback(async (id: string, updates: Partial<ModelConfig>) => {
    await Stores.updateModel(id, updates);
    // A changed secretId must be resolved from the vault immediately. Merging the
    // edit form would retain the previous key in memory until a full page reload.
    const resolvedModel = await Stores.getModelById(id);
    setModels((prev) => prev.map((model) => (model.id === id ? (resolvedModel || { ...model, ...updates }) : model)));
  }, []);

  const deleteModel = useCallback(async (id: string) => {
    await Stores.deleteModel(id);
    setModels((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const pingModel = useCallback(
    async (id: string) => {
      setPinging((prev) => ({ ...prev, [id]: true }));
      // Always resolve just before sending. This prevents a newly replaced named
      // secret from using a stale in-memory API key during the first Ping request.
      const model = await Stores.getModelById(id);
      if (!model) {
        setPinging((prev) => ({ ...prev, [id]: false }));
        return;
      }
      const t1 = Date.now();
      let latency: number;
      try {
        const resp = await apiFetch(model.baseUrl, {
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

  return { models, loading, pinging, loadModels, addModel, updateModel, deleteModel, pingModel, fetchAvailableModelIds };
}
