import React, { useState } from 'react';
import type { Conversation, Character } from '../../types';
import * as Stores from '../../db/stores';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Dropdown from '../ui/Dropdown';
import Icon from '../ui/Icon';

interface ConversationListProps {
  conversations: Conversation[];
  characters: Character[];
  currentConversation: Conversation | null;
  onCreateConversation: (title: string, characterAId: string, characterBId: string) => Promise<Conversation>;
  onDeleteConversation: (id: string) => Promise<void>;
  onSelectConversation: (id: string) => void;
}

export default function ConversationList({
  conversations,
  characters,
  currentConversation,
  onCreateConversation,
  onDeleteConversation,
  onSelectConversation,
}: ConversationListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [charAId, setCharAId] = useState('');
  const [charBId, setCharBId] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim() || !charAId || !charBId) return;
    await onCreateConversation(title.trim(), charAId, charBId);
    setTitle('');
    setShowCreateModal(false);
  };

  /**
   * 导出对话为 TXT 文件（兼容移动端）
   */
  const handleExportTxt = async (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    const charA = characters.find((c) => c.id === conv.characterAId);
    const charB = characters.find((c) => c.id === conv.characterBId);

    const nodes = await Stores.getMessageNodesByConversation(conv.id);
    const sorted = [...nodes].sort((a, b) => a.timestamp - b.timestamp);

    let text = `${conv.title}\n`;
    text += `${'─'.repeat(40)}\n`;
    text += `角色A: ${charA?.name || '未设置'}   角色B: ${charB?.name || '未设置'}\n`;
    text += `${'─'.repeat(40)}\n\n`;

    for (const n of sorted) {
      if (n.role === 'distilled') {
        text += `\n[记忆结晶] ${n.content}\n\n`;
      } else if (n.role === 'user') {
        text += `你: ${n.content}\n\n`;
      } else if (n.role === 'system') {
        // skip initial system node
      } else {
        text += `${n.senderName}: ${n.content}\n\n`;
      }
    }

    const filename = `${conv.title.replace(/[\/:*?"<>|]/g, '_')}.txt`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });

    // 优先使用原生分享（移动端更可靠）
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], filename, { type: 'text/plain;charset=utf-8' });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: conv.title });
          return;
        } catch {
          // 用户取消或分享失败，回退到 blob 下载
        }
      }
    }

    // 回退方案：blob 下载（桌面端标准方式）
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 延迟回收避免移动端竞态
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const charOptions = characters.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300">对话列表</h3>
        <Button size="sm" onClick={() => { setShowCreateModal(true); setTitle(''); setCharAId(''); setCharBId(''); }}>
          <Icon name="plus" size={14} /> 新建
        </Button>
      </div>

      {conversations.map((conv) => {
        const charA = characters.find((c) => c.id === conv.characterAId);
        const charB = characters.find((c) => c.id === conv.characterBId);
        const sub = [charA?.name, charB?.name].filter(Boolean).join(' & ') || '未设置角色';

        return (
          <div
            key={conv.id}
            className={`group relative w-full text-left p-3 rounded-lg transition-colors border cursor-pointer
              ${currentConversation?.id === conv.id
                ? 'bg-amber-600/10 border-amber-600/30 text-amber-300'
                : 'bg-slate-800/30 border-transparent hover:bg-slate-800/50 text-slate-300'
              }`}
            onClick={() => onSelectConversation(conv.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate block">{conv.title}</span>
                <span className="text-[10px] text-slate-500 truncate block">{sub}</span>
              </div>

              {/* Action buttons — visible on hover */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">
                <button
                  onClick={(e) => handleExportTxt(conv, e)}
                  className="text-slate-500 hover:text-emerald-400 p-1 rounded transition-colors"
                  title="导出为 TXT"
                >
                  <Icon name="send" size={13} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(conv.id); }}
                  className="text-slate-500 hover:text-red-400 p-1 rounded transition-colors"
                  title="删除对话"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {conversations.length === 0 && (
        <div className="text-center py-6 text-slate-500 text-xs">暂无对话，点击"新建"开始</div>
      )}

      {/* Create Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="新建对话">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">对话标题</label>
            <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：酒馆夜谈" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">角色 A</label>
            <Dropdown options={charOptions} value={charAId} onChange={setCharAId} placeholder="选择角色A" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">角色 B</label>
            <Dropdown options={charOptions} value={charBId} onChange={setCharBId} placeholder="选择角色B" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>取消</Button>
            <Button onClick={handleCreate}>创建</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)} title="删除对话">
        <p className="text-sm text-slate-300 mb-4">
          确定要删除这个对话吗？所有关联消息将被永久移除，无法恢复。
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>取消</Button>
          <Button
            onClick={async () => {
              if (deleteConfirmId) {
                await onDeleteConversation(deleteConfirmId);
                setDeleteConfirmId(null);
              }
            }}
            className="!bg-red-600 hover:!bg-red-500"
          >
            删除
          </Button>
        </div>
      </Modal>
    </div>
  );
}
