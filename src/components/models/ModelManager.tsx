import React, { useState, useEffect } from 'react';
import { useModels } from '../../hooks/useModels';
import { useApp } from '../../hooks/useApp';
import { SAMPLING_NONE } from '../../utils/constants';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Icon from '../ui/Icon';

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
  const { models, loading, pinging, loadModels, addModel, updateModel, deleteModel, pingModel } = useModels();
  const { state, dispatch } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    baseUrl: '',
    apiKey: '',
    defaultModel: '',
    maxContextTokens: 4000,
    temperature: 0.8,
    topP: 0.92,
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => { loadModels(); }, [loadModels]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ name: '', baseUrl: '', apiKey: '', defaultModel: '', maxContextTokens: 4000, temperature: 0.8, topP: 0.92 });
    setShowModal(true);
  };
  const openEdit = (id: string) => {
    const m = models.find((x) => x.id === id);
    if (!m) return;
    setEditingId(id);
    setForm({
      name: m.name,
      baseUrl: m.baseUrl,
      apiKey: m.apiKey,
      defaultModel: m.defaultModel,
      maxContextTokens: m.maxContextTokens || 4000,
      temperature: m.temperature ?? 0.8,
      topP: m.topP ?? 0.92,
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
    if (editingId) {
      await updateModel(editingId, { ...form, temperature: safeTemp, topP: safeTopP });
    } else {
      const m = await addModel(form.name, form.baseUrl, form.apiKey, form.defaultModel, form.maxContextTokens, safeTemp, safeTopP);
      if (!state.currentChatModelId) dispatch({ type: 'SET_CHAT_MODEL', id: m.id });
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
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">模型通道</h3>
        <Button size="sm" onClick={openAdd}><Icon name="plus" size={14} /> 添加</Button>
      </div>

      {models.map((m) => {
        const lat = latencyLabel(m.latency);
        const badge = presetBadge(m);
        return (
          <div key={m.id} className="bg-slate-800/50 rounded-lg p-3 space-y-2 border border-slate-700/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate flex-1">{m.name}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(m.id)} className="text-slate-700 dark:text-slate-300 hover:text-slate-300 dark:hover:text-slate-200 p-0.5"><Icon name="edit" size={14} /></button>
                <button onClick={() => setDeleteConfirmId(m.id)} className="text-slate-700 dark:text-slate-300 hover:text-red-400 p-0.5"><Icon name="trash" size={14} /></button>
              </div>
            </div>
            <div className="text-xs text-slate-700 dark:text-slate-300 truncate">{m.defaultModel} @ {m.baseUrl}</div>
            <div className="flex items-center gap-3 text-[10px] text-slate-700 dark:text-slate-300">
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
            <div className="flex gap-1">
              <Button size="sm" variant={state.currentChatModelId === m.id ? 'primary' : 'ghost'}
                onClick={() => dispatch({ type: 'SET_CHAT_MODEL', id: m.id })}>
                聊天
              </Button>
              <Button size="sm" variant={state.currentDistillModelId === m.id ? 'primary' : 'ghost'}
                onClick={() => dispatch({ type: 'SET_DISTILL_MODEL', id: m.id })}>
                蒸馏
              </Button>
            </div>
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
          <div>
            <label className="block text-xs text-slate-900 dark:text-slate-100 mb-1">API Key</label>
            <input className="input-field" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-..." />
          </div>
          <div>
            <label className="block text-xs text-slate-900 dark:text-slate-100 mb-1">API 模型名</label>
            <input className="input-field" value={form.defaultModel} onChange={(e) => setForm({ ...form, defaultModel: e.target.value })} placeholder="deepseek-chat" />
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
