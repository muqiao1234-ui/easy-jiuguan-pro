import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { StickerUsage } from '../../types';
import { splitStickerContent } from '../../utils/stickers';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** 开启后 <strong> 按角色色系着色 */
  boldColorize?: boolean;
  /** 决定加粗文字的色系：charA=翠绿 / charB=紫罗兰 / scribe=琥珀 / user 不着色 */
  boldRole?: 'charA' | 'charB' | 'scribe' | 'user';
  stickerUsages?: StickerUsage[];
  stickerAssetUrls?: Record<string, string>;
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
function MarkdownRenderer({
  content,
  className = '',
  boldColorize = false,
  boldRole,
  stickerUsages = [],
  stickerAssetUrls = {},
}: MarkdownRendererProps) {
  const extraColor = boldColorize ? boldColorClass(boldRole) : '';
  const segments = splitStickerContent(content, stickerUsages);
  const markdownComponents = {
    p: ({ children }: { children?: React.ReactNode }) => <p className="mb-1 last:mb-0">{children}</p>,
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className={`font-bold ${extraColor}`}>{children}</strong>
    ),
    em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
    ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc list-inside mb-1">{children}</ul>,
    ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal list-inside mb-1">{children}</ol>,
    li: ({ children }: { children?: React.ReactNode }) => <li className="ml-2">{children}</li>,
    code: ({ children }: { children?: React.ReactNode }) => (
      <code className="px-1 py-0.5 rounded bg-black/20 text-xs font-mono">{children}</code>
    ),
    blockquote: ({ children }: { children?: React.ReactNode }) => (
      <blockquote className="border-l-2 border-slate-500 pl-2 italic opacity-80">{children}</blockquote>
    ),
    br: () => <br />,
    hr: () => <hr className="my-2 border-slate-500/30" />,
    a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">
        {children}
      </a>
    ),
    img: ({ src, alt }: { src?: string; alt?: string }) => (
      <img src={src} alt={alt || ''} loading="lazy" className="max-w-full rounded object-contain" />
    ),
  };
  return (
    <div className={`markdown-body ${className}`}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return segment.content
            ? <ReactMarkdown key={`text-${index}`} components={markdownComponents}>{segment.content}</ReactMarkdown>
            : null;
        }
        const assetUrl = stickerAssetUrls[segment.usage.stickerId];
        return assetUrl ? (
          <img
            key={`sticker-${index}-${segment.usage.stickerId}`}
            src={assetUrl}
            alt="表情包"
            loading="lazy"
            className="inline-block align-middle my-1 max-h-40 max-w-[min(220px,70vw)] object-contain"
          />
        ) : null;
      })}
    </div>
  );
}

export default React.memo(MarkdownRenderer);
