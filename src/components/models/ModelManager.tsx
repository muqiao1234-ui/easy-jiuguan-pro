import React, { useState, useEffect } from 'react';
import { useModels } from '../../hooks/useModels';
import { useApp } from '../../hooks/useApp';
import { SAMPLING_NONE } from '../../utils/constants';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Icon from '../ui/Icon';
import * as Stores from '../../db/stores';

/** 采样参数预设 */
type PresetKey = 'creative' | 'balanced' | 'strict' | 'none';

interface Preset {
  key: PresetKey;
  label: string;
  desc: string;
  temperature: number;
  topP: number;
}

const PRESETS: Preset[] = [
  {
    key: 'creative',
    label: '🎨 异想天开',
    desc: '高随机性 + 高创意，适合发散思维、角色扮演、头脑风暴',
    temperature: 1.2,
    topP: 0.98,
  },
  {
    key: 'balanced',
    label: '⚖️ 中规中矩',
    desc: '常规采样，平衡创意与稳定，适合日常对话与创作',
    temperature: 0.8,
    topP: 0.92,
  },
  {
    key: 'strict',
    label: '📐 严格规矩',
    desc: '低随机性 + 低创意，输出稳定可预测，适合事实问答、代码、严谨任务',
    temperature: 0.3,
    topP: 0.85,
  },
  {
    key: 'none',
    label: '🔄 无设置',
    desc: '不传采样参数，兼容无需采样设置的高级模型（GPT-5.1、Claude 4 等）',
    temperature: SAMPLING_NONE,
    topP: SAMPLING_NONE,
  },
];

