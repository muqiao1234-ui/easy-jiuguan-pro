import React, { useState, useRef, useEffect } from 'react';
import type { SendTarget } from '../../types';
import Button from '../ui/Button';
import Icon from '../ui/Icon';

interface ChatInputProps {
  charAId: string | null;
  charBId: string | null;
  charAName: string | null;
  charBName: string | null;
  chatModelId: string | null;
  chatModelName: string | null;
  thinkingEnabled: boolean;
  onToggleThinking: () => void;
  implantMemoryArmed: boolean;
  onToggleImplantMemory: () => void;
  streaming: boolean;
  isDistilling: boolean;
  scribeStreaming: boolean;
  scribeEnabled: boolean;
  onSend: (target: SendTarget, content: string) => void;
  onEavesdrop: () => void;
  onDistill: () => void;
  onStop: () => void;
  onScribeClick: () => void;
  onOpenSelector: () => void;
  onError: (msg: string) => void;
  onMutualObserve: () => void;
  isObserving: boolean;
}

export default function ChatInput({
  charAId,
  charBId,
  charAName,
  charBName,
  chatModelId,
  chatModelName,
  thinkingEnabled,
  onToggleThinking,
  implantMemoryArmed,
  onToggleImplantMemory,
  streaming,
  isDistilling,
  scribeStreaming,
  scribeEnabled,
  onSend,
  onEavesdrop,
  onDistill,
  onStop,
  onScribeClick,
  onOpenSelector,
  onError,
  onMutualObserve,
  isObserving,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!streaming) inputRef.current?.focus();
  }, [streaming]);

  /** 发送前校验 */
  const validateBeforeSend = (type: 'charA' | 'charB'): string | null => {
    if (!chatModelId) return '未选择聊天模型，点击右侧 ⚙️ 按钮设置';
    if (type === 'charA') {
      if (!charAId) return `角色A 未绑定人物卡，点击右侧 ⚙️ 按钮设置`;
    } else {
      if (!charBId) return `角色B 未绑定人物卡，点击右侧 ⚙️ 按钮设置`;
    }
    return null;
  };

  const handleSend = (type: 'charA' | 'charB') => {
    const id = type === 'charA' ? charAId : charBId;
    if (!text.trim() || !id || streaming) return;
    const err = validateBeforeSend(type);
    if (err) {
      onError(err);
      return;
    }
    onSend({ type, characterId: id }, text.trim());
    setText('');
  };

  const handleEavesdrop = () => {
    const err = validateBeforeSend('charB');
    if (err) {
      onError(err);
      return;
    }
    onEavesdrop();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      if (charAId) handleSend('charA');
    }
  };

  // 摘要：角色名 + 模型名
  const summary = [
    charAName || '角色A',
    charBName ? `/${charBName}` : '',
    ' | ',
    chatModelName || '未选模型',
  ].join('');

  return (
    <div className="border-t border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-3 space-y-2 flex-shrink-0">
      {/* 摘要 + 设置按钮 */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onOpenSelector}
          className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-amber-400 transition-colors min-w-0 flex-1"
        >
          <Icon name="users" size={12} className="shrink-0" />
          <span className="truncate">{summary}</span>
        </button>
        <button
          onClick={onOpenSelector}
          className="text-slate-400 hover:text-amber-400 transition-colors shrink-0 p-1 rounded hover:bg-slate-700/50"
          title="角色与模型设置"
        >
          <Icon name="settings" size={15} />
        </button>
      </div>

      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息... (Enter 换行, Shift+Enter 发送给角色A)"
        disabled={streaming}
        rows={2}
        className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 
          placeholder-slate-400 dark:placeholder-slate-500 resize-none focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30
          disabled:opacity-50 transition-colors"
      />

      {/* 主操作栏：发送 + 旁听 + 停止 + 工具箱切换 */}
      <div className="flex items-center gap-2">
        {/* 主操作 */}
        <Button
          onClick={() => handleSend('charA')}
          disabled={!text.trim() || !charAId || streaming}
          loading={streaming}
          size="sm"
        >
          <Icon name="send" size={14} /> 发送A
        </Button>
        <Button
          onClick={() => handleSend('charB')}
          disabled={!text.trim() || !charBId || streaming}
          variant="secondary"
          size="sm"
        >
          <Icon name="send" size={14} /> 发送B
        </Button>
        <Button
          onClick={handleEavesdrop}
          disabled={!charBId || streaming}
          variant="ghost"
          size="sm"
        >
          <Icon name="eavesdrop" size={14} /> 旁听
        </Button>
        {streaming && (
          <Button onClick={onStop} variant="danger" size="sm" title="中断流式传输">
            ⏹ 停止
          </Button>
        )}

        <div className="flex-1" />

        {/* 工具箱折叠按钮 */}
        <button
          onClick={() => setToolsOpen((v) => !v)}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
            ${toolsOpen
              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent'
            }`}
          title="展开/收起工具箱"
        >
          📝 工具
          <span className={`transition-transform duration-200 text-[10px] ${toolsOpen ? 'rotate-180' : ''}`}>
            ▴
          </span>
        </button>
      </div>

      {/* 次级工具栏：折叠展开 */}
      {toolsOpen && (
        <div className="flex items-center gap-2 flex-wrap pt-1 pb-0.5
          border-t border-slate-200/60 dark:border-slate-700/50">
          <Button
            onClick={onToggleThinking}
            variant="ghost"
            size="sm"
            title="启用后发送消息时将附带推理参数（需模型支持）"
            className={thinkingEnabled ? 'text-amber-500 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}
          >
            🧠{thinkingEnabled ? ' 深度思考中' : ' 深度思考'}
          </Button>
          <Button
            onClick={onToggleImplantMemory}
            variant="ghost"
            size="sm"
            title="下一条消息自动植入最近的记忆结晶和状态书"
            className={implantMemoryArmed ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}
            disabled={streaming}
          >
            🧬{implantMemoryArmed ? ' 已准备植入' : ' 植入记忆'}
          </Button>
          {/* 互相认识 + 悬浮提示 */}
          <div className="relative group">
            <Button
              onClick={onMutualObserve}
              disabled={!charAId || !charBId || !chatModelId || streaming || isObserving}
              loading={isObserving}
              variant="ghost"
              size="sm"
              className="text-cyan-500 dark:text-cyan-400"
            >
              🤝 {isObserving ? '观察中...' : '互相认识'}
            </Button>
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block
              bg-slate-800 dark:bg-slate-800 border border-slate-600 dark:border-slate-600 rounded-lg p-2.5 text-[10px] text-slate-300
              whitespace-normal w-64 shadow-xl z-50 leading-relaxed">
              点击后会用主AI分别观察对方角色卡，提取外部可观察特征（外貌、衣着、装备等），
              生成两条世界书条目互相插入到各自的世界书中。
              消耗一定 Token，请勿重复使用该功能。
            </div>
          </div>
          <Button
            onClick={onScribeClick}
            variant="ghost"
            size="sm"
            title="独立状态书设置"
            className={`${scribeEnabled ? 'text-amber-500 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'} ${scribeStreaming ? 'animate-pulse' : ''}`}
          >
            📜 状态书
          </Button>
          <Button
            onClick={onDistill}
            disabled={streaming}
            loading={isDistilling}
            variant="secondary"
            size="sm"
            title="手动触发记忆蒸馏"
          >
            <Icon name="distill" size={14} /> 蒸馏
          </Button>
        </div>
      )}
    </div>
  );
}