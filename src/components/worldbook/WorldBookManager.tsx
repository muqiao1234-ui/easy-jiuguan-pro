import React, { useState, useEffect } from 'react';
import { useWorldBooks } from '../../hooks/useWorldBooks';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Icon from '../ui/Icon';

const AI_GUIDE_PROMPT = `请帮我联网搜索【[请输入你想查询的作品/设定，例如：少女前线]】的核心世界观、重要阵营、关键名词设定。并严格按照以下 JSON 格式输出，不要包含任何 markdown 包裹框或多余解释，只需给出合法的 JSON 数组：[ { "keys": ["关键词1", "别名"], "value": "设定详情描述...", "priority": 5 } ]`;

type JsonEntry = { keys: string[]; value: string; priority?: number };

export default function WorldBookManager() {
  const { worldbooks, loadWorldBooks, addWorldBook, deleteWorldBook, addEntry, bulkAddEntries, updateEntry, deleteEntry } = useWorldBooks();
  const [showWbModal, setShowWbModal] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [wbName, setWbName] = useState('');
  const [activeWbId, setActiveWbId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState({ keys: '', value: '', priority: '5' });

  // AI 指南面板展开状态
  const [guideOpen, setGuideOpen] = useState(false);

  // JSON 批量导入 — 按世界书 ID 管理展开状态和文本内容
  const [importOpen, setImportOpen] = useState<Record<string, boolean>>({});
  const [importText, setImportText] = useState<Record<string, string>>({});
  const [importError, setImportError] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState<Record<string, boolean>>({});

  useEffect(() => { loadWorldBooks(); }, [loadWorldBooks]);

  const handleAddWorldBook = async () => {
    if (!wbName.trim()) return;
    await addWorldBook(wbName.trim());
    setWbName('');
    setShowWbModal(false);
  };

  const openAddEntry = (wbId: string) => {
    setActiveWbId(wbId);
    setEditingEntryId(null);
    setEntryForm({ keys: '', value: '', priority: '5' });
    setShowEntryModal(true);
  };

  const openEditEntry = (wbId: string, entryId: string) => {
    const wb = worldbooks.find((w) => w.id === wbId);
    const entry = wb?.entries.find((e) => e.id === entryId);
    if (!entry) return;
    setActiveWbId(wbId);
    setEditingEntryId(entryId);
    setEntryForm({ keys: entry.keys.join(', '), value: entry.value, priority: String(entry.priority) });
    setShowEntryModal(true);
  };

  const handleSaveEntry = async () => {
    if (!activeWbId || !entryForm.keys.trim() || !entryForm.value.trim()) return;
    const keys = entryForm.keys.replace(/，/g, ',').split(',').map((k) => k.trim()).filter(Boolean);
    const priority = parseInt(entryForm.priority) || 5;
    if (editingEntryId) {
      await updateEntry(activeWbId, editingEntryId, { keys, value: entryForm.value, priority });
    } else {
      await addEntry(activeWbId, keys, entryForm.value, priority);
    }
    setShowEntryModal(false);
  };

  /** 复制文本到剪贴板 */
  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_GUIDE_PROMPT);
    } catch {
      // fallback for older browsers
      const el = document.createElement('textarea');
      el.value = AI_GUIDE_PROMPT;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  // 导出成功反馈 — 按世界书 ID 管理
  const [exportMsg, setExportMsg] = useState<Record<string, string>>({});

  /** 批量 JSON 导入 */
  const handleBulkImport = async (wbId: string) => {
    const raw = (importText[wbId] || '').trim();
    if (!raw) {
      setImportError((prev) => ({ ...prev, [wbId]: '请输入 JSON 内容' }));
      return;
    }
    setImportError((prev) => ({ ...prev, [wbId]: '' }));

    let parsed: JsonEntry[];
    try {
      parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('不是数组');
    } catch {
      setImportError((prev) => ({ ...prev, [wbId]: 'JSON 格式错误，请检查'}));
      return;
    }

    // 预处理：过滤无效条目，规范化字段
    const validEntries: { keys: string[]; value: string; priority: number }[] = [];
    let skipped = 0;

    for (const item of parsed) {
      if (!item.keys || !item.value) {
        skipped++;
        continue;
      }
      const keys = Array.isArray(item.keys)
        ? item.keys.map((k) => String(k).trim()).filter(Boolean)
        : [String(item.keys).trim()].filter(Boolean);
      if (keys.length === 0) {
        skipped++;
        continue;
      }
      const priority = typeof item.priority === 'number'
        ? Math.max(1, Math.min(10, Math.floor(item.priority)))
        : 5;
      validEntries.push({ keys, value: String(item.value), priority });
    }

    if (validEntries.length === 0) {
      setImportError((prev) => ({ ...prev, [wbId]: '没有有效的条目可导入' }));
      return;
    }

    setImporting((prev) => ({ ...prev, [wbId]: true }));
    try {
      const added = await bulkAddEntries(wbId, validEntries);
      setImporting((prev) => ({ ...prev, [wbId]: false }));
      setImportText((prev) => ({ ...prev, [wbId]: '' }));

      if (skipped > 0) {
        setImportError((prev) => ({ ...prev, [wbId]: `导入完成: ${added} 条成功, ${skipped} 条跳过` }));
      } else {
        setImportError((prev) => ({ ...prev, [wbId]: `成功导入 ${added} 条` }));
      }
    } catch {
      setImporting((prev) => ({ ...prev, [wbId]: false }));
      setImportError((prev) => ({ ...prev, [wbId]: '导入失败，请重试' }));
    }
  };

  return (
    <div className="space-y-2">
      {/* ===== AI 快速生成指南面板 ===== */}
      <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg overflow-hidden">
        <button
          onClick={() => setGuideOpen(!guideOpen)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors hover:bg-amber-900/10"
        >
          <span className="flex items-center gap-2 text-amber-400 font-medium">
            <Icon name="book" size={15} />
            Easy 世界书 · AI 快速生成指南
          </span>
          <Icon name="chevron" size={14} className={`text-amber-400/60 transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
        </button>

        {guideOpen && (
          <div className="px-3 pb-3 space-y-3 border-t border-amber-700/20 pt-3">
            <p className="text-xs text-slate-400">
              将下方命令复制到豆包 / DeepSeek 等联网 AI，生成标准 JSON 后粘贴导入，无需逐条手写世界书。
            </p>

            <div className="relative">
              <pre className="bg-slate-950/80 text-slate-300 text-xs rounded-lg p-3 pr-10 whitespace-pre-wrap break-words leading-relaxed border border-slate-700/50">
                {AI_GUIDE_PROMPT}
              </pre>
              <button
                onClick={handleCopyPrompt}
                className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors"
              >
                一键复制
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== 世界书列表 ===== */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300">世界书</h3>
        <Button size="sm" onClick={() => setShowWbModal(true)}><Icon name="plus" size={14} /> 新建</Button>
      </div>

      {worldbooks.map((wb) => (
        <div key={wb.id} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-200">
              {wb.name}
              <span className="ml-1.5 text-[10px] text-slate-500">({wb.entries.length} 条)</span>
            </span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => openAddEntry(wb.id)} title="添加条目">
                <Icon name="plus" size={13} />
              </Button>
              <button onClick={() => deleteWorldBook(wb.id)} className="text-slate-500 hover:text-red-400 p-0.5">
                <Icon name="trash" size={13} />
              </button>
            </div>
          </div>

          {/* 条目列表 */}
          {wb.entries.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between py-1 border-t border-slate-700/30 text-xs">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {entry.keys.map((k) => (
                    <span key={k} className="px-1.5 py-0.5 bg-amber-600/20 text-amber-400 rounded text-[10px]">{k}</span>
                  ))}
                  <span className="text-slate-500">优先级:{entry.priority}</span>
                </div>
                <div className="text-slate-400 mt-0.5 truncate">{entry.value}</div>
              </div>
              <div className="flex items-center gap-0.5 ml-1">
                <button onClick={() => openEditEntry(wb.id, entry.id)} className="text-slate-500 hover:text-slate-300"><Icon name="edit" size={11} /></button>
                <button onClick={() => deleteEntry(wb.id, entry.id)} className="text-slate-500 hover:text-red-400"><Icon name="trash" size={11} /></button>
              </div>
            </div>
          ))}

          {/* ===== JSON 批量导入 / 导出 ===== */}
          <div className="mt-2 border-t border-slate-700/30 pt-2 flex items-center gap-3">
            <button
              onClick={() => setImportOpen((prev) => ({ ...prev, [wb.id]: !prev[wb.id] }))}
              className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-amber-400 transition-colors"
            >
              <Icon name="chevron" size={10} className={`transition-transform ${importOpen[wb.id] ? 'rotate-90' : ''}`} />
              <Icon name="send" size={12} />
              粘贴 JSON 批量导入
            </button>

            <button
              onClick={async () => {
                const exportData = wb.entries.map((e) => ({
                  keys: e.keys,
                  value: e.value,
                  priority: e.priority,
                }));
                if (exportData.length === 0) {
                  setExportMsg((prev) => ({ ...prev, [wb.id]: '世界书为空' }));
                  setTimeout(() => setExportMsg((prev) => ({ ...prev, [wb.id]: '' })), 2000);
                  return;
                }
                const json = JSON.stringify(exportData, null, 2);
                try {
                  await navigator.clipboard.writeText(json);
                } catch {
                  const el = document.createElement('textarea');
                  el.value = json;
                  document.body.appendChild(el);
                  el.select();
                  document.execCommand('copy');
                  document.body.removeChild(el);
                }
                setExportMsg((prev) => ({ ...prev, [wb.id]: `已复制 ${exportData.length} 条到剪贴板` }));
                setTimeout(() => setExportMsg((prev) => ({ ...prev, [wb.id]: '' })), 2500);
              }}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-emerald-400 transition-colors ml-2"
              title="导出当前世界书为 JSON 到剪贴板"
            >
              <Icon name="copy" size={11} />
              {exportMsg[wb.id] ? exportMsg[wb.id] : '导出 JSON'}
            </button>
          </div>

            {/* 可折叠导入区跟在上面的按钮行之后 */}
            {importOpen[wb.id] && (
              <div className="mt-2 space-y-2 border-t border-slate-700/30 pt-2">
                <textarea
                  className="input-field min-h-[100px] text-xs font-mono"
                  value={importText[wb.id] || ''}
                  onChange={(e) => setImportText((prev) => ({ ...prev, [wb.id]: e.target.value }))}
                  placeholder={`粘贴 AI 生成的 JSON 数组，例如：\n[\n  { "keys": ["关键词"], "value": "设定内容", "priority": 5 }\n]`}
                />
                <div className="flex items-center justify-between gap-2">
                  {importError[wb.id] && (
                    <span className={`text-[11px] ${importError[wb.id].startsWith('导入完成') || importError[wb.id].startsWith('成功') ? 'text-emerald-400' : 'text-red-400'}`}>
                      {importError[wb.id]}
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleBulkImport(wb.id)}
                    disabled={importing[wb.id]}
                  >
                    {importing[wb.id] ? '导入中...' : '导入'}
                  </Button>
                </div>
              </div>
            )}
        </div>
      ))}

      {/* New WorldBook Modal */}
      <Modal open={showWbModal} onClose={() => setShowWbModal(false)} title="新建世界书">
        <div className="space-y-3">
          <input className="input-field" value={wbName} onChange={(e) => setWbName(e.target.value)} placeholder="世界书名称" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowWbModal(false)}>取消</Button>
            <Button onClick={handleAddWorldBook}>创建</Button>
          </div>
        </div>
      </Modal>

      {/* Entry Modal */}
      <Modal open={showEntryModal} onClose={() => setShowEntryModal(false)} title={editingEntryId ? '编辑条目' : '添加条目'}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">触发关键词（逗号或中文逗号分隔）</label>
            <input className="input-field" value={entryForm.keys} onChange={(e) => setEntryForm({ ...entryForm, keys: e.target.value })} placeholder="关键词1，关键词2，别名" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">注入内容</label>
            <textarea className="input-field min-h-[80px]" value={entryForm.value} onChange={(e) => setEntryForm({ ...entryForm, value: e.target.value })} placeholder="匹配时注入的世界设定文本..." />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">优先级 (1-10)</label>
            <input className="input-field" type="number" min={1} max={10} value={entryForm.priority} onChange={(e) => setEntryForm({ ...entryForm, priority: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowEntryModal(false)}>取消</Button>
            <Button onClick={handleSaveEntry}>{editingEntryId ? '保存' : '添加'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
