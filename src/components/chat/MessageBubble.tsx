import React, { useState, useRef, useEffect } from 'react';
import type { MessageNode, GalgameData } from '../../types';
import { BUBBLE_COLORS, BUBBLE_ALIGN } from '../../utils/constants';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import MarkdownRenderer from './MarkdownRenderer';
import GalgameCard from './GalgameCard';

function isBase64Image(s: string): boolean {
  return s.startsWith('data:image/') || s.startsWith('http://') || s.startsWith('https://');
}

interface MessageBubbleProps {
  node: MessageNode;
  characterAName: string;
  characterBName: string;
  avatarA: string;
  avatarB: string;
  onBranch?: (nodeId: string) => void;
  onRetry?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onEdit?: (nodeId: string, newContent: string, newScribeText?: string, newGalgameData?: GalgameData) => void;
  debugMode?: boolean;
  onExportPrompt?: (nodeId: string) => void;
  boldColorize?: boolean;
}

function MessageBubble({
  node,
  characterAName,
  characterBName,
  avatarA,
  avatarB,
  onBranch,
  onRetry,
  onDelete,
  onEdit,
  debugMode,
  onExportPrompt,
  boldColorize,
}: MessageBubbleProps) {
  const isUser = node.role === 'user';
  const isSystem = node.role === 'system';
  const isDistilled = node.role === 'distilled';
  const isScribe = node.role === 'scribe';
  const isCharA = node.role === 'charA';
  const isCharB = node.role === 'charB';
  const isAIChar = isCharA || isCharB;

  const [confirmRetry, setConfirmRetry] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(node.content);
  const [editScribeText, setEditScribeText] = useState(node.scribeUpdate?.rawText || '');
  const editRef = useRef<HTMLTextAreaElement>(null);
  const scribeEditRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) {
      setEditContent(node.content);
      setEditScribeText(node.scribeUpdate?.rawText || '');
    }
  }, [node.content, node.scribeUpdate?.rawText, isEditing]);

  if (isDistilled || isScribe) return null;

  const getBubbleShape = () => {
    if (isUser) return 'rounded-2xl rounded-br-sm';
    if (isAIChar) return 'rounded-2xl rounded-bl-sm';
    return 'rounded-2xl';
  };

  let prefix = '';
  let avatarUrl = '';
  let isAvatarImage = false;

  if (isUser) {
    prefix = '👤 你';
  } else if (isCharA) {
    prefix = `💬 ${characterAName || '角色A'}`;
    avatarUrl = avatarA;
    isAvatarImage = isBase64Image(avatarA);
  } else if (isCharB) {
    prefix = `💬 ${characterBName || '角色B'}`;
    avatarUrl = avatarB;
    isAvatarImage = isBase64Image(avatarB);
  } else if (isSystem) {
    prefix = node.content.includes('[记忆结晶]') ? '🧬 记忆结晶' : '⚙️ 系统';
  }

  const renderAvatar = () => {
    if (!avatarUrl || isUser) return null;
    if (isAvatarImage) {
      return (
        <img
          src={avatarUrl}
          alt={prefix}
          className="w-7 h-7 rounded-full object-cover border border-slate-300 dark:border-slate-600 flex-shrink-0"
        />
      );
    }
    return (
      <span className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 flex items-center justify-center text-sm flex-shrink-0">
        {avatarUrl}
      </span>
    );
  };

  const startEdit = () => {
    setEditContent(node.content);
    setEditScribeText(node.scribeUpdate?.rawText || '');
    setIsEditing(true);
  };

  const saveEdit = () => {
    const hasScribe = !!node.scribeUpdate?.isEnabled;
    onEdit?.(node.id, editContent, hasScribe ? editScribeText : undefined, node.galgameData);
    setIsEditing(false);
    setGalgameEditing(false);
  };

  const cancelEdit = () => {
    setEditContent(node.content);
    setEditScribeText(node.scribeUpdate?.rawText || '');
    setIsEditing(false);
  };

  const hasScribeUpdate = isAIChar && node.scribeUpdate?.isEnabled && node.scribeUpdate.rawText?.trim();
  const hasGalgameData = isAIChar && !!node.galgameData;
  const [galgameEditing, setGalgameEditing] = useState(false);

  const align = BUBBLE_ALIGN[node.role] || 'justify-start';
  const color = BUBBLE_COLORS[node.role] || 'bg-slate-700';
  const bubbleShape = getBubbleShape();
  const hasAttachments = (hasScribeUpdate || hasGalgameData) && !isEditing;

  return (
    <>
      <div className={`flex ${align} px-4 py-1.5 group`}>
        <div className={`max-w-[80%] ${isSystem ? 'w-full' : ''} ${isEditing ? 'w-[90%] max-w-[600px]' : ''}`}>
          {/* Sender label with avatar */}
          {!isSystem && (
            <div className={`flex items-center gap-1.5 mb-0.5 ${isUser ? 'flex-row-reverse text-right text-blue-500 dark:text-blue-400' : 'text-left text-slate-500 dark:text-slate-400'}`}>
              {renderAvatar()}
              <span className="text-xs">{prefix}</span>
            </div>
          )}

          {/* Bubble wrapper for card grouping */}
          <div className={`relative ${hasAttachments ? 'rounded-2xl overflow-hidden shadow-sm' : ''}`}>
            {/* Bubble */}
            <div
              className={`relative px-3.5 py-2.5 ${bubbleShape} text-sm leading-relaxed break-words
                ${color} ${isSystem ? 'italic text-center' : ''}`}
            >
              {/* Edit mode */}
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    ref={editRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className={`w-full min-w-[300px] rounded-lg px-2 py-1.5 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-amber-500/50
                      ${isUser
                        ? 'bg-white/15 text-white placeholder-white/60'
                        : 'bg-black/10 dark:bg-black/20 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400'
                      }`}
                    rows={Math.min(12, Math.max(3, editContent.split('\n').length))}
                  />
                  {node.scribeUpdate?.isEnabled && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700/40 rounded-lg p-2 space-y-1">
                      <label className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                        📜 状态书（可篡改）
                      </label>
                      <textarea
                        ref={scribeEditRef}
                        value={editScribeText}
                        onChange={(e) => setEditScribeText(e.target.value)}
                        className="w-full bg-black/10 dark:bg-black/20 text-amber-900 dark:text-amber-100 rounded-lg px-2 py-1.5 text-xs 
                          resize-y focus:outline-none focus:ring-1 focus:ring-amber-500/50 font-mono"
                        rows={Math.min(10, Math.max(3, editScribeText.split('\n').length))}
                      />
                    </div>
                  )}
                  {hasGalgameData && (
                    <GalgameCard
                      data={node.galgameData!}
                      isEditing
                      onEdit={(newData) => {
                        onEdit?.(node.id, editContent, undefined, newData);
                        setGalgameEditing(false);
                      }}
                    />
                  )}
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={cancelEdit}
                      className="px-2 py-0.5 text-xs rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300"
                    >
                      取消
                    </button>
                    <button
                      onClick={saveEdit}
                      className="px-2 py-0.5 text-xs rounded bg-amber-500 hover:bg-amber-400 text-white"
                    >
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <MarkdownRenderer
                  content={node.content}
                  boldColorize={boldColorize}
                  boldRole={isCharA ? 'charA' : isCharB ? 'charB' : undefined}
                />
              )}

              {/* Action buttons — horizontal toolbar on hover */}
              {!isEditing && !isSystem && (
                <div className="absolute -top-3 right-2 flex flex-row gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-150 scale-90 group-hover:scale-100 origin-right">
                  {onBranch && isAIChar && (
                    <button
                      onClick={() => onBranch(node.id)}
                      className="bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-slate-700 text-slate-400 hover:text-amber-500 rounded-full p-1 shadow-sm border border-slate-200 dark:border-slate-700"
                      title="从这里分支"
                    >
                      <Icon name="branch" size={13} />
                    </button>
                  )}
                  {onEdit && (
                    <button
                      onClick={startEdit}
                      className="bg-slate-100 dark:bg-slate-800 hover:bg-blue-100 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-500 rounded-full p-1 shadow-sm border border-slate-200 dark:border-slate-700"
                      title="编辑消息"
                    >
                      <Icon name="edit" size={13} />
                    </button>
                  )}
                  {onRetry && isAIChar && (
                    <button
                      onClick={() => setConfirmRetry(true)}
                      className="bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-slate-700 text-slate-400 hover:text-emerald-500 rounded-full p-1 shadow-sm border border-slate-200 dark:border-slate-700"
                      title="重新生成"
                    >
                      <Icon name="refresh" size={13} />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="bg-slate-100 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-slate-700 text-slate-400 hover:text-red-500 rounded-full p-1 shadow-sm border border-slate-200 dark:border-slate-700"
                      title="删除消息"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 状态书吸附卡片 — 融合在气泡下方 */}
            {hasScribeUpdate && !isEditing && (
              <div className="border-t border-dashed border-amber-300/50 dark:border-amber-700/30 bg-amber-50/60 dark:bg-amber-950/20 px-3.5 py-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">📜 状态书</span>
                  <span className="text-[9px] text-amber-500/60 dark:text-amber-600/50">
                    [{node.scribeUpdate!.mode}]
                  </span>
                </div>
                <div className="text-xs text-amber-800 dark:text-amber-200/80 leading-relaxed font-mono">
                  <MarkdownRenderer content={node.scribeUpdate!.rawText} boldColorize={boldColorize} boldRole="scribe" />
                </div>
              </div>
            )}

            {/* Galgame 数值卡片 */}
            {hasGalgameData && !isEditing && (
              <div className="relative">
                <GalgameCard
                  data={node.galgameData!}
                  isEditing={galgameEditing}
                  onEdit={(newData) => {
                    onEdit?.(node.id, node.content, undefined, newData);
                    setGalgameEditing(false);
                  }}
                />
                {!galgameEditing && (
                  <button
                    onClick={() => setGalgameEditing(true)}
                    className="absolute top-1 right-1 text-[9px] text-slate-400 hover:text-amber-400 bg-white/80 dark:bg-slate-800/80 px-1.5 py-0.5 rounded font-mono"
                  >
                    ✏️
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={`text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 ${isUser ? 'text-right' : 'text-left'}`}>
            {new Date(node.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {isAIChar && node.tokenCost !== undefined && (
              <span className="ml-2 font-mono text-[10px] text-slate-400 dark:text-slate-600 relative group/token cursor-help">
                {/* 默认显示：总 token（输入+输出） */}
                {(() => {
                  const total = node.tokenCostTotal ?? node.tokenCost;
                  const isExact = node.tokenCostIsExact;
                  const icon = isExact ? '✨' : '⚡';
                  const label = isExact ? '' : ' Est.';
                  return <span>{icon}{label} {total?.toLocaleString()} Tokens</span>;
                })()}
                {/* Hover / 长按浮窗：明细 */}
                {(node.tokenCostInput !== undefined || node.tokenCostTotal !== undefined) && (
                  <span className="hidden group-hover/token:block absolute bottom-full left-0 z-50 mb-1 px-2.5 py-1.5 bg-slate-900 dark:bg-slate-800 border border-slate-600/50 rounded-lg shadow-xl whitespace-nowrap text-[10px]">
                    <span className="block text-slate-300">
                      📥 提示词(入): <span className="font-mono text-cyan-400">{(node.tokenCostInput ?? 0).toLocaleString()}</span>
                    </span>
                    <span className="block text-slate-300">
                      📤 回复(出): <span className="font-mono text-emerald-400">{(node.tokenCost ?? 0).toLocaleString()}</span>
                    </span>
                    <span className="block text-slate-300 border-t border-slate-600/30 mt-1 pt-1">
                      🪙 单条总计: <span className="font-mono text-amber-400">{(node.tokenCostTotal ?? node.tokenCost ?? 0).toLocaleString()}</span>
                    </span>
                  </span>
                )}
              </span>
            )}
            {isAIChar && node.scribeTokenCost !== undefined && (
              <span className="ml-2 font-mono text-[10px] text-slate-400 dark:text-slate-600">
                📜 状态书 {node.scribeTokenCost.toLocaleString()} Tokens
              </span>
            )}
            {isUser && node.activatedWorldBookEntries && node.activatedWorldBookEntries.length > 0 && (
              <span className="ml-2">
                激活世界书: {node.activatedWorldBookEntries.map((e) => e.name).join(' \\ ')} · 预估 token {node.tokenEstimate ?? '-'}
              </span>
            )}
            {isUser && (!node.activatedWorldBookEntries || node.activatedWorldBookEntries.length === 0) && node.tokenEstimate !== undefined && (
              <span className="ml-2">预估 token {node.tokenEstimate}</span>
            )}
            {isUser && node.implantedMemory && (
              <span className="ml-2 text-emerald-500 dark:text-emerald-400">🧬 已植入记忆&状态书</span>
            )}
          </div>
          {debugMode && isAIChar && onExportPrompt && (
            <button
              onClick={() => onExportPrompt(node.id)}
              className="mt-1 text-[10px] text-red-400 hover:text-red-300 underline"
            >
              📄 导出发送给该角色的原始 Prompt
            </button>
          )}
        </div>
      </div>

      <Modal open={confirmRetry} onClose={() => setConfirmRetry(false)} title="重新生成">
        <p className="text-sm text-slate-300 mb-4">
          将删除此条 AI 回复并重新发送上一条用户消息，确定继续？
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmRetry(false)}>取消</Button>
          <Button onClick={() => { setConfirmRetry(false); onRetry?.(node.id); }}>
            重新生成
          </Button>
        </div>
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="删除消息">
        <p className="text-sm text-slate-300 mb-4">
          确定要删除这条消息吗？此操作不可撤销。
          {hasScribeUpdate && <span className="block mt-1 text-amber-400">⚠️ 该消息附带状态书，将一并删除。</span>}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>取消</Button>
          <Button className="!bg-red-600 hover:!bg-red-500" onClick={() => { setConfirmDelete(false); onDelete?.(node.id); }}>
            删除
          </Button>
        </div>
      </Modal>
    </>
  );
}

export default React.memo(MessageBubble);
