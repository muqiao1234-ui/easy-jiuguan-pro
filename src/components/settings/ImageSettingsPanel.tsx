import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../hooks/useApp';
import type { ComfyUiMapping, ImageChannel } from '../../types';
import * as Stores from '../../db/stores';
import { generateId } from '../../utils/id';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Icon from '../ui/Icon';
import { apiFetch } from '../../utils/apiFetch';
import { downloadJsonFile } from '../../utils/backup';
import {
  DEFAULT_IMAGE_REQUEST_TIMEOUT_SECONDS,
  MAX_IMAGE_REQUEST_TIMEOUT_SECONDS,
  MIN_IMAGE_REQUEST_TIMEOUT_SECONDS,
  NOVELAI_DEFAULT_IMAGE_MODEL,
  NOVELAI_IMAGE_API_URL,
  NANO_BANANA_DEFAULT_IMAGE_MODEL,
  NANO_BANANA_IMAGE_API_URL,
} from '../../utils/constants';
import { listComfyOutputNodes, listComfyWritableInputs, normalizeComfyMapping, summarizeComfyWorkflow, validateComfyWorkflow } from '../../utils/comfyui';
import { requestOpenAiImage } from '../../utils/imageGeneration';

type ChannelKind = 'openai' | 'novelai' | 'comfyui' | 'nano_banana';

type ImageChannelForm = {
  kind: ChannelKind;
  name: string;
  baseUrl: string;
  apiKey: string;
  secretId: string;
  secretName: string;
  imageModel: string;
  requestTimeoutSeconds: string;
};

type ManualMapping = {
  positive: string;
  negative: string;
  seed: string;
  width: string;
  height: string;
  outputNodeId: string;
  pollIntervalMs: string;
  staticJson: string;
};

const EMPTY: ImageChannelForm = {
  kind: 'openai', name: '', baseUrl: '', apiKey: '', secretId: '', secretName: '', imageModel: '',
  requestTimeoutSeconds: String(DEFAULT_IMAGE_REQUEST_TIMEOUT_SECONDS),
};

const EMPTY_MANUAL: ManualMapping = {
  positive: '', negative: '', seed: '', width: '', height: '', outputNodeId: '', pollIntervalMs: '1500', staticJson: '{}',
};

