import React, { useState, useEffect } from 'react';
import { useWorldBooks } from '../../hooks/useWorldBooks';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Icon from '../ui/Icon';

const AI_GUIDE_PROMPT = `请帮我联网搜索【[请输入你想查询的作品/设定，例如：少女前线]】的核心世界观、重要阵营、关键名词设定。并严格按照以下 JSON 格式输出，不要包含任何 markdown 包裹框或多余解释，只需给出合法的 JSON 数组：[ { "keys": ["关键词1", "别名"], "value": "设定详情描述...", "priority": 5 } ]`;

/* ═══════════════════════════════════════
 *  Easy世界书 + 新手教程 内容
 *  来源: outputs/easy世界书+教程.txt
 * ═══════════════════════════════════════ */
const EASY_GUIDE_TEXT = `📖 Easy酒馆Pro：世界书（Lorebook）新手教学

🧭 第一部分：世界书的底层超能力是什么？
如果把几万字的小说设定、上百个配角名字全部塞进你的角色人设（System Prompt）里，大模型就会"烧糊涂"，不仅 暴吞你的 API Token 让你钱包流血，还会频繁导致 AI 忘词、抢戏或抢人设。

世界书（Lorebook）就是你的"按需记忆检索器"：

实时扫描：当你或 AI 说出特定的"硬字符/关键词"（比如 "十年前的约定" 或 "茉莉星光学院"）时。

瞬间注入：世界书在后台会"叮"的一下被精准触发，把该词条对应的详细描述动态塞进大模型的上下文中。

不用不计费：如果当前对话没提到这些词，它们就老老实实躺在本地，不会每次都调用！

🛡️ 哪些东西适合放进世界书？
次要人物/背景 NPC（如：配角、黑市商人、敌人）

特殊道具/武器/药剂/载具（如：炼神炉、碳化硅雷达、魔剑）

世界观/地理名词/历史事件（如：审判庭、第一次地牢战争、茉莉星光学院）

⚠️ 注意： 核心主 AI 的性格、外貌、和你的亲密关系，千万别放进世界书，请老老实实写在【角色卡人设】里。

⚡ 第二部分：Easy世界书"AI自动蒸馏"懒人神技
以前玩酒馆最痛苦的就是要一条一条手动输入 Key 和 Value，简直像在上班填 Excel。这里准备了一个一键白嫖联网 AI 的终极公式，让你 10 分钟建立一本完美的百万字世界设定书！

🛠️ "3分钟自动蒸馏"保姆级步骤：
第一步：复制下方神奇指令
复制下面这个神奇的【命令框】里所有字：

第二步：调戏联网 AI 生产数据
打开联网APP 之一 【豆包】（找国内小说、二创、游戏设定极灵敏！）或者 【DeepSeek / 智谱】等。把命令里的 [请输入你想查询的作品/设定，例如：魔戒] 替换成你想玩的背景，发送！

第三步：复制 JSON 并一键粘贴
AI 会听话地给你吐出一大串格式整齐的 [{ "keys": ... }] 代码。你完全不需要看懂它，直接全选复制它的回答。回到 Easy酒馆Pro，点击 【新建世界书】 -> 【导入 JSON】，把代码往框里一贴，搞定！

第四步：角色卡关联绑定（超级重要，90%的新人都漏了这步！）
导入书之后，它默认是睡着的。你必须点开你正在聊天的 【角色卡设置】 面板，在里面的 "世界书关联 / Lorebook Link" 下拉菜单中，勾选你刚才导入的这本设定集。
只有绑定了，你的角色和你在聊天时，才能真正享受到这本世界设定书的加持！

🎉 恭喜老爷，你已经完全毕业了！开始导入专属于你的神奇世界啦！`;

type JsonEntry = { keys: string[]; value: string; priority?: number };

export default function WorldBookManager() {
  const { worldbooks, loadWorldBooks, addWorldBook, deleteWorldBook, addEntry, bulkAddEntries, updateEntry, deleteEntry } = useWorldBooks();
  const [showWbModal, setShowWbModal] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [wbName, setWbName] = useState('');
  const [activeWbId, setActiveWbId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState({ keys: '', value: '', priority: '5' });

  // AI 指南弹窗
  const [guideModalOpen, setGuideModalOpen] = useState(false);

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
      {/* ===== Easy世界书 + 新手教程 按钮 ===== */}
      <Button
        variant="secondary"
        className="w-full !bg-amber-900/30 !border-amber-700/40 hover:!bg-amber-900/45 !text-amber-400 font-medium text-sm"
        onClick={() => setGuideModalOpen(true)}
      >
        <Icon name="book" size={15} />
        Easy世界书 + 新手教程
      </Button>

      {/* ===== Easy世界书 + 新手教程 弹窗 ===== */}
      <Modal open={guideModalOpen} onClose={() => setGuideModalOpen(false)} title="📖 Easy世界书 + 新手教程">
        <div className="space-y-3 max-h-[60vh] overflow-y-auto text-sm text-slate-300 leading-relaxed">
          {/* 教程正文 — 保留换行，支持简单 Markdown */}
          {EASY_GUIDE_TEXT.split('\n').map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return <br key={i} />;
            // 粗体标题行（📖🧭⚡🛠️ 开头或 ## 开头）
            if (trimmed.startsWith('📖') || trimmed.startsWith('🧭') || trimmed.startsWith('⚡') || trimmed.startsWith('🛠️') || trimmed.startsWith('🛡️') || trimmed.startsWith('⚠️') || trimmed.startsWith('🎉')) {
              return <h3 key={i} className="text-amber-400 font-semibold text-sm mt-3 mb-1">{trimmed}</h3>;
            }
            return <p key={i} className="text-slate-300">{line}</p>;
          })}
        </div>

        {/* AI 命令快捷复制区 */}
        <div className="mt-4 p-3 bg-slate-900/60 rounded-lg border border-slate-700/50">
          <p className="text-xs text-amber-400 font-semibold mb-2">⚡ 一键复制 AI 生成命令：</p>
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
      </Modal>

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
