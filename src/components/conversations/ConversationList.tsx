import React, { useMemo, useState } from 'react';
import type { Conversation, ConversationFolder, Character } from '../../types';
import * as Stores from '../../db/stores';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Icon from '../ui/Icon';

interface ConversationListProps {
  conversations: Conversation[];
  folders: ConversationFolder[];
  characters: Character[];
  currentConversation: Conversation | null;
  onCreateConversation: (title: string, characterAId: string, characterBId: string, userName: string, userDescription: string) => Promise<Conversation>;
  onDeleteConversation: (id: string) => Promise<void>;
  onCreateFolder: (name: string) => Promise<ConversationFolder | null>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onSetFolderCollapsed: (id: string, isCollapsed: boolean) => Promise<void>;
  onAddConversationsToFolder: (folderId: string, conversationIds: string[]) => Promise<void>;
  onRemoveConversationFromFolder: (folderId: string, conversationId: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onSelectConversation: (id: string) => void;
}

export default function ConversationList({
  conversations,
  folders,
  characters,
  currentConversation,
  onCreateConversation,
  onDeleteConversation,
  onCreateFolder,
  onRenameFolder,
  onSetFolderCollapsed,
  onAddConversationsToFolder,
  onRemoveConversationFromFolder,
  onDeleteFolder,
  onSelectConversation,
}: ConversationListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [title, setTitle] = useState('');
  const [folderName, setFolderName] = useState('');
  const [charAId, setCharAId] = useState('');
  const [charBId, setCharBId] = useState('');
  const [activeRoleSlot, setActiveRoleSlot] = useState<'A' | 'B'>('A');
  const [userName, setUserName] = useState('');
  const [userDescription, setUserDescription] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteFolderConfirmId, setDeleteFolderConfirmId] = useState<string | null>(null);
  const [manageFolderId, setManageFolderId] = useState<string | null>(null);
  const [manageFolderName, setManageFolderName] = useState('');

  const conversationById = useMemo(
    () => new Map(conversations.map((conv) => [conv.id, conv])),
    [conversations]
  );

