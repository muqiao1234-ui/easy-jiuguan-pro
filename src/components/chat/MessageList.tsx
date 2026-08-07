import React, { useRef, useEffect, useLayoutEffect, useCallback, useMemo, useState } from 'react';
import type { MessageNode, StickerPack, GalgameData, ModuleRpgData } from '../../types';
import MessageBubble from './MessageBubble';
import ImageBubble from './ImageBubble';
import DistilledBubble from './DistilledBubble';
import MarkdownRenderer from './MarkdownRenderer';
import { parseStickerResponse } from '../../utils/stickers';

const sessionScrollPositions = new Map<string, number>();
const JUMP_CONTROL_SCROLLBAR_GAP = 10;

interface MessageListProps {
  conversationId: string | null;
  loadedConversationId: string | null;
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
  onCopySend: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onEdit: (nodeId: string, newContent: string, newScribeText?: string, newGalgameData?: GalgameData, newModuleRpgData?: ModuleRpgData) => void;
  debugMode?: boolean;
  onExportPrompt?: (nodeId: string) => void;
  onExportResponse?: (nodeId: string) => void;
  onGenerateImage?: (nodeId: string) => void;
  onRegenerateImage?: (node: MessageNode) => void;
  boldColorize?: boolean;
  stickerEnabled: boolean;
  stickerAssetUrls: Record<string, string>;
  streamingStickerPack: StickerPack | null;
  stickerMaxCount: number;
}

/** 距底部小于此像素时视为"在底部"，触发自动滚动 */
const SCROLL_THRESHOLD = 80;

