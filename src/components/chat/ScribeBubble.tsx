import React from 'react';
import type { MessageNode } from '../../types';
import MarkdownRenderer from './MarkdownRenderer';

interface ScribeBubbleProps {
  node: MessageNode;
}

/**
 * 状态书气泡 — 类似第三个角色的发言，保留在对话历史中。
 * 每次 AI 状态书总结生成一条新气泡，不再覆盖历史。
 */
export default function ScribeBubble({ node }: ScribeBubbleProps) {
  return (
    <div className="flex justify-center px-4 py-2">
      <div className="max-w-[85%] w-full bg-amber-900/20 border border-amber-700/40 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-xs font-semibold text-amber-400">📜 状态书</span>
          <span className="text-[10px] text-amber-600/60">
            {new Date(node.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="text-sm text-amber-200/80 leading-relaxed">
          <MarkdownRenderer content={node.content} />
        </div>
      </div>
    </div>
  );
}