  const folderedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const folder of folders) {
      for (const id of folder.conversationIds) ids.add(id);
    }
    return ids;
  }, [folders]);

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.createdAt - b.createdAt),
    [folders]
  );

  const unfiledConversations = useMemo(
    () => conversations.filter((conv) => !folderedIds.has(conv.id)),
    [conversations, folderedIds]
  );

  const managedFolder = manageFolderId ? folders.find((folder) => folder.id === manageFolderId) || null : null;
  const managedConversations = managedFolder
    ? managedFolder.conversationIds
        .map((id) => conversationById.get(id))
        .filter((conv): conv is Conversation => Boolean(conv))
    : [];
  const availableConversations = conversations.filter((conv) => !folderedIds.has(conv.id));

  const selectedCharA = characters.find((character) => character.id === charAId);
  const selectedCharB = characters.find((character) => character.id === charBId);

  const handleCreate = async () => {
    if (!title.trim() || !charAId || !charBId) return;
    await onCreateConversation(title.trim(), charAId, charBId, userName, userDescription);
    setTitle('');
    setUserName('');
    setUserDescription('');
    setShowCreateModal(false);
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    await onCreateFolder(folderName.trim());
    setFolderName('');
    setShowFolderModal(false);
  };

  const handleOpenManageFolder = (folder: ConversationFolder) => {
    setManageFolderId(folder.id);
    setManageFolderName(folder.name);
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

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const conversationSubtitle = (conv: Conversation) => {
    const charA = characters.find((c) => c.id === conv.characterAId);
    const charB = characters.find((c) => c.id === conv.characterBId);
    return [charA?.name, charB?.name].filter(Boolean).join(' & ') || '未设置角色';
  };

  const renderConversationCard = (conv: Conversation) => (
    <div
      key={conv.id}
      className={`group relative w-full text-left p-3 rounded-lg transition-colors border cursor-pointer
        ${currentConversation?.id === conv.id
          ? 'bg-amber-600/10 border-amber-600/30 text-amber-300'
          : 'bg-slate-800/30 border-transparent hover:bg-slate-800/50 text-slate-300'
        }`}
      onClick={() => onSelectConversation(conv.id)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block">{conv.title}</span>
          <span className="text-[10px] text-slate-500 truncate block">{conversationSubtitle(conv)}</span>
        </div>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
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

  const renderFolder = (folder: ConversationFolder) => {
    const folderConversations = folder.conversationIds
      .map((id) => conversationById.get(id))
      .filter((conv): conv is Conversation => Boolean(conv));
    const hasActive = currentConversation ? folder.conversationIds.includes(currentConversation.id) : false;

    return (
      <div key={folder.id} className="space-y-1">
        <div
          className={`group flex items-center gap-1.5 rounded-lg border px-2 py-2 transition-colors
            ${hasActive
              ? 'bg-amber-600/10 border-amber-600/30'
              : 'bg-slate-900/40 border-slate-700/40 hover:border-slate-600'
            }`}
        >
          <button
            onClick={() => onSetFolderCollapsed(folder.id, !folder.isCollapsed)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            title={folder.isCollapsed ? '展开文件夹' : '折叠文件夹'}
          >
            <Icon
              name="chevron"
              size={13}
              className={`text-slate-500 transition-transform ${folder.isCollapsed ? '-rotate-90' : ''}`}
            />
            <Icon name={folder.isCollapsed ? 'folder' : 'folderOpen'} size={15} className="text-amber-400" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-200">{folder.name}</span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{folderConversations.length}</span>
          </button>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); handleOpenManageFolder(folder); }}
              className="rounded p-1 text-slate-500 transition-colors hover:text-amber-300"
              title="管理文件夹"
            >
              <Icon name="edit" size={13} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setDeleteFolderConfirmId(folder.id); }}
              className="rounded p-1 text-slate-500 transition-colors hover:text-red-400"
              title="删除文件夹"
            >
              <Icon name="trash" size={13} />
            </button>
          </div>
        </div>

        {!folder.isCollapsed && (
          <div className="ml-3 space-y-1 border-l border-slate-700/40 pl-2">
            {folderConversations.length > 0 ? (
              folderConversations.map(renderConversationCard)
            ) : (
              <div className="rounded-md border border-dashed border-slate-700/50 px-3 py-2 text-[10px] text-slate-500">
                空文件夹
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2 p-1">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-300">对话列表</h3>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { setShowFolderModal(true); setFolderName(''); }}
            title="新建文件夹"
          >
            <Icon name="folder" size={14} /> 文件夹
          </Button>
          <Button size="sm" onClick={() => { setShowCreateModal(true); setTitle(''); setCharAId(''); setCharBId(''); setUserName(''); setUserDescription(''); setActiveRoleSlot('A'); }}>
            <Icon name="plus" size={14} /> 对话
          </Button>
        </div>
      </div>

      {sortedFolders.map(renderFolder)}

      {(sortedFolders.length > 0 || conversations.length > 0) && (
        <div className="pt-1">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">大队列</span>
            <span className="text-[10px] text-slate-600">{unfiledConversations.length}</span>
          </div>
          <div className="space-y-1">
            {unfiledConversations.length > 0 ? (
              unfiledConversations.map(renderConversationCard)
            ) : (
              <div className="rounded-md border border-dashed border-slate-700/50 px-3 py-2 text-center text-[10px] text-slate-500">
                所有对话都已收纳进文件夹
              </div>
            )}
          </div>
        </div>
      )}

      {conversations.length === 0 && (
        <div className="text-center py-6 text-slate-500 text-xs">暂无对话，点击“对话”开始</div>
      )}

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="新建对话">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">对话标题</label>
            <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：酒馆夜谈" />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">用户名称（替换 {'{{user}}'}）</label>
              <input
                className="input-field"
                value={userName}
                maxLength={64}
                onChange={(event) => setUserName(event.target.value)}
                placeholder="例如：旅行者"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">一句话描述（可选）</label>
              <input
                className="input-field"
                value={userDescription}
                maxLength={240}
                onChange={(event) => setUserDescription(event.target.value)}
                placeholder="例如：来自异乡的炼金术师"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="选择要绑定的角色栏位">
              <button
                type="button"
                onClick={() => setActiveRoleSlot('A')}
                aria-pressed={activeRoleSlot === 'A'}
                className={`min-w-0 rounded-lg border px-3 py-2 text-left transition-colors ${
                  activeRoleSlot === 'A'
                    ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100'
                    : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600'
                }`}
              >
                <span className="block text-[10px] text-emerald-300/80">角色 A</span>
                <span className="mt-0.5 block truncate text-sm font-medium">{selectedCharA?.name || '请选择角色 A'}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveRoleSlot('B')}
                aria-pressed={activeRoleSlot === 'B'}
                className={`min-w-0 rounded-lg border px-3 py-2 text-left transition-colors ${
                  activeRoleSlot === 'B'
                    ? 'border-violet-400 bg-violet-500/15 text-violet-100'
                    : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600'
                }`}
              >
                <span className="block text-[10px] text-violet-300/80">角色 B</span>
                <span className="mt-0.5 block truncate text-sm font-medium">{selectedCharB?.name || '请选择角色 B'}</span>
              </button>
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-slate-400">选择角色 {activeRoleSlot}</label>
              {characters.length > 0 ? (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {characters.map((character) => {
                    const selected = activeRoleSlot === 'A' ? charAId === character.id : charBId === character.id;
                    return (
                      <button
                        key={character.id}
                        type="button"
                        onClick={() => {
                          if (activeRoleSlot === 'A') {
                            setCharAId(character.id);
                            setActiveRoleSlot('B');
                          } else {
                            setCharBId(character.id);
                          }
                        }}
                        className={`flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors ${
                          selected
                            ? activeRoleSlot === 'A'
                              ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100'
                              : 'border-violet-400 bg-violet-500/15 text-violet-100'
                            : 'border-slate-700 bg-slate-800/50 text-slate-200 hover:border-slate-600 hover:bg-slate-800'
                        }`}
                      >
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-600 bg-slate-700 text-sm">
                          {character.avatar?.startsWith('data:image/') ? (
                            <img src={character.avatar} alt="" className="h-full w-full object-cover" />
                          ) : character.avatar}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{character.name}</span>
                        {selected && <span className="text-[10px] font-medium">已选择</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-slate-700 px-3 py-3 text-xs text-slate-500">暂无角色，请先到“角色”页面创建角色卡。</div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={!title.trim() || !charAId || !charBId}>创建</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showFolderModal} onClose={() => setShowFolderModal(false)} title="新建文件夹">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">文件夹名称</label>
            <input className="input-field" value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="例如：长期主线 / 教学 / 已完结" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowFolderModal(false)}>取消</Button>
            <Button onClick={handleCreateFolder}>创建</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!managedFolder}
        onClose={() => setManageFolderId(null)}
        title={`管理文件夹${managedFolder ? ` · ${managedFolder.name}` : ''}`}
        maxWidth="max-w-2xl"
      >
        {managedFolder && (
          <div className="space-y-4">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label className="block text-xs text-slate-400 mb-1">文件夹名称</label>
                <input className="input-field" value={manageFolderName} onChange={(e) => setManageFolderName(e.target.value)} />
              </div>
              <Button size="sm" variant="secondary" onClick={() => onRenameFolder(managedFolder.id, manageFolderName)}>
                保存名称
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-300">已收纳对话</h4>
                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {managedConversations.length > 0 ? managedConversations.map((conv) => (
                    <div key={conv.id} className="flex items-center gap-2 rounded-md bg-slate-800/50 px-2 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs text-slate-200">{conv.title}</div>
                        <div className="truncate text-[10px] text-slate-500">{conversationSubtitle(conv)}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => onRemoveConversationFromFolder(managedFolder.id, conv.id)}>
                        移出
                      </Button>
                    </div>
                  )) : (
                    <div className="rounded-md border border-dashed border-slate-700/50 px-3 py-4 text-center text-xs text-slate-500">
                      还没有收纳对话
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-300">大队列可添加</h4>
                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {availableConversations.length > 0 ? availableConversations.map((conv) => (
                    <div key={conv.id} className="flex items-center gap-2 rounded-md bg-slate-800/50 px-2 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs text-slate-200">{conv.title}</div>
                        <div className="truncate text-[10px] text-slate-500">{conversationSubtitle(conv)}</div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => onAddConversationsToFolder(managedFolder.id, [conv.id])}>
                        添加
                      </Button>
                    </div>
                  )) : (
                    <div className="rounded-md border border-dashed border-slate-700/50 px-3 py-4 text-center text-xs text-slate-500">
                      大队列暂无可添加对话
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

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

      <Modal open={!!deleteFolderConfirmId} onClose={() => setDeleteFolderConfirmId(null)} title="删除文件夹">
        <p className="text-sm text-slate-300 mb-4">
          确定要删除文件夹「{folders.find((folder) => folder.id === deleteFolderConfirmId)?.name || ''}」吗？里面的对话不会被删除，会回到大队列。
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteFolderConfirmId(null)}>取消</Button>
          <Button
            onClick={async () => {
              if (deleteFolderConfirmId) {
                await onDeleteFolder(deleteFolderConfirmId);
                if (manageFolderId === deleteFolderConfirmId) setManageFolderId(null);
                setDeleteFolderConfirmId(null);
              }
            }}
            className="!bg-red-600 hover:!bg-red-500"
          >
            删除文件夹
          </Button>
        </div>
      </Modal>
    </div>
  );
}
