import React, { useEffect, useState } from 'react';
import type { MessageNode } from '../../types';
import Icon from '../ui/Icon';

export default function ImageBubble({ node, onDelete, onRegenerate }: {
  node: MessageNode;
  onDelete?: (nodeId: string) => void;
  onRegenerate?: (node: MessageNode) => void;
}) {
  const [url, setUrl] = useState('');
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    const blob = node.imageData?.blob;
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [node.imageData?.blob]);
  if (!node.imageData || !url) return null;
  const download = () => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `easyjiuguanpro-image-${new Date(node.timestamp).toISOString().slice(0, 10)}.${node.imageData!.mimeType.includes('jpeg') ? 'jpg' : 'png'}`;
    link.click();
  };
  return <div className="flex justify-center px-4 py-2 group">
    <div className="w-full max-w-xl overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 shadow-sm">
      <img src={url} alt={node.imageData.generation.userHint || '生成图片'} className="w-full max-h-[70vh] object-contain bg-slate-100 dark:bg-slate-950" />
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
        <span className="min-w-0 truncate text-slate-600 dark:text-slate-300" title={node.imageData.generation.positivePrompt}>🎨 {node.imageData.generation.style} · {node.imageData.generation.aspectRatio}</span>
        <div className="flex items-center gap-1">
          <button title="导出图片" onClick={download} className="p-1 text-slate-500 hover:text-sky-500"><Icon name="copy" size={15} /></button>
          <button title="重新生成" onClick={() => onRegenerate?.(node)} className="p-1 text-slate-500 hover:text-emerald-500"><Icon name="refresh" size={15} /></button>
          <button title="删除图片" onClick={() => setConfirming(true)} className="p-1 text-slate-500 hover:text-red-500"><Icon name="trash" size={15} /></button>
        </div>
      </div>
      {confirming && <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-2 flex items-center justify-between text-xs text-slate-700 dark:text-slate-200"><span>删除这张图片？</span><span className="flex gap-2"><button onClick={() => setConfirming(false)}>取消</button><button className="text-red-600 dark:text-red-300" onClick={() => onDelete?.(node.id)}>删除</button></span></div>}
    </div>
  </div>;
}