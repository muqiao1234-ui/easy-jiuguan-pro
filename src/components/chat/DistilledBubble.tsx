import React from 'react';
import type { MessageNode } from '../../types';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import MarkdownRenderer from './MarkdownRenderer';

interface DistilledBubbleProps {
  node: MessageNode;
  onInsert?: (nodeId: string) => void;
  onCopy?: (content: string) => void;
}

export default function DistilledBubble({ node, onInsert, onCopy }: DistilledBubbleProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(node.content).catch(() => {});
    onCopy?.(node.content);
  };

  return (
    <div className="flex justify-center px-4 py-2">
      <div className="max-w-[85%] w-full bg-amber-900/20 border border-dashed border-amber-700/50 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-amber-400">💎 记忆结晶</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={handleCopy} title="复制到剪贴板">
              <Icon name="copy" size={13} />
            </Button>
            {onInsert && (
              <Button size="sm" variant="ghost" onClick={() => onInsert(node.id)} title="插入上下文">
                <Icon name="plus" size={13} />
              </Button>
            )}
          </div>
        </div>
        <div className="text-sm text-amber-200/80 leading-relaxed">
          <MarkdownRenderer content={node.content} />
        </div>
      </div>
    </div>
  );
}