function splitPaths(value: string): string[] {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function jsonObject(value: string): Record<string, unknown> {
  const clean = value.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('未找到有效 JSON 对象。');
  const parsed = JSON.parse(clean.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON 根节点必须是对象。');
  return parsed as Record<string, unknown>;
}

function manualFromMapping(mapping: ComfyUiMapping | null): ManualMapping {
  if (!mapping) return EMPTY_MANUAL;
  return {
    positive: mapping.mappings.positive_prompt.join('\n'),
    negative: (mapping.mappings.negative_prompt || []).join('\n'),
    seed: (mapping.mappings.seed || []).join('\n'),
    width: (mapping.mappings.width || []).join('\n'),
    height: (mapping.mappings.height || []).join('\n'),
    outputNodeId: mapping.outputNodeId,
    pollIntervalMs: String(mapping.pollIntervalMs ?? 1500),
    staticJson: JSON.stringify(mapping.static || {}, null, 2),
  };
}

export default function ImageSettingsPanel({ onBack }: { onBack: () => void }) {
  const { state, dispatch } = useApp();
  const [channels, setChannels] = useState<ImageChannel[]>([]);
  const [apiSecrets, setApiSecrets] = useState<Stores.SecretEntry[]>([]);
  const [editing, setEditing] = useState<ImageChannel | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ImageChannelForm>(EMPTY);
  const [workflow, setWorkflow] = useState<Record<string, unknown> | null>(null);
  const [mapping, setMapping] = useState<ComfyUiMapping | null>(null);
  const [manual, setManual] = useState<ManualMapping>(EMPTY_MANUAL);
  const [mappingBusy, setMappingBusy] = useState(false);
  const [error, setError] = useState('');
  const [testKind, setTestKind] = useState<'color' | 'flower' | 'duck' | 'woman'>('flower');
  const [testStatus, setTestStatus] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState('');
  const [testImageUrl, setTestImageUrl] = useState('');
  const workflowInputRef = useRef<HTMLInputElement>(null);
  const mappingInputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const [nextChannels, secrets] = await Promise.all([Stores.getAllImageChannels(), Stores.getAllSecrets('apiKey')]);
    setChannels(nextChannels);
    setApiSecrets(secrets);
  };

  useEffect(() => { void reload(); }, []);
  const writableInputs = useMemo(() => workflow ? listComfyWritableInputs(workflow) : [], [workflow]);
  const outputNodes = useMemo(() => workflow ? listComfyOutputNodes(workflow) : [], [workflow]);

  useEffect(() => () => { if (testImageUrl) URL.revokeObjectURL(testImageUrl); }, [testImageUrl]);

  const appendManualPath = (field: 'positive' | 'negative' | 'seed' | 'width' | 'height', path: string) => {
    if (!path) return;
    setManual((current) => ({ ...current, [field]: current[field] ? `${current[field]}\n${path}` : path }));
  };

  const runTest = async () => {
    const channel = channels.find((item) => item.id === state.currentImageChannelId);
    if (!channel) { setTestError('请先在列表中勾选一个生图渠道。'); return; }
    const prompts = {
      color: '一张纯色背景测试图，平整的天蓝色画面，无人物，无文字',
      flower: '一朵明亮的红色花朵，纯净浅色背景，清晰居中构图',
      duck: '一只正在跳舞的黄色小鸭子，干净背景，动作清晰，轻松可爱',
      woman: '一位正在微笑的成年女性肖像，柔和光线，干净背景，清晰五官',
    };
    setTestError(''); setTestBusy(true); setTestStatus('正在提交测试图...');
    try {
      const result = await requestOpenAiImage({
        channel,
        positive: prompts[testKind],
        negative: '低清晰度，模糊，畸形，多余肢体，文字，水印',
        size: '1024x1024',
        onPhase: (phase) => setTestStatus(phase === 'downloading' ? '正在下载测试图片...' : '正在生成测试图...'),
      });
      const url = URL.createObjectURL(result.blob);
      setTestImageUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return url; });
      setTestStatus('测试成功。');
    } catch (cause) {
      setTestStatus('');
      setTestError(cause instanceof Error ? cause.message : '测试生图失败。');
    } finally {
      setTestBusy(false);
    }
  };

  const close = () => {
    setShowModal(false); setEditing(null); setForm(EMPTY); setWorkflow(null); setMapping(null); setManual(EMPTY_MANUAL); setError('');
  };

  const openAdd = () => {
    close();
    setShowModal(true);
  };

  const openEdit = (channel: ImageChannel) => {
    const kind: ChannelKind = channel.kind === 'comfyui' ? 'comfyui' : channel.kind === 'novelai' ? 'novelai' : channel.kind === 'nano_banana' ? 'nano_banana' : 'openai';
    setEditing(channel);
    setForm({
      kind,
      name: channel.name,
      baseUrl: channel.baseUrl || '',
      apiKey: '',
      secretId: channel.secretId || '',
      secretName: '',
      imageModel: channel.imageModel,
      requestTimeoutSeconds: String(channel.requestTimeoutSeconds ?? DEFAULT_IMAGE_REQUEST_TIMEOUT_SECONDS),
    });
    const nextWorkflow = channel.comfyWorkflow ? validateComfyWorkflow(channel.comfyWorkflow) : null;
    const nextMapping = channel.comfyMapping && nextWorkflow ? normalizeComfyMapping(channel.comfyMapping, nextWorkflow) : null;
    setWorkflow(nextWorkflow); setMapping(nextMapping); setManual(manualFromMapping(nextMapping));
    setError(channel.baseUrl ? '' : '这是旧版生图渠道，请补充独立 API 地址后保存。');
    setShowModal(true);
  };

  const importWorkflow = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = validateComfyWorkflow(jsonObject(await file.text()));
      setWorkflow(parsed);
      setMapping(null);
      setManual(EMPTY_MANUAL);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '工作流导入失败。');
    } finally {
      if (workflowInputRef.current) workflowInputRef.current.value = '';
    }
  };

  const importMapping = async (file?: File) => {
    if (!file) return;
    try {
      if (!workflow) throw new Error('请先导入 ComfyUI API 工作流。');
      const parsed = normalizeComfyMapping(jsonObject(await file.text()), workflow);
      setMapping(parsed); setManual(manualFromMapping(parsed)); setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '映射文件导入失败。');
    } finally {
      if (mappingInputRef.current) mappingInputRef.current.value = '';
    }
  };

  const applyManualMapping = () => {
    try {
      if (!workflow) throw new Error('请先导入 ComfyUI API 工作流。');
      const staticValues = jsonObject(manual.staticJson || '{}');
      const parsed = normalizeComfyMapping({
        version: 1,
        mappings: {
          positive_prompt: splitPaths(manual.positive),
          negative_prompt: splitPaths(manual.negative),
          seed: splitPaths(manual.seed),
          width: splitPaths(manual.width),
          height: splitPaths(manual.height),
        },
        static: staticValues,
        output_node_id: manual.outputNodeId,
        poll_interval_ms: Number(manual.pollIntervalMs || 1500),
      }, workflow);
      setMapping(parsed); setManual(manualFromMapping(parsed)); setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '手动映射无效。');
    }
  };

  const generateAiMapping = async () => {
    try {
      if (!workflow) throw new Error('请先导入 ComfyUI API 工作流。');
      if (!state.currentImagePromptModelId) throw new Error('请先在“模型通道”中勾选一个“生图提示词”文字模型。');
      const model = await Stores.getModelById(state.currentImagePromptModelId);
      if (!model?.apiKey) throw new Error('生图提示词文字模型不存在或未绑定本机密钥。');
      setMappingBusy(true); setError('');
      const prompt = state.tplComfyMappingPrompt.replace('{workflow}', summarizeComfyWorkflow(workflow));
      const response = await apiFetch(model.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.apiKey}` },
        body: JSON.stringify({ model: model.defaultModel, messages: [{ role: 'system', content: prompt }], temperature: 0, stream: false }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`AI 映射失败 (${response.status}): ${(await response.text()).slice(0, 240)}`);
      const body = await response.json();
      const content = String(body?.choices?.[0]?.message?.content || body?.choices?.[0]?.text || '');
      const parsed = normalizeComfyMapping(jsonObject(content), workflow);
      setMapping(parsed); setManual(manualFromMapping(parsed));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI 映射失败。');
    } finally {
      setMappingBusy(false);
    }
  };

  const save = async () => {
    if (!form.name.trim() || !form.baseUrl.trim() || (form.kind !== 'comfyui' && !form.imageModel.trim())) {
      setError('请填写渠道名称、服务地址和生图模型名。'); return;
    }
    const requestTimeoutSeconds = Number(form.requestTimeoutSeconds);
    if (!Number.isInteger(requestTimeoutSeconds) || requestTimeoutSeconds < MIN_IMAGE_REQUEST_TIMEOUT_SECONDS || requestTimeoutSeconds > MAX_IMAGE_REQUEST_TIMEOUT_SECONDS) {
      setError(`最长等待时间需为 ${MIN_IMAGE_REQUEST_TIMEOUT_SECONDS}-${MAX_IMAGE_REQUEST_TIMEOUT_SECONDS} 秒之间的整数。`); return;
    }
    if (form.kind === 'comfyui' && (!workflow || !mapping)) {
      setError('ComfyUI 渠道必须导入 API 工作流并保存有效映射。'); return;
    }
    let secretId = form.secretId || undefined;
    if (form.apiKey.trim()) {
      const secret = await Stores.createSecret(form.secretName.trim() || `${form.name.trim()} 生图 API Key`, form.apiKey.trim(), 'apiKey');
      secretId = secret.id;
    }
    if (form.kind !== 'comfyui' && !secretId) {
      setError('请选择已有命名密钥，或直接输入此生图渠道的 API Key。'); return;
    }
    const data = {
      name: form.name.trim(),
      baseUrl: form.kind === 'novelai' ? NOVELAI_IMAGE_API_URL : form.baseUrl.trim(),
      secretId,
      imageModel: form.kind === 'comfyui' ? form.imageModel.trim() : form.imageModel.trim(),
      requestTimeoutSeconds,
      kind: form.kind,
      comfyWorkflow: form.kind === 'comfyui' ? workflow || undefined : undefined,
      comfyMapping: form.kind === 'comfyui' ? mapping || undefined : undefined,
    };
    if (editing) await Stores.updateImageChannel(editing.id, data);
    else await Stores.addImageChannel({ ...data, id: generateId(), createdAt: Date.now() });
    await reload(); close();
  };

  const channelTypeLabel = (channel: ImageChannel) => channel.kind === 'comfyui' ? 'ComfyUI API 工作流' : channel.kind === 'novelai' ? 'NovelAI 官渠' : 'OpenAI 兼容';

  return <div className="max-w-3xl mx-auto space-y-4">
    <div className="flex items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">智能生图渠道</h2><p className="text-xs text-slate-700 dark:text-slate-300 mt-1">文字模型只负责提示词提炼；生图渠道独立调用。ComfyUI 工作流与映射仅保存在本机渠道配置中。</p></div>
      <Button variant="secondary" size="sm" onClick={onBack}>返回设置</Button>
    </div>
    <div className="rounded-lg border border-sky-200 dark:border-sky-800/50 bg-sky-50/70 dark:bg-sky-950/20 p-3 text-xs text-sky-950 dark:text-sky-100 space-y-1">
      <p>支持 OpenAI 兼容、NovelAI 官渠、Nano Banana（Gemini 原生）与 ComfyUI API 工作流。ComfyUI 需自行保证地址可访问、CORS 已启用、模型及自定义节点已安装。</p>
      <p>密钥不会导出或同步；ComfyUI 不需要密钥时可留空。</p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><select className="input-field w-36 py-1 text-xs" value={testKind} onChange={(event) => setTestKind(event.target.value as typeof testKind)}><option value="color">纯色背景</option><option value="flower">花朵</option><option value="duck">跳舞的鸭子</option><option value="woman">微笑的女人</option></select><Button size="sm" variant="secondary" disabled={!state.currentImageChannelId || testBusy} onClick={() => void runTest()}>测试当前渠道</Button></div><Button size="sm" onClick={openAdd}><Icon name="plus" size={14} /> 添加生图渠道</Button></div>
    {(testStatus || testError || testImageUrl) && <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100"><div className="flex flex-wrap items-center justify-between gap-2"><span>{testStatus || testError}</span>{testImageUrl && <a className="text-sky-700 underline dark:text-sky-300" href={testImageUrl} download="easyjiuguanpro-image-test.png">导出测试图</a>}</div>{testImageUrl && <img className="mt-3 max-h-64 rounded border border-sky-200 object-contain dark:border-sky-800" src={testImageUrl} alt="生图渠道测试结果" />}</div>}
    {channels.map((channel) => <div key={channel.id} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/50 p-3 flex gap-3 items-center">
      <div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-900 dark:text-slate-100">{channel.name}</div><div className="text-xs text-slate-700 dark:text-slate-300 truncate">{channel.imageModel || (channel.kind === 'comfyui' ? 'ComfyUI workflow' : '未填写模型')} · 等待 {channel.requestTimeoutSeconds ?? DEFAULT_IMAGE_REQUEST_TIMEOUT_SECONDS} 秒 · {channelTypeLabel(channel)}{channel.kind === 'comfyui' && ` · ${channel.comfyWorkflow ? '工作流已导入' : '缺少工作流'} · ${channel.comfyMapping ? '映射已保存' : '缺少映射'}`}</div></div>
      <Button size="sm" variant={state.currentImageChannelId === channel.id ? 'primary' : 'ghost'} onClick={() => dispatch({ type: 'SET_IMAGE_CHANNEL', id: channel.id })}>生图</Button>
      <button title="编辑渠道" onClick={() => openEdit(channel)} className="p-1 text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-300"><Icon name="edit" size={15} /></button>
      <button title="删除渠道" onClick={async () => { if (!confirm(`删除渠道“${channel.name}”？`)) return; await Stores.deleteImageChannel(channel.id); if (state.currentImageChannelId === channel.id) dispatch({ type: 'SET_IMAGE_CHANNEL', id: null }); await reload(); }} className="p-1 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-300"><Icon name="trash" size={15} /></button>
    </div>)}
    {channels.length === 0 && <div className="py-12 text-center text-sm text-slate-700 dark:text-slate-300">尚未配置生图渠道。</div>}

    <Modal open={showModal} onClose={mappingBusy ? () => {} : close} title={editing ? '编辑生图渠道' : '添加生图渠道'} maxWidth="max-w-3xl">
      <div className="space-y-3">
        <label className="block text-xs text-slate-800 dark:text-slate-100">渠道协议
          <select className="input-field mt-1 w-full min-w-0 max-w-full" value={form.kind} onChange={(event) => {
            const kind = event.target.value as ChannelKind;
            setForm({ ...form, kind, baseUrl: kind === 'novelai' ? NOVELAI_IMAGE_API_URL : kind === 'comfyui' && (form.kind !== 'comfyui' || !form.baseUrl.trim()) ? 'http://127.0.0.1:8188' : kind === 'nano_banana' && (form.kind !== 'nano_banana' || !form.baseUrl.trim()) ? NANO_BANANA_IMAGE_API_URL : form.baseUrl, imageModel: kind === 'novelai' && (form.kind !== 'novelai' || !form.imageModel.trim()) ? NOVELAI_DEFAULT_IMAGE_MODEL : kind === 'nano_banana' && (form.kind !== 'nano_banana' || !form.imageModel.trim() || !form.imageModel.startsWith('gemini-')) ? NANO_BANANA_DEFAULT_IMAGE_MODEL : form.imageModel });
          }}><option value="openai">OpenAI 兼容生图 API</option><option value="novelai">NovelAI 官渠</option><option value="nano_banana">Nano Banana（Gemini 原生）</option><option value="comfyui">ComfyUI API 工作流</option></select>
        </label>
        {form.kind === 'novelai' && <p className="-mt-2 text-[10px] text-slate-600 dark:text-slate-400">使用 NovelAI 官方图像接口；请填写个人 NovelAI Access Token。</p>}
        {form.kind === 'comfyui' && <p className="-mt-2 text-[10px] text-slate-600 dark:text-slate-400">只兼容 ComfyUI API 格式工作流，不提供节点安装或工作流教学。</p>}
        {form.kind === 'nano_banana' && <p className="-mt-2 text-[10px] text-slate-600 dark:text-slate-400">使用 Gemini 原生 generateContent 协议；填写 Google AI API Key 或兼容中转密钥。</p>}
        <label className="block text-xs text-slate-800 dark:text-slate-100">渠道名称<input className="input-field mt-1 w-full min-w-0 max-w-full" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={form.kind === 'comfyui' ? '例如 本机 ComfyUI 高质量工作流' : '例如 OpenAI 生图'} /></label>
        {form.kind === 'novelai' ? <label className="block text-xs text-slate-800 dark:text-slate-100">NovelAI 官方图像接口<input className="input-field mt-1 w-full min-w-0 max-w-full" value={NOVELAI_IMAGE_API_URL} readOnly /></label> : <label className="block text-xs text-slate-800 dark:text-slate-100">{form.kind === 'comfyui' ? 'ComfyUI 服务地址' : form.kind === 'nano_banana' ? 'Gemini / Nano Banana API 地址' : 'OpenAI 兼容 API 地址'}<input className="input-field mt-1 w-full min-w-0 max-w-full" value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder={form.kind === 'comfyui' ? '例如 http://127.0.0.1:8188' : form.kind === 'nano_banana' ? NANO_BANANA_IMAGE_API_URL : '例如 https://api.openai.com/v1'} /></label>}
        {form.kind !== 'comfyui' && <div className="space-y-2">
          <label className="block text-xs text-slate-800 dark:text-slate-100">命名密钥</label>
          <select className="input-field" value={form.secretId} onChange={(event) => setForm({ ...form, secretId: event.target.value })}><option value="">选择已有 API Key</option>{apiSecrets.map((secret) => <option key={secret.id} value={secret.id}>{secret.name}</option>)}</select>
          <input className="input-field" type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={editing ? '输入新密钥以替换当前绑定' : '直接输入此渠道的 API Key'} />
          <input className="input-field" value={form.secretName} onChange={(event) => setForm({ ...form, secretName: event.target.value })} placeholder="新密钥名称（可选）" />
        </div>}
        {form.kind !== 'comfyui' && <label className="block text-xs text-slate-800 dark:text-slate-100">生图模型名<input className="input-field mt-1 w-full min-w-0 max-w-full" value={form.imageModel} onChange={(event) => setForm({ ...form, imageModel: event.target.value })} placeholder={form.kind === 'novelai' ? NOVELAI_DEFAULT_IMAGE_MODEL : form.kind === 'nano_banana' ? NANO_BANANA_DEFAULT_IMAGE_MODEL : '例如 gpt-image-1 或渠道指定模型名'} /></label>}        {form.kind === 'comfyui' && <div className="space-y-2 rounded-md border border-slate-200 p-3 text-xs dark:border-slate-700">
          <p className="font-medium text-slate-800 dark:text-slate-100">透传访问控制（可选）</p>
          <p className="text-[10px] text-slate-600 dark:text-slate-400">原生 ComfyUI 不需要 Key 或模型名；若你使用带鉴权或模型锁的反向代理，可在此透传 Bearer Key 与模型标识。</p>
          <select className="input-field" value={form.secretId} onChange={(event) => setForm({ ...form, secretId: event.target.value })}><option value="">不透传 Key</option>{apiSecrets.map((secret) => <option key={secret.id} value={secret.id}>{secret.name}</option>)}</select>
          <input className="input-field" type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder="直接输入要透传的 Bearer Key（可选）" />
          <input className="input-field" value={form.secretName} onChange={(event) => setForm({ ...form, secretName: event.target.value })} placeholder="新 Key 名称（可选）" />
          <input className="input-field" value={form.imageModel} onChange={(event) => setForm({ ...form, imageModel: event.target.value })} placeholder="透传模型标识（可选）" />
        </div>}
        <label className="block text-xs text-slate-800 dark:text-slate-100">最长等待时间（秒）<input className="input-field mt-1 w-full min-w-0 max-w-full" type="number" min={MIN_IMAGE_REQUEST_TIMEOUT_SECONDS} max={MAX_IMAGE_REQUEST_TIMEOUT_SECONDS} step="1" value={form.requestTimeoutSeconds} onChange={(event) => setForm({ ...form, requestTimeoutSeconds: event.target.value })} /></label>
        <p className="-mt-2 text-[10px] text-slate-600 dark:text-slate-400">默认 720 秒。超时只会停止本机等待，不会自动重新提交生图任务。</p>

        {form.kind === 'comfyui' && <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold text-slate-900 dark:text-slate-100">ComfyUI 工作流与映射</p><p className="mt-1 max-w-xl text-[10px] leading-relaxed text-slate-700 dark:text-slate-300">先导入 ComfyUI 的传参 API JSON；再用 AI 或手动方式，将正负提示词、种子、尺寸等核心字段映射到工作流节点。保存后的“API JSON + 映射文件”会在每次生图时组合为合法 ComfyUI 请求，是简单字段替换，不额外消耗 AI。</p><p className="mt-1 text-[10px] text-slate-600 dark:text-slate-400">工作流：{workflow ? `已导入 ${Object.keys(workflow).length} 个节点` : '未导入'}；映射：{mapping ? `已保存，输出节点 ${mapping.outputNodeId}` : '未保存'}</p></div><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => workflowInputRef.current?.click()}>导入 API 工作流</Button><Button variant="secondary" size="sm" disabled={!workflow} onClick={() => mappingInputRef.current?.click()}>导入映射 JSON</Button>{mapping && <Button variant="secondary" size="sm" onClick={() => downloadJsonFile(mapping, 'comfyui-mapping.json')}>导出映射</Button>}</div></div>
          <input ref={workflowInputRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void importWorkflow(event.target.files?.[0])} />
          <input ref={mappingInputRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void importMapping(event.target.files?.[0])} />
          {workflow && <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/30 space-y-2">
            <div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-medium text-slate-800 dark:text-slate-100">映射打标</p><Button size="sm" loading={mappingBusy} onClick={() => void generateAiMapping()}>AI 生成映射草案</Button></div>
                        <p className="text-[10px] text-slate-600 dark:text-slate-400">AI 使用已勾选的“生图提示词”文字模型并消耗其 API，用节点摘要尝试建立映射草案；草案会先回填到下方，仍由你确认保存。提示词可在高级提示词设置中修改。</p>
            <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2">
              <label className="min-w-0 text-[10px] text-slate-700 dark:text-slate-300">选择正向提示词节点<select className="input-field mt-1 w-full min-w-0 max-w-full" defaultValue="" onChange={(event) => { appendManualPath('positive', event.target.value); event.currentTarget.value = ''; }}><option value="">从可写节点中选择</option>{writableInputs.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}</select></label>
              <label className="min-w-0 text-[10px] text-slate-700 dark:text-slate-300">选择负面提示词节点<select className="input-field mt-1 w-full min-w-0 max-w-full" defaultValue="" onChange={(event) => { appendManualPath('negative', event.target.value); event.currentTarget.value = ''; }}><option value="">从可写节点中选择</option>{writableInputs.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}</select></label>
              <label className="min-w-0 text-[10px] text-slate-700 dark:text-slate-300">选择种子节点<select className="input-field mt-1 w-full min-w-0 max-w-full" defaultValue="" onChange={(event) => { appendManualPath('seed', event.target.value); event.currentTarget.value = ''; }}><option value="">从可写节点中选择</option>{writableInputs.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}</select></label>
              <label className="min-w-0 text-[10px] text-slate-700 dark:text-slate-300">选择宽度节点<select className="input-field mt-1 w-full min-w-0 max-w-full" defaultValue="" onChange={(event) => { appendManualPath('width', event.target.value); event.currentTarget.value = ''; }}><option value="">从可写节点中选择</option>{writableInputs.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}</select></label>
              <label className="min-w-0 text-[10px] text-slate-700 dark:text-slate-300">选择高度节点<select className="input-field mt-1 w-full min-w-0 max-w-full" defaultValue="" onChange={(event) => { appendManualPath('height', event.target.value); event.currentTarget.value = ''; }}><option value="">从可写节点中选择</option>{writableInputs.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}</select></label>
              <label className="min-w-0 text-[10px] text-slate-700 dark:text-slate-300">选择最终输出节点<select className="input-field mt-1 w-full min-w-0 max-w-full" value={manual.outputNodeId} onChange={(event) => setManual({ ...manual, outputNodeId: event.target.value })}><option value="">选择 SaveImage / PreviewImage</option>{outputNodes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2">
              <label className="min-w-0 text-[10px] text-slate-700 dark:text-slate-300">正向提示词路径（必填）<textarea className="input-field mt-1 w-full min-w-0 max-w-full min-h-16 resize-y" value={manual.positive} onChange={(event) => setManual({ ...manual, positive: event.target.value })} placeholder="140.inputs.text" /></label>
              <label className="min-w-0 text-[10px] text-slate-700 dark:text-slate-300">负面提示词路径<textarea className="input-field mt-1 w-full min-w-0 max-w-full min-h-16 resize-y" value={manual.negative} onChange={(event) => setManual({ ...manual, negative: event.target.value })} placeholder="116.inputs.text" /></label>
              <label className="min-w-0 text-[10px] text-slate-700 dark:text-slate-300">随机种子路径<textarea className="input-field mt-1 w-full min-w-0 max-w-full min-h-16 resize-y" value={manual.seed} onChange={(event) => setManual({ ...manual, seed: event.target.value })} /></label>
              <label className="min-w-0 text-[10px] text-slate-700 dark:text-slate-300">宽度路径<textarea className="input-field mt-1 w-full min-w-0 max-w-full min-h-16 resize-y" value={manual.width} onChange={(event) => setManual({ ...manual, width: event.target.value })} /></label>
              <label className="min-w-0 text-[10px] text-slate-700 dark:text-slate-300">高度路径<textarea className="input-field mt-1 w-full min-w-0 max-w-full min-h-16 resize-y" value={manual.height} onChange={(event) => setManual({ ...manual, height: event.target.value })} /></label>
              <label className="min-w-0 text-[10px] text-slate-700 dark:text-slate-300">最终输出节点 ID<input className="input-field mt-1 w-full min-w-0 max-w-full" value={manual.outputNodeId} onChange={(event) => setManual({ ...manual, outputNodeId: event.target.value })} placeholder="例如 139" /></label>
              <label className="min-w-0 text-[10px] text-slate-700 dark:text-slate-300">轮询间隔（毫秒）<input className="input-field mt-1 w-full min-w-0 max-w-full" type="number" min="500" max="10000" value={manual.pollIntervalMs} onChange={(event) => setManual({ ...manual, pollIntervalMs: event.target.value })} /></label>
              <label className="min-w-0 text-[10px] text-slate-700 dark:text-slate-300">静态映射 JSON<textarea className="input-field mt-1 w-full min-w-0 max-w-full min-h-16 resize-y" value={manual.staticJson} onChange={(event) => setManual({ ...manual, staticJson: event.target.value })} placeholder={'{"149.inputs.use_custom_resolution":true}'} /></label>
            </div>
            <div className="flex justify-end"><Button variant="secondary" size="sm" onClick={applyManualMapping}>校验并保存手动映射</Button></div>
          </div>}
        </div>}
        {error && <p className="text-xs text-red-700 dark:text-red-300">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" disabled={mappingBusy} onClick={close}>取消</Button><Button disabled={mappingBusy} onClick={() => void save()}>保存</Button></div>
      </div>
    </Modal>
  </div>;
}