import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import type { MessageNode } from '../../types';
import MessageBubble from './MessageBubble';
import DistilledBubble from './DistilledBubble';
import MarkdownRenderer from './MarkdownRenderer';

interface MessageListProps {
  nodes: MessageNode[];
  hasMore: boolean;
  onLoadOlder: () => Promise<void>;
  characterAName: string;
  characterBName: string;
  avatarA: string;
  avatarB: string;
  streamingContent: string;
  streamingTarget: string;
  onBranch: (nodeId: string) => void;
  onRetry: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onEdit: (nodeId: string, newContent: string, newScribeText?: string) => void;
  debugMode?: boolean;
  onExportPrompt?: (nodeId: string) => void;
  boldColorize?: boolean;
}

/** 距底部小于此像素时视为"在底部"，触发自动滚动 */
const SCROLL_THRESHOLD = 80;

export default function MessageList({
  nodes,
  hasMore,
  onLoadOlder,
  characterAName,
  characterBName,
  avatarA,
  avatarB,
  streamingContent,
  streamingTarget,
  onBranch,
  onRetry,
  onDelete,
  onEdit,
  debugMode,
  onExportPrompt,
  boldColorize,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const newestNodeIdRef = useRef<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const checkIfAtBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance <= SCROLL_THRESHOLD;
  }, []);

  const handleScroll = useCallback(() => {
    isAtBottomRef.current = checkIfAtBottom();
  }, [checkIfAtBottom]);

  const smartScrollToBottom = useCallback((behavior: 'smooth' | 'auto' = 'smooth') => {
    if (!isAtBottomRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const newestNodeId = nodes[nodes.length - 1]?.id || null;
    if (newestNodeId !== newestNodeIdRef.current) {
      newestNodeIdRef.current = newestNodeId;
      smartScrollToBottom('smooth');
    }
  }, [nodes, smartScrollToBottom]);

  useEffect(() => {
    if (streamingContent) {
      smartScrollToBottom('auto');
    }
  }, [streamingContent, smartScrollToBottom]);

  const displayNodes = useMemo(() => nodes
    .filter((n) => n.role !== 'system' && n.role !== 'scribe')
    .sort((a, b) => a.timestamp - b.timestamp), [nodes]);

  const handleLoadOlder = async () => {
    const container = containerRef.current;
    const previousHeight = container?.scrollHeight || 0;
    const previousTop = container?.scrollTop || 0;
    setLoadingOlder(true);
    try {
      await onLoadOlder();
      requestAnimationFrame(() => {
        const nextContainer = containerRef.current;
        if (nextContainer) nextContainer.scrollTop = previousTop + nextContainer.scrollHeight - previousHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  const renderNode = (node: MessageNode) => {
    if (node.role === 'distilled') {
      return <DistilledBubble key={node.id} node={node} />;
    }
    // scribe 角色的独立节点不再渲染（已被属性化，吸附在 assistant 气泡上）
    return (
      <MessageBubble
        key={node.id}
        node={node}
        characterAName={characterAName}
        characterBName={characterBName}
        avatarA={avatarA}
        avatarB={avatarB}
        onBranch={onBranch}
        onRetry={onRetry}
        onDelete={onDelete}
        onEdit={onEdit}
        debugMode={debugMode}
        onExportPrompt={onExportPrompt}
        boldColorize={boldColorize}
      />
    );
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto py-2 space-y-0.5"
    >
      {displayNodes.length === 0 && !streamingContent && (
        <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm">
          <div className="text-center">
            <div className="text-4xl mb-3">🍺</div>
            <p>选择一个对话开始吧</p>
            <p className="text-xs mt-1">先创建角色和模型，然后创建新对话</p>
          </div>
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center py-2">
          <button
            onClick={handleLoadOlder}
            disabled={loadingOlder}
            className="text-xs text-slate-500 hover:text-amber-500 disabled:opacity-50 transition-colors"
          >
            {loadingOlder ? '正在加载更早消息...' : '加载更早消息'}
          </button>
        </div>
      )}

      {displayNodes.map((node) => renderNode(node))}

      {/* Streaming placeholder */}
      {streamingContent && (
        <div className="flex justify-start px-4 py-1.5">
          <div className="max-w-[80%]">
            <div className="flex items-center gap-1.5 mb-0.5 text-left text-slate-500 dark:text-slate-400">
              {streamingTarget === 'charA' ? (
                isBase64(avatarA) ? (
                  <img src={avatarA} alt="" className="w-7 h-7 rounded-full object-cover border border-slate-300 dark:border-slate-600" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 flex items-center justify-center text-sm">{avatarA || '🤖'}</span>
                )
              ) : (
                isBase64(avatarB) ? (
                  <img src={avatarB} alt="" className="w-7 h-7 rounded-full object-cover border border-slate-300 dark:border-slate-600" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 flex items-center justify-center text-sm">{avatarB || '🤖'}</span>
                )
              )}
              <span className="text-xs">
                💬 {streamingTarget === 'charA' ? characterAName : characterBName}
              </span>
            </div>
            <div
              className={`px-3.5 py-2.5 rounded-2xl rounded-bl-sm text-sm leading-relaxed break-words
                ${streamingTarget === 'charA' 
                  ? 'bg-emerald-50/90 dark:bg-emerald-900/40 border border-emerald-200/60 dark:border-emerald-700/30 text-emerald-950 dark:text-emerald-50 shadow-sm backdrop-blur-sm'
                  : 'bg-violet-50/90 dark:bg-violet-900/40 border border-violet-200/60 dark:border-violet-700/30 text-violet-950 dark:text-violet-50 shadow-sm backdrop-blur-sm'}`}
            >
              <MarkdownRenderer
                content={streamingContent}
                boldColorize={boldColorize}
                boldRole={streamingTarget === 'charA' ? 'charA' : streamingTarget === 'charB' ? 'charB' : undefined}
              />
              <span className="inline-block w-2 h-4 bg-slate-400 dark:bg-slate-300 animate-pulse ml-0.5 align-middle" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function isBase64(s: string): boolean {
  return s.startsWith('data:image/');
}