export default function MessageList({
  conversationId,
  loadedConversationId,
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
  onCopySend,
  onDelete,
  onEdit,
  debugMode,
  onExportPrompt,
  onExportResponse,
  onGenerateImage,
  onRegenerateImage,
  boldColorize,
  stickerEnabled,
  stickerAssetUrls,
  streamingStickerPack,
  stickerMaxCount,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const newestNodeIdRef = useRef<string | null>(null);
  const scrollPositionsRef = useRef(sessionScrollPositions);
  const pendingRestoreRef = useRef<{ conversationId: string; scrollTop: number } | null>(null);
  const skipAutoScrollForConversationRef = useRef<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [canJump, setCanJump] = useState(false);
  const [jumpControlInset, setJumpControlInset] = useState(16);

  const isLoaded = conversationId !== null && loadedConversationId === conversationId;
  const parsedStreamingContent = useMemo(
    () => parseStickerResponse(streamingContent, streamingStickerPack, stickerMaxCount, true),
    [streamingContent, streamingStickerPack, stickerMaxCount]
  );

  const checkIfAtBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance <= SCROLL_THRESHOLD;
  }, []);

  const handleScroll = useCallback(() => {
    isAtBottomRef.current = checkIfAtBottom();
    const el = containerRef.current;
    if (conversationId && el) {
      scrollPositionsRef.current.set(conversationId, el.scrollTop);
    }
  }, [checkIfAtBottom, conversationId]);

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
      if (skipAutoScrollForConversationRef.current === conversationId) return;
      smartScrollToBottom('smooth');
    }
  }, [conversationId, isLoaded, nodes, smartScrollToBottom]);

  useEffect(() => {
    if (streamingContent && skipAutoScrollForConversationRef.current !== conversationId) {
      smartScrollToBottom('auto');
    }
  }, [conversationId, streamingContent, smartScrollToBottom]);

  // Remember each conversation locally. This keeps a long conversation at the exact
  // place where the reader left it without adding UI-only data to IndexedDB.
  useLayoutEffect(() => {
    const id = conversationId;
    if (!id) return;

    const savedScrollTop = scrollPositionsRef.current.get(id);
    pendingRestoreRef.current = savedScrollTop === undefined
      ? null
      : { conversationId: id, scrollTop: savedScrollTop };
    skipAutoScrollForConversationRef.current = id;
    newestNodeIdRef.current = null;
    isAtBottomRef.current = false;

    return () => {
      const el = containerRef.current;
      if (el) scrollPositionsRef.current.set(id, el.scrollTop);
    };
  }, [conversationId]);

  useLayoutEffect(() => {
    if (!conversationId || !isLoaded) return;

    const pending = pendingRestoreRef.current;
    const frame = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) {
        skipAutoScrollForConversationRef.current = null;
        return;
      }

      if (pending?.conversationId === conversationId) {
        const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
        const scrollTop = Math.min(pending.scrollTop, maxScrollTop);
        el.scrollTop = scrollTop;
        scrollPositionsRef.current.set(conversationId, scrollTop);
        pendingRestoreRef.current = null;
      }
      isAtBottomRef.current = checkIfAtBottom();
      skipAutoScrollForConversationRef.current = null;
    });

    return () => cancelAnimationFrame(frame);
  }, [checkIfAtBottom, conversationId, isLoaded, nodes]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateCanJump = () => {
      setCanJump(el.scrollHeight - el.clientHeight > 8);
      const scrollbarWidth = Math.max(0, el.offsetWidth - el.clientWidth);
      const nextInset = scrollbarWidth + JUMP_CONTROL_SCROLLBAR_GAP;
      setJumpControlInset((current) => current === nextInset ? current : nextInset);
    };
    updateCanJump();
    const observer = new ResizeObserver(updateCanJump);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isLoaded, nodes.length, streamingContent]);

  const displayNodes = useMemo(() => (isLoaded ? nodes : [])
    .filter((n) => n.role !== 'system' && n.role !== 'scribe')
    .sort((a, b) => a.timestamp - b.timestamp), [isLoaded, nodes]);

  const jumpTo = useCallback((percentage: number) => {
    const el = containerRef.current;
    if (!el) return;
    const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    const scrollTop = Math.round(maxScrollTop * percentage);
    el.scrollTo({ top: scrollTop, behavior: 'smooth' });
    if (conversationId) scrollPositionsRef.current.set(conversationId, scrollTop);
    isAtBottomRef.current = percentage === 1;
  }, [conversationId]);

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
    if (node.role === 'image') return <ImageBubble key={node.id} node={node} onDelete={onDelete} onRegenerate={onRegenerateImage} />;
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
        onCopySend={onCopySend}
        onDelete={onDelete}
        onEdit={onEdit}
        debugMode={debugMode}
        onExportPrompt={onExportPrompt}
        onExportResponse={onExportResponse}
        onGenerateImage={onGenerateImage}
        boldColorize={boldColorize}
        stickerEnabled={stickerEnabled}
        stickerAssetUrls={stickerAssetUrls}
      />
    );
  };

  const jumpPoints = [
    { percentage: 0, label: '顶部' },
    { percentage: 0.25, label: '25%' },
    { percentage: 0.5, label: '50%' },
    { percentage: 0.75, label: '75%' },
    { percentage: 1, label: '底部' },
  ];

  return (
    <div className="relative flex-1 min-h-0">
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto py-2 pr-7 space-y-0.5"
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

      {isLoaded && hasMore && (
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
      {isLoaded && streamingContent && (
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
                content={parsedStreamingContent.content}
                boldColorize={boldColorize}
                boldRole={streamingTarget === 'charA' ? 'charA' : streamingTarget === 'charB' ? 'charB' : undefined}
                stickerUsages={stickerEnabled ? parsedStreamingContent.usages : undefined}
                stickerAssetUrls={stickerAssetUrls}
              />
              <span className="inline-block w-2 h-4 bg-slate-400 dark:bg-slate-300 animate-pulse ml-0.5 align-middle" />
            </div>
          </div>
        </div>
      )}
    </div>
    {canJump && isLoaded && (
      <div
        className="pointer-events-none absolute inset-y-5 z-10"
        style={{ right: jumpControlInset }}
      >
        {jumpPoints.map(({ percentage, label }) => (
          <button
            key={label}
            type="button"
            onClick={() => jumpTo(percentage)}
            title={`跳转至${label}`}
            aria-label={`跳转至${label}`}
            className="pointer-events-auto absolute h-5 w-2.5 -translate-y-1/2 rounded-full border border-slate-600/30 bg-slate-500/30 p-0 shadow-sm backdrop-blur-sm transition-all hover:h-6 hover:w-3 hover:border-amber-400/70 hover:bg-amber-500/60 focus-visible:h-6 focus-visible:w-3 focus-visible:border-amber-400 focus-visible:bg-amber-500/60 dark:border-slate-100/20 dark:bg-slate-100/25"
            style={{ top: `${percentage * 100}%` }}
          />
        ))}
      </div>
    )}
    </div>
  );
}

function isBase64(s: string): boolean {
  return s.startsWith('data:image/');
}
