import React, { useEffect, useMemo, useState } from 'react';
import type {
  Character,
  ImageChannel,
  ImageGenerationRecord,
  ImageGenerationTask,
  MessageNode,
  ModelConfig,
  WorldBookEntry,
} from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import {
  extractImagePrompt,
  queryImageWorldBookEntries,
  selectImageHistory,
  sizeForAspectRatio,
} from '../../utils/imageGeneration';

interface Props {
  open: boolean;
  anchor: MessageNode | null;
  nodes: MessageNode[];
  channel: ImageChannel | null;
  promptModel: ModelConfig | null;
  characterA: Character | null;
  characterB: Character | null;
  template: string;
  initial?: ImageGenerationRecord | null;
  task?: ImageGenerationTask | null;
  onClose: () => void;
  onQueue: (generation: ImageGenerationRecord, existingTaskId?: string) => Promise<void>;
  onCancelTask?: (taskId: string) => Promise<void>;
}

const STYLES = ['国风仙侠', '二次元', '真人', '美漫', '自定义'];

const SAFETY_MODE_PROMPT = `安全模式已开启。请在不改变核心剧情、角色身份、动作关系、情绪和场景构图的前提下，先将画面描述改写为适合官方生图渠道的合规版本：所有人物必须明确为成年；删除或替换未成年、幼态、萝莉化、性化、裸露、半透明身体和其他容易触发敏感审核的表达；将相关服装和身体描写改为日常、非性化、完整遮蔽的描述；保留可安全保留的角色外观、道具、氛围、镜头和画风。只输出符合模板要求的正向与反向中文提示词 JSON，不要输出解释。`;
const taskLabels: Record<ImageGenerationTask['status'], string> = {
  queued: '等待后台提交',
  generating: '后台生成中',
  downloading: '正在下载图片',
  retry_wait: '等待自动重试',
  failed: '任务失败，可编辑后重试',
};

