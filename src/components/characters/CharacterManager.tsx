import React, { useState, useEffect, useRef } from 'react';
import { useCharacters } from '../../hooks/useCharacters';
import { useWorldBooks } from '../../hooks/useWorldBooks';
import { AVATAR_MAX_WIDTH, AVATAR_QUALITY } from '../../utils/constants';
import { importSillyTavernCard, exportToSillyTavernJson } from '../../utils/sillyTavernCard';
import * as Stores from '../../db/stores';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Dropdown from '../ui/Dropdown';
import Icon from '../ui/Icon';

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

export default function CharacterManager() {
  const { characters, loadCharacters, addCharacter, updateCharacter, deleteCharacter } = useCharacters();
  const { worldbooks, loadWorldBooks } = useWorldBooks();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', systemPrompt: '', avatar: '🤖', worldBookId: '' });
  const [uploading, setUploading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<string>('');
  const [exportStatus, setExportStatus] = useState<string>('');

  useEffect(() => { loadCharacters(); loadWorldBooks(); }, [loadCharacters, loadWorldBooks]);

  const openAdd = () => { setEditingId(null); setForm({ name: '', systemPrompt: '', avatar: '🤖', worldBookId: '' }); setShowModal(true); };
  const openEdit = (id: string) => {
    const c = characters.find((x) => x.id === id);
    if (!c) return;
    setEditingId(id);
    setForm({ name: c.name, systemPrompt: c.systemPrompt, avatar: c.avatar, worldBookId: c.worldBookId || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.systemPrompt) return;
    if (editingId) {
      await updateCharacter(editingId, { ...form, worldBookId: form.worldBookId || undefined });
    } else {
      await addCharacter(form.name, form.systemPrompt, form.avatar, form.worldBookId || undefined);
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

  const wbOptions = [{ value: '', label: '无世界书' }, ...worldbooks.map((w) => ({ value: w.id, label: w.name }))];

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

      {/* 导入/导出状态提示 */}
      {(importStatus || exportStatus) && (
        <div className="mb-2 px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs text-slate-300 font-mono">
          {importStatus || exportStatus}
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
            <label className="block text-xs text-slate-400 mb-1">绑定世界书</label>
            <Dropdown options={wbOptions} value={form.worldBookId} onChange={(v) => setForm({ ...form, worldBookId: v })} placeholder="无世界书" />
          </div>
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
    </div>
  );
}