export default function ModelManager() {
  const { models, loading, pinging, loadModels, addModel, updateModel, deleteModel, pingModel, fetchAvailableModelIds } = useModels();
  const { state, dispatch } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    baseUrl: '',
    apiKey: '',
    secretId: '',
    secretName: '',
    defaultModel: '',
    maxContextTokens: 4000,
    temperature: 0.8,
    topP: 0.92,
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [apiSecrets, setApiSecrets] = useState<Stores.SecretEntry[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelFetchError, setModelFetchError] = useState('');

  const loadApiSecrets = async () => setApiSecrets(await Stores.getAllSecrets('apiKey'));
  useEffect(() => { loadModels(); loadApiSecrets(); }, [loadModels]);

  const openAdd = () => {
    setEditingId(null);
    setAvailableModels([]);
    setModelFetchError('');
    setForm({ name: '', baseUrl: '', apiKey: '', secretId: '', secretName: '', defaultModel: '', maxContextTokens: 4000, temperature: 0.8, topP: 0.92 });
    setShowModal(true);
  };
  const openEdit = (id: string) => {
    const m = models.find((x) => x.id === id);
    if (!m) return;
    setEditingId(id);
    setAvailableModels([]);
    setModelFetchError('');
    setForm({
      name: m.name,
      baseUrl: m.baseUrl,
      apiKey: '',
      secretId: m.secretId || '',
      secretName: '',
      defaultModel: m.defaultModel,
      maxContextTokens: m.maxContextTokens || 4000,
      temperature: m.temperature ?? 0.8,
      topP: m.topP ?? 0.92,
    });
    setShowModal(true);
  };


  const handleFetchModels = async () => {
    setModelFetchError('');
    const apiKey = form.apiKey.trim() || apiSecrets.find((secret) => secret.id === form.secretId)?.value || '';
    setFetchingModels(true);
    try {
      const ids = await fetchAvailableModelIds(form.baseUrl, apiKey);
      setAvailableModels(ids);
      if (!form.defaultModel && ids.length === 1) setForm((prev) => ({ ...prev, defaultModel: ids[0] }));
    } catch (error) {
      setModelFetchError(error instanceof Error ? error.message : '获取模型失败，请检查地址、密钥和跨域设置。');
    } finally {
      setFetchingModels(false);
    }
  };

  const duplicateModel = async (model: typeof models[number]) => {
    const copy = await addModel(`${model.name} 副本`, model.baseUrl, '', model.defaultModel, model.maxContextTokens, model.temperature, model.topP, model.secretId);
    setEditingId(copy.id);
    setAvailableModels([]);
    setModelFetchError('');
    setForm({
      name: copy.name,
      baseUrl: copy.baseUrl,
      apiKey: '',
      secretId: copy.secretId || '',
      secretName: '',
      defaultModel: copy.defaultModel,
      maxContextTokens: copy.maxContextTokens || 4000,
      temperature: copy.temperature ?? 0.8,
      topP: copy.topP ?? 0.92,
    });
    setShowModal(true);
  };
  const handleSave = async () => {
    if (!form.name || !form.baseUrl || !form.defaultModel) return;
    // 钳制参数到常见大模型的安全范围，避免 400
    // SAMPLING_NONE (-1) 不参与钳制，保持原值以表示「不传采样参数」
    const rawTemp = Number(form.temperature);
    const rawTopP = Number(form.topP);
    const safeTemp = rawTemp === SAMPLING_NONE ? SAMPLING_NONE : Math.max(0, Math.min(2, rawTemp || 0.8));
    const safeTopP = rawTopP === SAMPLING_NONE ? SAMPLING_NONE : Math.max(0, Math.min(1, rawTopP || 0.92));
    let secretId = form.secretId || undefined;
    if (form.apiKey.trim()) {
      const secret = await Stores.createSecret(form.secretName.trim() || `${form.name} API Key`, form.apiKey.trim(), 'apiKey');
      secretId = secret.id;
      await loadApiSecrets();
    }
    const { apiKey: _apiKey, secretName: _secretName, ...modelForm } = form;
    if (editingId) {
      await updateModel(editingId, { ...modelForm, secretId, temperature: safeTemp, topP: safeTopP });
    } else {
      const m = await addModel(form.name, form.baseUrl, '', form.defaultModel, form.maxContextTokens, safeTemp, safeTopP, secretId);
      if (!state.currentDistillModelId) dispatch({ type: 'SET_DISTILL_MODEL', id: m.id });
    }
    setShowModal(false);
  };

  /** 应用预设到当前 form */
  const applyPreset = (p: Preset) => {
    setForm((prev) => ({ ...prev, temperature: p.temperature, topP: p.topP }));
  };

  /** 找到当前参数最匹配的预设 key（用于高亮） */
  const matchedPreset = (): PresetKey | null => {
    for (const p of PRESETS) {
      if (Math.abs(form.temperature - p.temperature) < 0.001 && Math.abs(form.topP - p.topP) < 0.001) {
        return p.key;
      }
    }
    return null;
  };

  const latencyLabel = (lat: number): { text: string; color: string } => {
    if (lat === -1) return { text: '未测试', color: 'text-slate-700 dark:text-slate-300' };
    if (lat === -2) return { text: '超时', color: 'text-red-400' };
    if (lat === -3) return { text: 'Error/CORS', color: 'text-red-400' };
    if (lat <= -400) {
      const status = -400 - lat;
      if (status === 400) return { text: 'HTTP 400 请求错误', color: 'text-red-400' };
      if (status === 401 || status === 403) return { text: `HTTP ${status} 鉴权失败`, color: 'text-red-400' };
      if (status === 404) return { text: 'HTTP 404 路径错误', color: 'text-red-400' };
      if (status === 429) return { text: 'HTTP 429 频率限制', color: 'text-red-400' };
      if (status >= 500) return { text: `HTTP ${status} 服务端异常`, color: 'text-red-400' };
      return { text: `HTTP ${status}`, color: 'text-red-400' };
    }
    return { text: `${lat} ms`, color: lat < 500 ? 'text-green-400' : lat < 1500 ? 'text-amber-400' : 'text-red-400' };
  };

  /** 根据温度/Top-P 推断预设标签（用于卡片展示） */
  const presetBadge = (m: { temperature?: number; topP?: number }): { label: string; color: string } => {
    const t = m.temperature ?? 0.8;
    const p = m.topP ?? 0.92;
    // 无设置模式：temperature 和 topP 均为 -1 表示不传采样参数
    if (t === SAMPLING_NONE && p === SAMPLING_NONE) return { label: '🔄 无设置', color: 'text-slate-400' };
    if (t >= 1.0) return { label: '🎨 异想天开', color: 'text-fuchsia-400' };
    if (t <= 0.5) return { label: '📐 严格规矩', color: 'text-sky-400' };
    return { label: '⚖️ 中规中矩', color: 'text-emerald-400' };
  };

  return (
    <div className="space-y-2 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">模型通道</h3>
        <Button size="sm" onClick={openAdd}><Icon name="plus" size={14} /> 添加</Button>
      </div>

      {models.map((m) => {
        const lat = latencyLabel(m.latency);
        const badge = presetBadge(m);
        return (
          <div key={m.id} className="bg-slate-800/50 rounded-lg p-3 space-y-2 border border-slate-700/50 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate flex-1">{m.name}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(m.id)} className="text-slate-700 dark:text-slate-300 hover:text-slate-300 dark:hover:text-slate-200 p-0.5" title="编辑渠道"><Icon name="edit" size={14} /></button>
                <button onClick={() => void duplicateModel(m)} className="text-slate-700 dark:text-slate-300 hover:text-amber-400 p-0.5" title="复制渠道"><Icon name="copy" size={14} /></button>
                <button onClick={() => setDeleteConfirmId(m.id)} className="text-slate-700 dark:text-slate-300 hover:text-red-400 p-0.5"><Icon name="trash" size={14} /></button>
              </div>
            </div>
            <div className="text-xs text-slate-700 dark:text-slate-300 truncate min-w-0">{m.defaultModel} @ {m.baseUrl}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-700 dark:text-slate-300">
              <span>最大上下文: {(m.maxContextTokens || 4000).toLocaleString()} tokens</span>
              <span className={badge.color}>{badge.label}</span>
              {m.temperature === SAMPLING_NONE && m.topP === SAMPLING_NONE ? (
                <span className="text-slate-500">不传采样参数</span>
              ) : (
                <span className="text-slate-700 dark:text-slate-300">T={(m.temperature ?? 0.8).toFixed(1)} P={(m.topP ?? 0.92).toFixed(2)}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => pingModel(m.id)} loading={pinging[m.id]}>
                <Icon name="ping" size={12} /> Ping
              </Button>
              <span className={`text-xs ${lat.color}`}>{lat.text}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant={state.currentDistillModelId === m.id ? 'primary' : 'ghost'}
                onClick={() => dispatch({ type: 'SET_DISTILL_MODEL', id: m.id })}>
                蒸馏
              </Button>
              <Button size="sm" variant={state.currentImagePromptModelId === m.id ? 'primary' : 'ghost'}
                onClick={() => dispatch({ type: 'SET_IMAGE_PROMPT_MODEL', id: m.id })}>
                生图提示词
              </Button>
            </div>
            {state.currentImagePromptModelId === m.id && <p className="text-[10px] text-sky-700 dark:text-sky-300">此文字模型只负责组装生图提示词，实际图片由生图渠道调用。</p>}
          </div>
        );
      })}

      {models.length === 0 && !loading && (
        <div className="text-center py-6 text-slate-700 dark:text-slate-300 text-sm">暂无模型，点击"添加"配置 API 渠道</div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? '编辑模型' : '添加模型'}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-900 dark:text-slate-100 mb-1">自定义模型名称</label>
            <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如 DeepSeek V3" />
          </div>
          <div>
            <label className="block text-xs text-slate-900 dark:text-slate-100 mb-1">Base URL</label>
            <input className="input-field" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.deepseek.com" />
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-slate-900 dark:text-slate-100">命名密钥</label>
            <select className="input-field" value={form.secretId} onChange={(e) => setForm({ ...form, secretId: e.target.value })}>
              <option value="">不绑定密钥</option>
              {apiSecrets.map((secret) => <option key={secret.id} value={secret.id}>{secret.name}</option>)}
            </select>
            {form.secretId && !apiSecrets.some((secret) => secret.id === form.secretId) && (
              <p className="text-[10px] text-amber-700 dark:text-amber-300">该模型引用的密钥只存在于另一台设备。请选择本机密钥，或直接输入新密钥。</p>
            )}
            <input className="input-field" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={editingId ? '输入新密钥以新建并替换当前绑定' : '直接输入新 API Key'} />
            <input className="input-field" value={form.secretName} onChange={(e) => setForm({ ...form, secretName: e.target.value })} placeholder="新密钥名称（可选）" />
            <p className="text-[10px] text-slate-700 dark:text-slate-300">直接输入会创建本机命名密钥；留空则使用下拉框所选密钥。密钥不会出现在导出或同步文件中。</p>
          </div>
          <div>
            <label className="block text-xs text-slate-900 dark:text-slate-100 mb-1">API 模型名</label>
            <div className="flex gap-2">
              <select className="input-field min-w-0 flex-1" value={availableModels.includes(form.defaultModel) ? form.defaultModel : ''} onChange={(e) => e.target.value && setForm({ ...form, defaultModel: e.target.value })}>
                <option value="">{availableModels.length ? '从已获取的模型中选择' : '先点击“获取模型”加载下拉列表'}</option>
                {availableModels.map((modelId) => <option key={modelId} value={modelId}>{modelId}</option>)}
              </select>
              <Button size="sm" variant="secondary" loading={fetchingModels} onClick={() => void handleFetchModels()} title="获取当前渠道支持的模型"><Icon name="refresh" size={13} /> 获取模型</Button>
            </div>
            <input className="input-field mt-2" value={form.defaultModel} onChange={(e) => setForm({ ...form, defaultModel: e.target.value })} placeholder="也可以手动填写，例如 deepseek-chat" />
            {modelFetchError && <p className="mt-1 text-[10px] text-red-600 dark:text-red-300">{modelFetchError}</p>}
            <p className="mt-1 text-[10px] text-slate-700 dark:text-slate-300">“获取模型”会请求当前渠道的 OpenAI 兼容 /models 接口；部分服务商不提供该接口时，仍可手动填写模型名。</p>
          </div>
          <div>
            <label className="block text-xs text-slate-900 dark:text-slate-100 mb-1">最大上下文 Token 数</label>
            <input className="input-field" type="number" value={form.maxContextTokens} onChange={(e) => setForm({ ...form, maxContextTokens: Math.max(1000, parseInt(e.target.value) || 4000) })} placeholder="4000" />
            <p className="text-[10px] text-slate-700 dark:text-slate-300 mt-1">用于上下文截断，不同模型填不同值（如 GPT-4o=128000, DeepSeek=64000, 本地 7B=4096）</p>
          </div>

          {/* ===== 采样参数预设 ===== */}
          <div className="border-t border-slate-700/50 pt-3">
            <label className="block text-xs text-slate-900 dark:text-slate-100 mb-2">采样参数预设</label>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => {
                const active = matchedPreset() === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`text-xs rounded-lg px-2 py-2 border transition-colors text-center
                      ${active
                        ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                        : 'bg-slate-800/50 border-slate-700/50 text-slate-900 dark:text-slate-100 hover:border-amber-500/50 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                  >
                    <div className="font-medium">{p.label}</div>
                    <div className="text-[10px] text-slate-700 dark:text-slate-300 mt-0.5">T={p.temperature} · P={p.topP}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-700 dark:text-slate-300 mt-1.5">
              {PRESETS.find((p) => p.key === matchedPreset())?.desc ||
                '已自定义参数，不在预设范围内'}
            </p>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-[10px] text-slate-700 dark:text-slate-300 mb-0.5">Temperature (0-2)</label>
                <input
                  className="input-field"
                  type="number"
                  step="0.1"
                  min={0}
                  max={2}
                  value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-700 dark:text-slate-300 mb-0.5">Top-P (0-1)</label>
                <input
                  className="input-field"
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={form.topP}
                  onChange={(e) => setForm({ ...form, topP: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
            <Button onClick={handleSave}>{editingId ? '保存' : '添加'}</Button>
          </div>
        </div>
      </Modal>

      {/* 删除确认弹窗 */}
      <Modal open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} title="删除模型">
        <p className="text-sm text-slate-900 dark:text-slate-100 mb-4">
          确定要删除模型「{models.find((m) => m.id === deleteConfirmId)?.name || ''}」吗？此操作不可撤销。
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>取消</Button>
          <Button
            className="!bg-red-600 hover:!bg-red-500"
            onClick={async () => {
              if (deleteConfirmId) {
                await deleteModel(deleteConfirmId);
                setDeleteConfirmId(null);
              }
            }}
          >
            确认删除
          </Button>
        </div>
      </Modal>
    </div>
  );
}