export default function ImageGenerateModal({
  open, anchor, nodes, channel, promptModel, characterA, characterB, template, initial, task, onClose, onQueue, onCancelTask,
}: Props) {
  const [phase, setPhase] = useState<'configure' | 'review'>('configure');
  const [hint, setHint] = useState('');
  const [rounds, setRounds] = useState(3);
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '3:4' | '16:9'>('1:1');
  const [style, setStyle] = useState('国风仙侠');
  const [customStyle, setCustomStyle] = useState('');
  const [safeMode, setSafeMode] = useState(false);
  const [positive, setPositive] = useState('');
  const [negative, setNegative] = useState('');
  const [matched, setMatched] = useState<WorldBookEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (initial) {
      setPhase('review');
      setHint(initial.userHint);
      setRounds(initial.scanRounds);
      setAspectRatio(initial.aspectRatio);
      setStyle(initial.style);
      setSafeMode(false);
      setPositive(initial.positivePrompt);
      setNegative(initial.negativePrompt);
      setMatched([]);
      return;
    }
    setPhase('configure');
    setHint('');
    setRounds(3);
    setAspectRatio('1:1');
    setStyle('国风仙侠');
    setCustomStyle('');
    setSafeMode(false);
    setPositive('');
    setNegative('');
    setMatched([]);
  }, [open, initial?.createdAt, task?.id]);

  const effectiveStyle = style === '自定义' ? customStyle.trim() || '自定义' : style;
  const effectiveTemplate = safeMode ? `${template}\n\n${SAFETY_MODE_PROMPT}` : template;
  const history = useMemo(() => anchor ? selectImageHistory(nodes, anchor.id, rounds) : [], [anchor, nodes, rounds]);
  const contextText = history.map((node) => `${node.senderName || node.role}: ${node.content}`).join('\n');
  const characterText = [characterA, characterB].filter((character): character is Character => Boolean(character))
    .map((character) => `【${character.name}】\n${character.systemPrompt}`).join('\n\n');

  const extract = async () => {
    if (!channel || !promptModel) { setError('请先配置并选择生图渠道，再在模型通道中勾选“生图提示词”文字模型。'); return; }
    if (!anchor || !hint.trim()) { setError('请填写核心画面描述。'); return; }
    setLoading(true);
    setError('');
    try {
      const entries = await queryImageWorldBookEntries([characterA, characterB], `${hint}\n${contextText}`);
      const result = await extractImagePrompt({
        model: promptModel,
        template: effectiveTemplate,
        userHint: hint.trim(),
        aspectRatio,
        style: effectiveStyle,
        characterText,
        contextText,
        worldBookEntries: entries,
      });
      setPositive(result.positive);
      setNegative(result.negative);
      setMatched(result.matchedEntries);
      setPhase('review');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '提示词提炼失败。');
    } finally {
      setLoading(false);
    }
  };

  const queue = async () => {
    if (!channel || !anchor || !positive.trim()) { setError('缺少生图渠道、锚点或正向提示词。'); return; }
    setLoading(true);
    setError('');
    try {
      const size = sizeForAspectRatio(aspectRatio);
      await onQueue({
        channelId: channel.id,
        channelName: channel.name,
        anchorMessageId: anchor.id,
        positivePrompt: positive.trim(),
        negativePrompt: negative.trim(),
        size,
        aspectRatio,
        style: effectiveStyle,
        userHint: hint.trim(),
        scanRounds: rounds,
        worldBookEntryIds: matched.map((entry) => entry.id),
        createdAt: Date.now(),
      }, task?.id);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法创建后台生图任务。');
    } finally {
      setLoading(false);
    }
  };

  const cancelTask = async () => {
    if (!task || !onCancelTask) return;
    setLoading(true);
    try {
      await onCancelTask(task.id);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return <Modal open={open} onClose={loading ? () => {} : onClose} title={phase === 'configure' ? '智能生图' : '预览生图提示词'} maxWidth="max-w-2xl">
    <div className="space-y-3">
      {task && <div className={`rounded-md border px-3 py-2 text-xs ${task.status === 'failed' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200' : 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800/60 dark:bg-sky-950/20 dark:text-sky-100'}`}>
        <p className="font-medium">后台任务：{taskLabels[task.status]}{task.attempt > 0 && `（已重试 ${task.attempt}/${task.maxRetries}）`}</p>
        {task.error && <p className="mt-1 break-words opacity-90">{task.error}</p>}
      </div>}
      {phase === 'configure' ? <>
        <label className="block text-xs text-slate-700 dark:text-slate-200">核心画面描述<input autoFocus className="input-field mt-1" value={hint} onChange={(event) => setHint(event.target.value)} placeholder="例如：李道劫正在盘膝打坐，周身青色剑气环绕" /></label>
        <label className="block text-xs text-slate-700 dark:text-slate-200">向上扫描历史轮数：{rounds}<input className="w-full accent-sky-500" type="range" min={1} max={10} value={rounds} onChange={(event) => setRounds(Number(event.target.value))} /></label>
        <div><p className="text-xs text-slate-700 dark:text-slate-200 mb-1">画面比例</p><div className="flex gap-2">{(['1:1', '3:4', '16:9'] as const).map((ratio) => <button key={ratio} type="button" onClick={() => setAspectRatio(ratio)} className={`px-3 py-1 text-xs rounded border ${aspectRatio === ratio ? 'border-sky-500 bg-sky-500/20 text-sky-700 dark:text-sky-200' : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}>{ratio}</button>)}</div></div>
        <div className="flex items-end gap-2">
          <label className="block min-w-0 flex-1 text-xs text-slate-700 dark:text-slate-200">画风<select className="input-field mt-1" value={style} onChange={(event) => setStyle(event.target.value)}>{STYLES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <button type="button" onClick={() => setSafeMode((current) => !current)} className={`shrink-0 rounded-md border px-2.5 py-2 text-xs transition-colors ${safeMode ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 text-slate-700 hover:border-emerald-400 dark:border-slate-700 dark:text-slate-300'}`} title="让提示词组装 AI 将敏感表达改写为适合官方渠道的合规描述">安全模式{safeMode ? '：已开启' : ''}</button>
        </div>
        {style === '自定义' && <input className="input-field" value={customStyle} onChange={(event) => setCustomStyle(event.target.value)} placeholder="填写自定义画风" />}
        <p className="text-[10px] text-slate-600 dark:text-slate-300">本按钮以当前气泡为截止点扫描对话，生成的图片会插入在此气泡之后。命中的角色世界书会提取为外观、道具和场景等视觉事实。</p>
      </> : <>
        <label className="block text-xs text-slate-700 dark:text-slate-200">中文正向提示词<textarea className="input-field mt-1 min-h-32 resize-y" value={positive} onChange={(event) => setPositive(event.target.value)} /></label>
        <label className="block text-xs text-slate-700 dark:text-slate-200">中文反向提示词<textarea className="input-field mt-1 min-h-20 resize-y" value={negative} onChange={(event) => setNegative(event.target.value)} /></label>
        <p className="text-[10px] text-slate-600 dark:text-slate-300">已匹配世界书：{matched.length ? matched.map((entry) => entry.keys[0] || entry.id).join('、') : initial ? '已按原任务保留' : '无'}。确认后任务会转入后台，可继续聊天。</p>
      </>}
      {error && <p className="text-xs text-red-600 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {phase === 'review' && !initial && <Button variant="secondary" disabled={loading} onClick={() => setPhase('configure')}>返回参数</Button>}
        {task && <Button variant="secondary" disabled={loading} onClick={() => void cancelTask()}>{task.status === 'failed' ? '删除失败任务' : '取消后台任务'}</Button>}
        <Button variant="secondary" disabled={loading} onClick={onClose}>取消</Button>
        {phase === 'configure' ? <Button loading={loading} onClick={() => void extract()}>生成提示词</Button> : <Button loading={loading} onClick={() => void queue()}>{task ? '保存并重新生成' : '确认并后台生图'}</Button>}
      </div>
    </div>
  </Modal>;
}