import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** 开启后 <strong> 按角色色系着色 */
  boldColorize?: boolean;
  /** 决定加粗文字的色系：charA=翠绿 / charB=紫罗兰 / scribe=琥珀 / user 不着色 */
  boldRole?: 'charA' | 'charB' | 'scribe' | 'user';
}

/** 根据角色 + 主题模式映射颜色 class。
 *  仅用 -700（浅色）/ -300（深色）两档：
 *  - 浅色背景上 -700 深而沉，避免 -800 过暗融进背景
 *  - 深色背景上 -300 饱和但不刺眼，-400 偏荧光、-200 偏白
 */
function boldColorClass(role?: 'charA' | 'charB' | 'scribe' | 'user'): string {
  switch (role) {
    case 'charA':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'charB':
      return 'text-violet-700 dark:text-violet-300';
    case 'scribe':
      return 'text-amber-700 dark:text-amber-300';
    // user / undefined：不着色，保持原文字色（气泡默认 text-white 或 slate-950）
    default:
      return '';
  }
}

/**
 * 轻量 Markdown 渲染组件。
 * 支持 RP 玩家常用的加粗（动作）、斜体（心理描写）、列表等基础语法。
 */
export default function MarkdownRenderer({
  content,
  className = '',
  boldColorize = false,
  boldRole,
}: MarkdownRendererProps) {
  const extraColor = boldColorize ? boldColorClass(boldRole) : '';
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className={`font-bold ${extraColor}`}>{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc list-inside mb-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-1">{children}</ol>,
          li: ({ children }) => <li className="ml-2">{children}</li>,
          code: ({ children }) => (
            <code className="px-1 py-0.5 rounded bg-black/20 text-xs font-mono">{children}</code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-slate-500 pl-2 italic opacity-80">{children}</blockquote>
          ),
          br: () => <br />,
          hr: () => <hr className="my-2 border-slate-500/30" />,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}