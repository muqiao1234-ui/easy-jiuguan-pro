import React, { useState, useEffect, useRef } from 'react';
import { useCharacters } from '../../hooks/useCharacters';
import { useWorldBooks } from '../../hooks/useWorldBooks';
import { useApp } from '../../hooks/useApp';
import { AVATAR_MAX_WIDTH, AVATAR_QUALITY, DEFAULT_TPL_REVERSE_ENGINEER, buildSamplingParams } from '../../utils/constants';
import { importSillyTavernCard, exportToSillyTavernJson } from '../../utils/sillyTavernCard';
import { apiFetch } from '../../utils/apiFetch';
import { CACHE_WORLD_BOOK_LIMIT } from '../../utils/cacheWorldBook';
import * as Stores from '../../db/stores';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Dropdown from '../ui/Dropdown';
import Icon from '../ui/Icon';
import EasyCharacterBuilder from './EasyCharacterBuilder';

/** 将图片 File 压缩为指定宽度的 base64 data URI */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > AVATAR_MAX_WIDTH) {
          height = Math.round((height * AVATAR_MAX_WIDTH) / width);
          width = AVATAR_MAX_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', AVATAR_QUALITY));
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

/** 判断 avatar 是 base64 图片还是 emoji */
function isBase64Image(s: string): boolean {
  return s.startsWith('data:image/');
}

/**
 * 清理逆向 AI 输出的前言/确认语
 * 模型经常输出 "好的，理解了。\n以下是...：\n\n<实际内容>" 这样的格式
 */
function cleanReverseOutput(raw: string): string {
  let text = raw.trim();
  if (!text) return '';

  // 常见前言模式：找到第一个换行后的实际内容
  // "好的，理解了。" / "以下是为您构建的..." / "作为您的..." 等
  const introPatterns = [
    // "好的/理解/收到/明白/没问题/确认" 开头，到第一个换行或冒号后
    /^(好的|理解了|收到|明白|没问题|确认|没问题)[，,。.\s]*.*?(?:[。.]\s*|[:：]\s*|\n)/,
    // "以下是为您..." / "以下是..." 开头
    /^以下是为您.*?(?:[。.]\s*|[:：]\s*|\n)/,
    // "作为您的..." 开头
    /^作为您的.*?(?:[。.]\s*|[:：]\s*|\n)/,
    // "我将..." 开头
    /^我将.*?(?:[。.]\s*|[:：]\s*|\n)/,
    // "这是..." 开头
    /^这是.*?(?:[。.]\s*|[:：]\s*|\n)/,
  ];

  // 尝试移除前言（最多迭代 3 次防止无限循环）
  for (let i = 0; i < 3; i++) {
    const before = text;
    for (const pattern of introPatterns) {
      const match = text.match(pattern);
      if (match) {
        text = text.slice(match[0].length).trim();
        break;
      }
    }
    if (text === before) break;
  }

  // 移除 markdown 代码块包裹
  text = text.replace(/^```(?:\w+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  return text;
}

export default function CharacterManager() {
  const { characters, loadCharacters, addCharacter, updateCharacter, deleteCharacter } = useCharacters();
  const { worldbooks, loadWorldBooks } = useWorldBooks();
  const { state } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', systemPrompt: '', avatar: '🤖', worldBookId: '', cacheWorldBookId: '' });
  const [uploading, setUploading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string>('');
  const [exportStatus, setExportStatus] = useState<string>('');
  const [reverseStatus, setReverseStatus] = useState<string>('');
  const [reverseError, setReverseError] = useState<string>('');

  useEffect(() => { loadCharacters(); loadWorldBooks(); }, [loadCharacters, loadWorldBooks]);

  const openAdd = () => { setEditingId(null); setForm({ name: '', systemPrompt: '', avatar: '🤖', worldBookId: '', cacheWorldBookId: '' }); setReverseError(''); setShowModal(true); };
  const openEdit = (id: string) => {
    const c = characters.find((x) => x.id === id);
    if (!c) return;
    setEditingId(id);
    setForm({
      name: c.name,
      systemPrompt: c.systemPrompt,
      avatar: c.avatar,
      worldBookId: c.worldBookId || '',
      cacheWorldBookId: c.cacheWorldBookId || '',
    });
    setReverseError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.systemPrompt) return;
    const updates = {
      ...form,
      worldBookId: form.worldBookId || undefined,
      cacheWorldBookId: form.cacheWorldBookId || undefined,
    };
    if (editingId) {
      await updateCharacter(editingId, updates);
    } else {
      await addCharacter(
        form.name,
        form.systemPrompt,
        form.avatar,
        form.worldBookId || undefined,
        form.cacheWorldBookId || undefined
      );
    }
    setShowModal(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const dataUri = await compressImage(file);
      setForm({ ...form, avatar: dataUri });
    } catch {
      // 压缩失败保持原样
    } finally {
      setUploading(false);
    }
  };

  // ─── SillyTavern 角色卡导入 ───
  const handleImportCard = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // 允许重复导入同一文件
    setImportStatus('正在解析角色卡...');
    try {
      const result = await importSillyTavernCard(file);

      // 保存世界书（如果有）
      if (result.worldBook) {
        await Stores.addWorldBook(result.worldBook);
        await loadWorldBooks();
      }

      // 保存角色
      await addCharacter(
        result.character.name,
        result.character.systemPrompt,
        result.character.avatar,
        result.character.worldBookId
      );

      const wbInfo = result.worldBookEntryCount > 0
        ? `，并导入了 ${result.worldBookEntryCount} 条世界书词条`
        : '';
      setImportStatus(`✅ 成功导入角色「${result.character.name}」${wbInfo}`);
      setTimeout(() => setImportStatus(''), 5000);
    } catch (err: any) {
      setImportStatus(`❌ 导入失败: ${err.message || err}`);
      setTimeout(() => setImportStatus(''), 5000);
    }
  };

  // ─── SillyTavern 角色卡导出 ───
  const handleExportCard = async (charId: string) => {
    const char = characters.find((c) => c.id === charId);
    if (!char) return;
    setExportStatus(`正在打包「${char.name}」...`);
    try {
      // 获取角色绑定的世界书
      let worldBook = null;
      if (char.worldBookId) {
        worldBook = await Stores.getWorldBookById(char.worldBookId) || null;
      }

      await exportToSillyTavernJson(char, worldBook);

      const wbCount = worldBook?.entries?.length || 0;
      setExportStatus(`✅ 成功将角色「${char.name}」及 ${wbCount} 条世界书打包导出为标准酒馆兼容 JSON！`);
      setTimeout(() => setExportStatus(''), 5000);
    } catch (err: any) {
      setExportStatus(`❌ 导出失败: ${err.message || err}`);
      setTimeout(() => setExportStatus(''), 5000);
    }
  };

  // ─── 高级卡逆向 ───
  const [reverseLoading, setReverseLoading] = useState(false);

  // ─── Easy人物卡模块化组装器 ───
  const [easyBuilderOpen, setEasyBuilderOpen] = useState(false);

  const handleReverseEngineer = async (charId: string) => {
    const char = characters.find((c) => c.id === charId);
    if (!char) return;

    setReverseError('');

    if (!state.currentDistillModelId) {
      setReverseError('❌ 请先在设置中配置蒸馏 AI 模型');
      return;
    }

    // 优先使用编辑表单中尚未保存的 worldBookId，实际反映用户当前选择
    const effectiveWbId = form.worldBookId || char.worldBookId;

    setReverseLoading(true);
    setReverseStatus('');

    try {
      const model = await Stores.getModelById(state.currentDistillModelId);
      if (!model) { setReverseError('❌ 蒸馏模型未找到，请检查设置'); return; }
      if (!model.apiKey) { setReverseError('❌ 蒸馏模型未配置 API Key，请先在模型管理中填写'); return; }

      let worldBookText = '';
      if (effectiveWbId) {
        const wb = await Stores.getWorldBookById(effectiveWbId);
        if (wb && wb.entries.length > 0) {
          worldBookText = wb.entries
            .map((e) => `【${e.keys.join('/')}】\n${e.value}`)
            .join('\n\n---\n\n');
        }
      }

      if (!worldBookText.trim()) {
        throw new Error('❌ 该角色未绑定世界书或世界书为空，无需逆向');
      }

      const promptTemplate = state.tplReverseEngineer || DEFAULT_TPL_REVERSE_ENGINEER;
      // 原始提示词也优先用编辑表单中的值
      const effectiveSystemPrompt = form.systemPrompt || char.systemPrompt || '（空）';
      const prompt = promptTemplate
        .replace('{worldBook}', worldBookText)
        .replace('{originalPrompt}', effectiveSystemPrompt);

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
          ...buildSamplingParams(model.temperature, model.topP),
          // 默认开启思考模式提升逆向智力
          reasoning_effort: 'medium',
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        if (resp.status === 401 || resp.status === 403) {
          throw new Error(`❌ API 鉴权失败 (${resp.status})：请检查 API Key 是否正确`);
        }
        if (resp.status === 429) {
          throw new Error('❌ API 速率限制 (429)：请求过于频繁，请稍后重试或开启低速率模式');
        }
        if (resp.status >= 500) {
          throw new Error(`❌ API 服务端错误 (${resp.status})：${errText.slice(0, 150)}`);
        }
        if (errText.includes('content_policy') || errText.includes('safety') || errText.includes('refuse') || errText.includes('拒绝')) {
          throw new Error('❌ AI 拒绝输出，请调整逆向提示词或更换模型/API');
        }
        throw new Error(`❌ API 错误 (${resp.status})：${errText.slice(0, 200)}`);
      }

      const data = await resp.json();
      // 优先使用 content；reasoning_content 是思维链过程，不应作为主提示词
      let newPrompt = data.choices?.[0]?.message?.content || '';

      if (!newPrompt.trim()) {
        throw new Error('❌ AI 返回空内容，可能模型拒绝了请求，请调整提示词或更换模型/API');
      }

      newPrompt = cleanReverseOutput(newPrompt);

      if (!newPrompt.trim()) {
        throw new Error('❌ 逆向结果清理后为空，请检查提示词或更换模型');
      }

      await updateCharacter(charId, { systemPrompt: newPrompt.trim() });

      if (editingId === charId) {
        setForm((prev) => ({ ...prev, systemPrompt: newPrompt.trim() }));
      }

      setReverseStatus(`✅ 逆向完成！「${char.name}」的主提示词已更新（${newPrompt.length} 字）`);
      setReverseError('');
      setTimeout(() => setReverseStatus(''), 8000);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network') || err?.name === 'TypeError') {
        setReverseError('❌ 网络错误：无法连接到 API 服务，请检查网络或 Base URL 是否正确');
      } else {
        setReverseError(msg);
      }
    } finally {
      setReverseLoading(false);
    }
  };

  const isCacheWorldBook = (wb: { kind?: string; entryLimit?: number; name: string }) =>
    wb.kind === 'cache' || wb.entryLimit === CACHE_WORLD_BOOK_LIMIT || wb.name.includes('缓存世界书');
  const manualWorldBooks = worldbooks.filter((w) => !isCacheWorldBook(w));
  const cacheWorldBooks = worldbooks.filter(isCacheWorldBook);
  const wbOptions = [{ value: '', label: '无世界书' }, ...manualWorldBooks.map((w) => ({ value: w.id, label: w.name }))];
  const cacheWbOptions = [{ value: '', label: '无缓存世界书' }, ...cacheWorldBooks.map((w) => ({ value: w.id, label: `${w.name} (${w.entries.length}/${CACHE_WORLD_BOOK_LIMIT})` }))];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300">角色管理</h3>
        <div className="flex items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".png,.json,image/png,application/json"
            className="hidden"
            onChange={handleImportCard}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => importRef.current?.click()}
            title="导入 SillyTavern 角色卡 (.png / .json)"
          >
            <Icon name="plus" size={14} /> 导入角色卡
          </Button>
          <Button size="sm" onClick={openAdd}><Icon name="plus" size={14} /> 添加</Button>
        </div>
      </div>

      {/* Easy人物卡入口 */}
      <button
        onClick={() => setEasyBuilderOpen(true)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm bg-amber-900/20 border border-amber-700/40 rounded-lg transition-colors hover:bg-amber-900/10"
      >
        <span className="flex items-center gap-2 text-amber-400 font-medium">
          🧩 Easy人物卡 · 模块化组装
        </span>
        <Icon name="chevron" size={14} className="text-amber-400/60" />
      </button>

      {/* 导入/导出/逆向状态提示 */}
      {(importStatus || exportStatus || reverseStatus) && (
        <div className="mb-2 px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs text-slate-300 font-mono">
          {importStatus || exportStatus || reverseStatus}
        </div>
      )}

      {characters.map((c) => (
        <div key={c.id} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {isBase64Image(c.avatar) ? (
                <img src={c.avatar} alt={c.name} className="w-8 h-8 rounded-full object-cover border border-slate-600" />
              ) : (
                <span className="text-xl">{c.avatar}</span>
              )}
              <span className="text-sm font-medium text-slate-200">{c.name}</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => handleExportCard(c.id)} className="text-slate-500 hover:text-amber-400 p-0.5" title="导出为酒馆格式 JSON"><Icon name="branch" size={14} /></button>
              <button onClick={() => openEdit(c.id)} className="text-slate-500 hover:text-slate-300 p-0.5"><Icon name="edit" size={14} /></button>
              <button onClick={() => setDeleteConfirmId(c.id)} className="text-slate-500 hover:text-red-400 p-0.5"><Icon name="trash" size={14} /></button>
            </div>
          </div>
          <div className="text-xs text-slate-500 mt-1 line-clamp-2">{c.systemPrompt}</div>
          {(c.worldBookId || c.cacheWorldBookId) && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
              {c.worldBookId && (
                <span className="px-1.5 py-0.5 rounded bg-amber-600/15 text-amber-400">
                  A世界书: {worldbooks.find((w) => w.id === c.worldBookId)?.name || '已失效'}
                </span>
              )}
              {c.cacheWorldBookId && (
                <span className="px-1.5 py-0.5 rounded bg-cyan-600/15 text-cyan-300">
                  缓存世界书: {worldbooks.find((w) => w.id === c.cacheWorldBookId)?.name || '已失效'}
                </span>
              )}
            </div>
          )}
        </div>
      ))}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? '编辑角色' : '添加角色'}>
        <div className="space-y-3">
          {/* Avatar — placed above system prompt */}
          <div className="flex flex-col items-center gap-2 pb-2">
            <label className="block text-xs text-slate-400 self-start">头像</label>
            <div className="relative">
              {isBase64Image(form.avatar) ? (
                <img src={form.avatar} alt="avatar" className="w-20 h-20 rounded-xl object-cover border-2 border-slate-600 shadow-lg" />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-slate-800 border-2 border-slate-600 flex items-center justify-center text-4xl shadow-lg">
                  {form.avatar || '🤖'}
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 bg-amber-600 hover:bg-amber-500 text-slate-900 rounded-full p-1 shadow transition-colors"
                title="上传本地图片"
                disabled={uploading}
              >
                <Icon name="edit" size={12} />
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="flex items-center gap-2 w-full">
              <input
                className="input-field flex-1 text-center text-lg"
                value={isBase64Image(form.avatar) ? '📷 已上传图片' : form.avatar}
                onChange={(e) => setForm({ ...form, avatar: e.target.value || '🤖' })}
                maxLength={isBase64Image(form.avatar) ? undefined : 2}
                placeholder="emoji"
              />
              {isBase64Image(form.avatar) && (
                <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, avatar: '🤖' })} title="移除图片，使用 emoji">
                  重置
                </Button>
              )}
            </div>
            <span className="text-[10px] text-slate-500">
              可输入 emoji，或点击上图上传本地图片（自动压缩至 {AVATAR_MAX_WIDTH}px）
            </span>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">角色名</label>
            <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="角色名称" />
          </div>

          {/* System Prompt — below avatar */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">System Prompt</label>
            <textarea className="input-field min-h-[120px]" value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} placeholder="角色的系统提示词..." />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">绑定 A 世界书（手动世界书）</label>
            <Dropdown options={wbOptions} value={form.worldBookId} onChange={(v) => setForm({ ...form, worldBookId: v })} placeholder="无世界书" />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">绑定 &lt;缓存世界书&gt;（非必选，最多 {CACHE_WORLD_BOOK_LIMIT} 条）</label>
            <Dropdown
              options={cacheWbOptions}
              value={form.cacheWorldBookId}
              onChange={(v) => setForm({ ...form, cacheWorldBookId: v })}
              placeholder="无缓存世界书"
            />
          </div>

          {/* 高级卡逆向 — 仅编辑模式 + 已绑定世界书时显示 */}
          {editingId && form.worldBookId && (
            <div className="bg-slate-800/60 border-2 border-red-600/50 rounded-lg p-3 space-y-2">
              <h4 className="text-xs font-semibold text-red-400">⚠️ 高级卡逆向</h4>
              <p className="text-[10px] text-red-300 leading-relaxed">
                此功能适用于<strong>主提示词空白、系统和剧情全在世界书里</strong>的高级卡。将使用蒸馏模型将世界书内容逆向串联为主角色提示词。
              </p>
              <ul className="text-[10px] text-red-300 space-y-0.5 list-disc list-inside">
                <li>普通卡<strong>无需使用</strong>，逆向需要花费 Token</li>
                <li>极度建议在一些空白高级卡上使用</li>
                <li>不保证 100% 还原，效率约 <strong>60%-80%</strong></li>
                <li>逆向结果将<strong>覆盖</strong>当前主提示词</li>
              </ul>
              <Button
                className="w-full !bg-red-600 hover:!bg-red-500 !text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleReverseEngineer(editingId!)}
                disabled={reverseLoading}
              >
                {reverseLoading ? '⏳ 正在逆向，请稍等...' : '⚠️ 执行高级卡逆向'}
              </Button>
              {reverseError && (
                <div className="bg-red-900/40 border border-red-500/50 rounded-md p-2">
                  <p className="text-[10px] text-red-300 leading-relaxed">{reverseError}</p>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>取消</Button>
            <Button onClick={handleSave}>{editingId ? '保存' : '添加'}</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="删除角色"
      >
        <p className="text-sm text-slate-300 mb-4">
          确定要删除角色「{characters.find((c) => c.id === deleteConfirmId)?.name || ''}」吗？已绑定该角色的对话将无法正常使用，此操作不可撤销。
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>取消</Button>
          <Button
            className="!bg-red-600 hover:!bg-red-500"
            onClick={async () => {
              if (deleteConfirmId) {
                await deleteCharacter(deleteConfirmId);
                setDeleteConfirmId(null);
              }
            }}
          >
            确认删除
          </Button>
        </div>
      </Modal>

      {/* 逆向加载进度 Modal */}
      <Modal open={reverseLoading} onClose={() => {}} title="⚠️ 高级卡逆向进行中">
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-10 h-10 border-3 border-red-600/30 border-t-red-500 rounded-full animate-spin" />
          <p className="text-sm text-slate-300 text-center">
            正在使用蒸馏模型逆向世界书内容...<br/>
            <span className="text-xs text-slate-500">请勿关闭窗口或重复点击</span>
          </p>
        </div>
      </Modal>

      {/* Easy人物卡模块化组装器 */}
      <EasyCharacterBuilder
        open={easyBuilderOpen}
        onClose={() => setEasyBuilderOpen(false)}
        onSave={(prompt) => {
          // 拼装结果写入当前编辑表单（若编辑弹窗打开）或新建角色
          if (editingId) {
            setForm((prev) => ({ ...prev, systemPrompt: prompt }));
          } else {
            // 未在编辑模式时，打开编辑弹窗并填入
            setForm((prev) => ({ ...prev, systemPrompt: prompt, name: prev.name || '新角色' }));
            setShowModal(true);
          }
        }}
      />
    </div>
  );
}
