import React, { useRef, useState } from 'react';
import { useApp } from '../../hooks/useApp';
import { readFileAsTextRobust } from '../../utils/encoding';
import Toggle from '../ui/Toggle';
import Button from '../ui/Button';
import { processWallpaper } from '../../utils/wallpaper';
import { DONATE_QR_BASE64 } from '../../utils/donateQrBase64';
import {
  DEFAULT_MUTUAL_OBSERVE_PROMPT,
  DEFAULT_TPL_USER_WRAPPER,
  DEFAULT_TPL_OTHER_CHAR_WRAPPER,
  DEFAULT_TPL_IDENTITY_ANCHOR,
  DEFAULT_TPL_WORLD_BOOK_PREFIX,
  DEFAULT_TPL_DISTILLED_PREFIX,
  DEFAULT_TPL_STATE_BOOK_PREFIX,
  DEFAULT_TPL_EAVESDROP_APPEND,
  DEFAULT_TPL_GALGAME_CHAR_INJECTION,
  DEFAULT_TPL_IMPLANT_MEMORY_PREFIX,
  DEFAULT_TPL_IMPLANT_SCRIBE_PREFIX,
  DEFAULT_TPL_DISTILLED_NODE_PREFIX,
  DEFAULT_TPL_REVERSE_ENGINEER,
} from '../../utils/constants';

export default function SettingsPanel() {
  const { state, dispatch } = useApp();
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const [observeOpen, setObserveOpen] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const handleWallpaperUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await processWallpaper(file);
      dispatch({ type: 'SET_WALLPAPER', config: { image: dataUrl } });
    } catch (err) {
      alert(err instanceof Error ? err.message : '壁纸上传失败');
    }
    // 清空 input 允许重复上传同一文件
    if (wallpaperInputRef.current) wallpaperInputRef.current.value = '';
  };

  return (
    <div className="space-y-4 p-1">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">设置</h3>

      {/* 主题与壁纸 */}
      <div className="bg-slate-800/50 rounded-lg p-3 space-y-3 border border-slate-700/50">
        <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">主题与壁纸</h4>

        {/* 主题切换 */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-900 dark:text-slate-100">主题模式</span>
          <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5">
            <button
              onClick={() => dispatch({ type: 'SET_THEME', theme: 'light' })}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                state.theme === 'light' ? 'bg-amber-500 text-white' : 'text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              ☀️ 浅色
            </button>
            <button
              onClick={() => dispatch({ type: 'SET_THEME', theme: 'dark' })}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                state.theme === 'dark' ? 'bg-indigo-500 text-white' : 'text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              🌙 深色
            </button>
          </div>
        </div>

        {/* 加粗变色开关 — 仅影响 AI 气泡内 bold 文字 */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs text-slate-900 dark:text-slate-100">AI 气泡加粗变色</span>
            <p className="text-[10px] text-slate-900 dark:text-slate-100 leading-snug">
              开启后，角色气泡内的加粗文字按各自色系着色（A 翠绿/B 紫罗兰），主题模式自适应。
            </p>
          </div>
          <Toggle
            checked={state.boldColorize}
            onChange={(v) => dispatch({ type: 'SET_BOLD_COLORIZE', enabled: v })}
          />
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="font-bold text-emerald-700 dark:text-emerald-300">角色A 粗体预览</span>
          <span className="font-bold text-violet-700 dark:text-violet-300">角色B 粗体预览</span>
        </div>

        {/* 壁纸上传 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-900 dark:text-slate-100">背景壁纸</span>
            <div className="flex items-center gap-2">
              {state.wallpaper.image && (
                <img src={state.wallpaper.image} alt="wallpaper" className="w-12 h-8 object-cover rounded border border-slate-600" />
              )}
              <Button size="sm" variant="secondary" onClick={() => wallpaperInputRef.current?.click()}>
                上传壁纸
              </Button>
              {state.wallpaper.image && (
                <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'SET_WALLPAPER', config: { image: '' } })}>
                  移除
                </Button>
              )}
              <input
                ref={wallpaperInputRef}
                type="file"
                accept="image/*"
                onChange={handleWallpaperUpload}
                className="hidden"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-900 dark:text-slate-100">上传新壁纸会覆盖旧壁纸。自动压缩至 1920px / JPEG 75%。</p>
        </div>

        {/* 遮罩设置 */}
        {state.wallpaper.image && (
          <div className="space-y-2 pt-1">
            <div>
              <label className="block text-xs text-slate-900 dark:text-slate-100 mb-1">
                遮罩透明度: {Math.round(state.wallpaper.overlayOpacity * 100)}%
              </label>
              <input
                type="range" min={0} max={1} step={0.05}
                value={state.wallpaper.overlayOpacity}
                onChange={(e) => dispatch({ type: 'SET_WALLPAPER', config: { overlayOpacity: parseFloat(e.target.value) } })}
                className="w-full accent-purple-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-900 dark:text-slate-100">遮罩模式</span>
              <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5">
                <button
                  onClick={() => dispatch({ type: 'SET_WALLPAPER', config: { overlayMode: 'light' } })}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    state.wallpaper.overlayMode === 'light' ? 'bg-white text-slate-900' : 'text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  白色遮罩
                </button>
                <button
                  onClick={() => dispatch({ type: 'SET_WALLPAPER', config: { overlayMode: 'dark' } })}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    state.wallpaper.overlayMode === 'dark' ? 'bg-slate-700 text-white' : 'text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  黑灰遮罩
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* API 请求策略 */}
      <div className="bg-slate-800/50 rounded-lg p-3 space-y-3 border border-slate-700/50">
        <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wider">API 请求策略</h4>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs text-slate-900 dark:text-slate-100">🐢 低速率模式</span>
            <p className="text-[10px] text-slate-700 dark:text-slate-300 leading-snug">
              针对有请求速率限制的模型（如 <strong>GLM-4.7-Flash</strong>、GLM-4-Flash、豆包等）请打开此开关，避免 429 错误。开启后同源请求会排队串行，且请求开始间隔 ≥ 2.5 秒，DeepSeek/OpenAI 等不限速模型无需开启。
            </p>
          </div>
          <Toggle
            checked={state.lowRateMode}
            onChange={(v) => dispatch({ type: 'SET_LOW_RATE_MODE', enabled: v })}
          />
        </div>
        <p className="text-[10px] text-slate-700 dark:text-slate-300">
          ℹ️ 429 自动重试始终生效（无论是否开启），收到 429 后自动等待 Retry-After；若服务商未返回该头，则按 3s → 6s → 12s 重试 3 次。
        </p>
      </div>

      {/* Distillation Settings */}
      <div className="bg-slate-800/50 rounded-lg p-3 space-y-3 border border-slate-700/50">
        <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">记忆蒸馏</h4>
        <div>
          <label className="block text-xs text-slate-900 dark:text-slate-100 mb-1">
            触发阈值（轮数）: {state.distillationConfig.triggerThreshold}
          </label>
          <input
            type="range" min={5} max={50} step={5}
            value={state.distillationConfig.triggerThreshold}
            onChange={(e) => dispatch({ type: 'UPDATE_DISTILLATION_CONFIG', config: { triggerThreshold: parseInt(e.target.value) } })}
            className="w-full accent-amber-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-900 dark:text-slate-100 mb-1">
            滑动窗口 · 保留最近: {state.distillationConfig.retainRecentCount} 条
          </label>
          <input
            type="range" min={0} max={15} step={1}
            value={state.distillationConfig.retainRecentCount}
            onChange={(e) => dispatch({ type: 'UPDATE_DISTILLATION_CONFIG', config: { retainRecentCount: parseInt(e.target.value) } })}
            className="w-full accent-amber-500"
          />
          <p className="text-[10px] text-slate-700 dark:text-slate-300 mt-1">
            触发蒸馏时仅浓缩最旧的对话，最近 {state.distillationConfig.retainRecentCount} 条保持原样作为即时上下文。设为 0 则蒸馏全部（旧行为）。
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-900 dark:text-slate-100">自动触发蒸馏</span>
          <Toggle
            checked={state.distillationConfig.autoTrigger}
            onChange={(v) => dispatch({ type: 'UPDATE_DISTILLATION_CONFIG', config: { autoTrigger: v } })}
          />
        </div>
        {/* Custom distillation prompt */}
        <div>
          <label className="block text-xs text-slate-900 dark:text-slate-100 mb-1">
            蒸馏提示词模板（<code className="text-amber-400 bg-slate-900 px-1 rounded">{'{dialogue}'}</code> 会被替换为对话文本）
          </label>
          <textarea
            value={state.distillationConfig.distillationPrompt}
            onChange={(e) =>
              dispatch({
                type: 'UPDATE_DISTILLATION_CONFIG',
                config: { distillationPrompt: e.target.value },
              })
            }
            rows={4}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 
 placeholder-slate-500 resize-none focus:outline-none focus:border-amber-600/50 font-mono"
          />
        </div>
      </div>

      {/* Context Settings */}
      <div className="bg-slate-800/50 rounded-lg p-3 space-y-3 border border-slate-700/50">
        <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider">上下文配置</h4>
        <div>
          <label className="block text-xs text-slate-900 dark:text-slate-100 mb-1">
            最近轮数 (M): {state.contextConfig.recentRounds}
          </label>
          <input
            type="range" min={5} max={50} step={5}
            value={state.contextConfig.recentRounds}
            onChange={(e) => dispatch({ type: 'UPDATE_CONTEXT_CONFIG', config: { recentRounds: parseInt(e.target.value) } })}
            className="w-full accent-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-900 dark:text-slate-100 mb-1">
            最大蒸馏节点数 (N): {state.contextConfig.maxDistilledNodes}
          </label>
          <input
            type="range" min={1} max={15} step={1}
            value={state.contextConfig.maxDistilledNodes}
            onChange={(e) => dispatch({ type: 'UPDATE_CONTEXT_CONFIG', config: { maxDistilledNodes: parseInt(e.target.value) } })}
            className="w-full accent-blue-500"
          />
        </div>
      </div>

      {/* State Book Settings */}
      <div className="bg-slate-800/50 rounded-lg p-3 space-y-3 border border-slate-700/50">
        <h4 className="text-xs font-semibold text-green-400 uppercase tracking-wider">独立状态书</h4>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-900 dark:text-slate-100">启用状态书（吸附到 AI 气泡）</span>
          <Toggle
            checked={state.scribeEnabled}
            onChange={(v) => dispatch({ type: 'SET_SCRIBE_ENABLED', enabled: v })}
          />
        </div>
        {state.scribeEnabled && (
          <>
            {/* 引擎类型选择 */}
            <div className="space-y-1.5">
              <label className="block text-xs text-slate-900 dark:text-slate-100">状态书引擎</label>
              <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5">
                <button
                  onClick={() => dispatch({ type: 'SET_SCRIBE_ENGINE', engine: 'text' })}
                  className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                    state.scribeEngine === 'text' ? 'bg-amber-500 text-white' : 'text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  📜 文本模式
                </button>
                <button
                  onClick={() => dispatch({ type: 'SET_SCRIBE_ENGINE', engine: 'galgame' })}
                  className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                    state.scribeEngine === 'galgame' ? 'bg-purple-600 text-white' : 'text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  🎮 Galgame 数值
                </button>
              </div>
              <p className="text-[10px] text-slate-900 dark:text-slate-100">
                {state.scribeEngine === 'text' && '传统文本状态书，AI 总结后以文本气泡展示'}
                {state.scribeEngine === 'galgame' && '超低消耗数值引擎（每2轮），像素风卡片，非对称注入防AI谄媚'}
              </p>
            </div>

            {/* Galgame Prompt 编辑器 */}
            {state.scribeEngine === 'galgame' && (
              <div className="space-y-1">
                <label className="text-[11px] text-slate-900 dark:text-slate-100">Galgame 引擎 Prompt（可自定义）:</label>
                <textarea
                  value={state.galgamePrompt}
                  onChange={(e) => dispatch({ type: 'SET_GALGAME_PROMPT', prompt: e.target.value })}
                  rows={6}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[10px] text-slate-200 
 placeholder-slate-500 resize-none focus:outline-none focus:border-purple-600/50 font-mono"
                  placeholder="留空使用默认 Galgame 引擎 Prompt..."
                />
              </div>
            )}

            {/* 插入策略模式 */}
            <div className="space-y-1.5">
              <label className="block text-xs text-slate-900 dark:text-slate-100">插入策略模式</label>
              <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5">
                <button
                  onClick={() => dispatch({ type: 'SET_SCRIBE_MODE', mode: 'charA' })}
                  className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                    state.scribeMode === 'charA' ? 'bg-emerald-600 text-white' : 'text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  仅角色A
                </button>
                <button
                  onClick={() => dispatch({ type: 'SET_SCRIBE_MODE', mode: 'charB' })}
                  className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                    state.scribeMode === 'charB' ? 'bg-violet-600 text-white' : 'text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  仅角色B
                </button>
                <button
                  onClick={() => dispatch({ type: 'SET_SCRIBE_MODE', mode: 'auto' })}
                  className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                    state.scribeMode === 'auto' ? 'bg-amber-500 text-white' : 'text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  自动（就近）
                </button>
              </div>
              <p className="text-[10px] text-slate-900 dark:text-slate-100">
                {state.scribeMode === 'charA' && '状态书仅生成并绑定在角色A的回复气泡下'}
                {state.scribeMode === 'charB' && '状态书仅生成并绑定在角色B的回复气泡下'}
                {state.scribeMode === 'auto' && '触发时自动绑定到最新生成的 assistant 消息'}
              </p>
            </div>

            <div>
              <label className="block text-xs text-slate-900 dark:text-slate-100 mb-1">
                AI 总结触发间隔（每 N 轮）: {state.scribeTriggerInterval}
              </label>
              <input
                type="range" min={1} max={20} step={1}
                value={state.scribeTriggerInterval}
                onChange={(e) => dispatch({ type: 'SET_SCRIBE_TRIGGER_INTERVAL', interval: parseInt(e.target.value) })}
                className="w-full accent-green-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-900 dark:text-slate-100 mb-1">
                📝 每次总结的对话轮数: {state.scribeRounds}
              </label>
              <input
                type="range" min={2} max={10} step={1}
                value={state.scribeRounds}
                onChange={(e) => dispatch({ type: 'SET_SCRIBE_ROUNDS', rounds: parseInt(e.target.value) })}
                className="w-full accent-amber-500"
              />
              <p className="text-[10px] text-slate-700 dark:text-slate-300 mt-1">
                控制书记官一次性"看见"多少轮对话，对话拆分为逐轮 user 消息，
                并注入历史状态书格式供 AI 继承。调高可让状态书更像"天意系统"。
              </p>
            </div>
          </>
        )}
      </div>

      {/* Mutual Observe Prompt Settings */}
      <div className="bg-slate-800/50 rounded-lg p-3 space-y-3 border border-slate-700/50">
        <button
          onClick={() => setObserveOpen(!observeOpen)}
          className="flex items-center justify-between w-full"
        >
          <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
            🤝 互相认识 · 观察提示词
          </h4>
          <span className="text-slate-900 dark:text-slate-100 text-xs">{observeOpen ? '▾' : '▸'}</span>
        </button>
        {observeOpen && (
          <div className="space-y-2">
            <p className="text-[10px] text-slate-900 dark:text-slate-100 leading-relaxed">
              点击"互相认识"按钮时，系统会用主AI分别观察对方角色卡，提取外部可观察特征，
              生成两条世界书条目互相插入。<code className="text-cyan-400 bg-slate-900 px-1 rounded">{'{charPrompt}'}</code> 会被替换为对方角色卡的 systemPrompt。
              留空则使用默认提示词。
            </p>
            <textarea
              value={state.mutualObservePrompt}
              onChange={(e) => dispatch({ type: 'SET_MUTUAL_OBSERVE_PROMPT', prompt: e.target.value })}
              rows={8}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-[11px] text-slate-200
 placeholder-slate-500 resize-none focus:outline-none focus:border-cyan-600/50 font-mono leading-relaxed"
              placeholder={DEFAULT_MUTUAL_OBSERVE_PROMPT}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dispatch({ type: 'SET_MUTUAL_OBSERVE_PROMPT', prompt: DEFAULT_MUTUAL_OBSERVE_PROMPT })}
              >
                恢复默认
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dispatch({ type: 'SET_MUTUAL_OBSERVE_PROMPT', prompt: '' })}
              >
                清空
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Data Management */}
      <div className="bg-slate-800/50 rounded-lg p-3 space-y-2 border border-slate-700/50">
        <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">数据管理</h4>
        <p className="text-xs text-slate-900 dark:text-slate-100">所有数据存储在浏览器 IndexedDB 中，不会上传到任何服务器。</p>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={async () => {
            const stores = await import('../../db/stores');
            const [models, chars, convs, nodes, wbs, states] = await Promise.all([
              stores.getAllModels(), stores.getAllCharacters(), stores.getAllConversations(),
              import('../../db/index').then((db) => db.messageNodesStore.getItem('data') || []),
              stores.getAllWorldBooks(),
              import('../../db/index').then((db) => db.globalStatesStore.getItem('data') || []),
            ]);
            // 安全：导出时剔除所有模型的 apiKey，防止意外分享配置文件导致 API Key 泄露。
            const safeModels = (models as any[]).map(({ apiKey, ...rest }) => rest);
            const blob = new Blob([JSON.stringify({ models: safeModels, characters: chars, conversations: convs, message_nodes: nodes, worldbooks: wbs, global_states: states }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'tavern-backup.json'; a.click();
            URL.revokeObjectURL(url);
          }}>导出数据</Button>
          <Button size="sm" variant="secondary" onClick={() => {
            const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (!file) return;
              const text = await readFileAsTextRobust(file);
              try {
                const data = JSON.parse(text);
                const db = await import('../../db/index');
                // 安全：导入时清空所有 apiKey，避免从他人分享的配置中继承密钥。
                // 用户导入后需手动填写各模型的 apiKey。
                if (data.models) {
                  data.models = (data.models as any[]).map((m: any) => ({ ...m, apiKey: '' }));
                  await db.modelsStore.setItem('data', data.models);
                }
                if (data.characters) await db.charactersStore.setItem('data', data.characters);
                if (data.conversations) await db.conversationsStore.setItem('data', data.conversations);
                if (data.message_nodes) await db.messageNodesStore.setItem('data', data.message_nodes);
                if (data.worldbooks) await db.worldbooksStore.setItem('data', data.worldbooks);
                if (data.global_states) await db.globalStatesStore.setItem('data', data.global_states);
                alert('数据导入成功，请刷新页面。');
              } catch { alert('导入失败：无效的 JSON 文件'); }
            };
            input.click();
          }}>导入数据</Button>
        </div>
      </div>
      {/* Advanced Prompt Templates */}
      <div className="bg-slate-800/50 rounded-lg p-3 space-y-3 border border-red-700/30">
        <button
          onClick={() => setAdvOpen(!advOpen)}
          className="flex items-center justify-between w-full"
        >
          <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">
            ⚠️ 高级提示词设置
          </h4>
          <span className="text-slate-900 dark:text-slate-100 text-xs">{advOpen ? '▾' : '▸'}</span>
        </button>
        {!advOpen && (
          <p className="text-[10px] text-slate-900 dark:text-slate-100">
            修改以下提示词模板可能会影响框架行为。点击展开查看和编辑所有预设提示词。
          </p>
        )}
        {advOpen && (
          <div className="space-y-4">
            <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded border border-red-200 dark:border-red-700/30">
              <p className="text-[10px] text-red-700 dark:text-red-300 leading-relaxed">
                ⚠️ <strong>警告</strong>：以下模板控制框架的核心行为（身份隔离、上下文注入、消息包装等）。
                修改可能导致角色混淆、上下文丢失或其他不可预期的问题。
                每个模板都支持占位符（如 <code className="text-red-600 dark:text-red-200 bg-red-100 dark:bg-slate-900 px-1 rounded">{'{content}'}</code>、
                <code className="text-red-600 dark:text-red-200 bg-red-100 dark:bg-slate-900 px-1 rounded">{'{charName}'}</code>），请确保修改后保留必要的占位符。
                留空则使用默认值。
              </p>
            </div>
            {([
              { key: 'tplUserWrapper', label: '用户消息包裹', desc: '包装真实用户输入，用于身份隔离。占位符：{content}', defaultVal: DEFAULT_TPL_USER_WRAPPER, rows: 2 },
              { key: 'tplOtherCharWrapper', label: '对方角色消息包裹', desc: '包装对方角色发言，与用户消息区分。占位符：{otherCharName}, {content}', defaultVal: DEFAULT_TPL_OTHER_CHAR_WRAPPER, rows: 2 },
              { key: 'tplIdentityAnchor', label: '结尾身份锚点', desc: '对话末尾强身份提示，防止角色漂变。占位符：{charName}, {otherCharName}', defaultVal: DEFAULT_TPL_IDENTITY_ANCHOR, rows: 4 },
              { key: 'tplWorldBookPrefix', label: '世界书注入前缀', desc: '世界书条目注入为 system 消息的前缀。占位符：{key}, {value}', defaultVal: DEFAULT_TPL_WORLD_BOOK_PREFIX, rows: 2 },
              { key: 'tplDistilledPrefix', label: '蒸馏摘要注入前缀', desc: '记忆结晶注入为 system 消息的前缀。占位符：{content}', defaultVal: DEFAULT_TPL_DISTILLED_PREFIX, rows: 2 },
              { key: 'tplStateBookPrefix', label: '状态书注入前缀', desc: '状态书内容注入为 system 消息的前缀。占位符：{content}', defaultVal: DEFAULT_TPL_STATE_BOOK_PREFIX, rows: 2 },
              { key: 'tplEavesdropAppend', label: '旁听附加指令', desc: '旁听功能追加到角色 systemPrompt 末尾的指令。无占位符。', defaultVal: DEFAULT_TPL_EAVESDROP_APPEND, rows: 3 },
              { key: 'tplGalgameCharInjection', label: 'Galgame 角色性格注入', desc: '将角色卡 systemPrompt 包装后注入 Galgame 引擎。占位符：{charPrompt}', defaultVal: DEFAULT_TPL_GALGAME_CHAR_INJECTION, rows: 2 },
              { key: 'tplImplantMemoryPrefix', label: '植入记忆结晶前缀', desc: '一次性植入记忆功能中记忆结晶的前缀。占位符：{content}', defaultVal: DEFAULT_TPL_IMPLANT_MEMORY_PREFIX, rows: 2 },
              { key: 'tplImplantScribePrefix', label: '植入状态书前缀', desc: '一次性植入记忆功能中状态书的前缀。占位符：{content}', defaultVal: DEFAULT_TPL_IMPLANT_SCRIBE_PREFIX, rows: 2 },
              { key: 'tplDistilledNodePrefix', label: '蒸馏节点生成格式', desc: '蒸馏完成后生成的 distilled 消息节点格式。占位符：{total}, {summary}', defaultVal: DEFAULT_TPL_DISTILLED_NODE_PREFIX, rows: 2 },
              { key: 'tplReverseEngineer', label: '高级卡逆向提示词', desc: '角色卡逆向功能使用的提示词。将世界书逆向串联为主角色提示词。占位符：{worldBook}, {originalPrompt}', defaultVal: DEFAULT_TPL_REVERSE_ENGINEER, rows: 8 },
            ] as const).map((item) => (
              <div key={item.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-slate-900 dark:text-slate-100 font-medium">{item.label}</label>
                  <button
                    onClick={() => dispatch({ type: 'SET_ADV_TPL', key: item.key, value: '' })}
                    className="text-[10px] text-slate-900 dark:text-slate-100 hover:text-amber-400"
                  >
                    恢复默认
                  </button>
                </div>
                <p className="text-[10px] text-slate-900 dark:text-slate-100 leading-relaxed">{item.desc}</p>
                <textarea
                  value={(state as any)[item.key] as string}
                  onChange={(e) => dispatch({ type: 'SET_ADV_TPL', key: item.key, value: e.target.value })}
                  rows={item.rows}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[10px] text-slate-200
 placeholder-slate-500 resize-none focus:outline-none focus:border-red-600/50 font-mono leading-relaxed"
                  placeholder={item.defaultVal}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Debug */}
      <div className="bg-slate-800/50 rounded-lg p-3 space-y-2 border border-slate-700/50">
        <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider">⚠️ 调试功能</h4>
        <p className="text-[10px] text-slate-900 dark:text-slate-100">以下功能仅供开发调试使用，普通用户无需开启。</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-900 dark:text-slate-100">调试·原始提示词下载</span>
          <Toggle
            checked={state.debugMode}
            onChange={() => dispatch({ type: 'TOGGLE_DEBUG' })}
          />
        </div>
        <p className="text-[10px] text-slate-900 dark:text-slate-100">开启后，AI 回复气泡底部将出现「📄 导出原始 Prompt」按钮，可下载完整 messages 数组。</p>
      </div>

      {/* 使用声明与免责协议 */}
      <div className="bg-slate-800/50 rounded-lg p-3 space-y-3 border border-slate-700/50">
        <button
          onClick={() => setAboutOpen(!aboutOpen)}
          className="flex items-center justify-between w-full"
        >
          <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            📜 使用声明与免责协议
          </h4>
          <span className="text-slate-900 dark:text-slate-100 text-xs">{aboutOpen ? '▾' : '▸'}</span>
        </button>
        {!aboutOpen && (
          <p className="text-[10px] text-slate-900 dark:text-slate-100">
            点击展开查看完整使用声明、版权免责、第三方服务与 Token 消耗相关条款，以及作者捐赠通道。
          </p>
        )}
        {aboutOpen && (
          <div className="space-y-3 text-[11px] text-slate-900 dark:text-slate-100 leading-relaxed">
            <p className="text-xs text-slate-900 dark:text-slate-100">
              本项目遵循以下原则开源，旨在为 AI 角色扮演爱好者提供一个自由、纯粹的工具：
            </p>

            <div className="space-y-2">
              <h5 className="text-[11px] font-semibold text-amber-400">【第一部分：开源分发与反篡改协议】</h5>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-900 dark:text-slate-100">
                <li>
                  <span className="font-medium text-slate-900 dark:text-slate-100">免费派发原则</span>：在完整保留原作者署名信息、B站官方渠道说明、以及捐赠补给通道的前提下，任何人均可免费下载、体验本单文件程序。
                </li>
                <li>
                  <span className="font-medium text-slate-900 dark:text-slate-100">绝对非商用</span>：本项目属于纯粹的技术交流与个人爱好产物。严禁任何个人或组织将本项目用于任何盈利性贩卖、打包出售、商业托管，或在程序内/衍生版内植入任何形式的商业广告。
                </li>
                <li>
                  <span className="font-medium text-slate-900 dark:text-slate-100">渠道防伪与投毒免责</span>：本项目唯一正版官方发布渠道为 B 站{' '}
                  <a href="https://space.bilibili.com/3119369" target="_blank" rel="noopener noreferrer" className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 underline">
                    橙橙乔乔
                  </a>
                  。任何由于用户从贴吧、网盘、Q群等第三方不明渠道下载导致的"文件遭恶意篡改"、"API Key 被盗刷"、"隐私泄露"或"设备中毒"等一切后果，均与官方作者无关，由使用者自行承担。
                </li>
              </ol>
            </div>

            <div className="space-y-2">
              <h5 className="text-[11px] font-semibold text-amber-400">【第二部分：内容生成与版权熔断免责】</h5>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-900 dark:text-slate-100">
                <li>
                  <span className="font-medium text-slate-900 dark:text-slate-100">纯工具属性</span>：本项目仅作为本地运行的前端工具框架，本身不提供任何 AI 大模型算力、不搭建中转服务器、不附带任何具有版权争议的第三方角色、图像、语音或 Live2D/3D 资产。
                </li>
                <li>
                  <span className="font-medium text-slate-900 dark:text-slate-100">资产自备原则</span>：软件内展示的所有角色设定、世界书、图片背景、在线生图模型、以及音频流，均由用户自行配置、自备或调用开源公有云资源。若用户因自行导入、生成涉嫌侵犯他人知识产权（IP）的内容而引发任何纠纷，由用户承担全部民事与法律责任。
                </li>
                <li>
                  <span className="font-medium text-slate-900 dark:text-slate-100">文本不背书</span>：大模型在运行过程中吐出的任何狂热、荒诞、虚构、带有偏见或攻击性的对白、剧情及文本内容，纯属 AI 概率计算产物。本项目不对其真实性、合法性、健康性做任何明示或暗示的保证，亦不承担任何法律连带责任。
                </li>
              </ol>
            </div>

            <div className="space-y-2">
              <h5 className="text-[11px] font-semibold text-amber-400">【第三部分：法律红线与行为锁死】</h5>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-900 dark:text-slate-100">
                <li>
                  <span className="font-medium text-slate-900 dark:text-slate-100">守法红线</span>：用户在使用本文件调用商业或本地 AI 服务时，必须严格遵守所在地法律法规、大模型服务商的使用协议（ToS）及监管要求。
                </li>
                <li>
                  <span className="font-medium text-slate-900 dark:text-slate-100">严禁违规用途</span>：【严禁】利用本项目及关联 AI 生成、传播任何涉嫌违法犯罪、危害国家安全、宣扬暴力恐怖、以及未成年人色情等不合规的文本或多媒体内容。
                </li>
                <li>
                  <span className="font-medium text-slate-900 dark:text-slate-100">心理健康提示</span>：本项目角色扮演功能完全基于虚构情境。请使用者务必保持理性，清晰区分"虚拟 AI 角色"与"现实世界"，切勿过度沉溺或将虚拟情感带入现实生活。
                </li>
              </ol>
            </div>

            <div className="space-y-2">
              <h5 className="text-[11px] font-semibold text-amber-400">【第四部分：关于第三方 AI 服务与 Token 消耗的特别声明】</h5>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-900 dark:text-slate-100">
                <li>
                  <span className="font-medium text-slate-900 dark:text-slate-100">品牌与商标归属</span>：本项目的文档、界面及示例中所提及的任何 AI 产品或服务名称（如 "DeepSeek" 等），仅作为功能示范与技术配置参考，绝不构成任何形式的商业广告、品牌推荐或利益背书。相关 AI 产品的版权、商标及所有权均归其对应的品牌方所有。
                </li>
                <li>
                  <span className="font-medium text-slate-900 dark:text-slate-100">中立属性与无商业关联</span>：本项目作者从未推荐、销售、代理或支持任何特定的 API 商业主体、中转站或算力供应商。本项目不提供任何内建的 API Key，请使用者根据自身需求，合法、合规地自行选择官方或第三方服务渠道。因使用联网 API 服务而产生的任何附加费用、资费变动或服务纠纷，均与本项目及作者无关。
                </li>
                <li>
                  <span className="font-medium text-slate-900 dark:text-slate-100">数据直发与物理隔离</span>：本项目的运行原理为纯前端浏览器本地直发。您在设置中填写的 API Key 和服务地址（Base URL），将直接由您的本地浏览器/设备向该目标地址发起网络请求，中途不经过任何第三方服务器、原作者服务器、中转站或隐蔽的重定向路由。
                </li>
                <li>
                  <span className="font-medium text-slate-900 dark:text-slate-100">异常消耗与缺陷免责</span>：
                  <ul className="list-disc list-inside ml-3 mt-1 space-y-1 text-slate-900 dark:text-slate-100">
                    <li>若出现因黑客攻击、服务商计费异常或非本项目官方代码导致的 Token 异常消耗，请使用者直接与您的 API 服务提供商联系核对。</li>
                    <li>鉴于大模型角色扮演（Roleplay）涉及复杂的上下文拼接、隔离包裹头算法及动态提示词（Prompt）注入，受限于不同模型的 Token 计算机制或代码本身可能存在的未知技术缺陷，若在体验过程中出现由于代码、提示词长度控制等技术缺陷导致的非预期或超量 Token 消耗，请使用者立即停用本项目。继续使用即代表您已知晓并自愿承担相关技术风险，一切损失与本项目及作者无关。</li>
                  </ul>
                </li>
              </ol>
            </div>

            <div className="mt-3 p-3 bg-amber-50 dark:bg-slate-800/40 rounded-md border border-amber-300 dark:border-amber-600/30">
              <p className="text-[10px] text-amber-800 dark:text-amber-300/80 leading-relaxed">
                ※ 凡点击进入本软件、配置模型、或开始对话者，即视为您已阅读并完全同意上述所有条款（包含 Token 消耗及技术免责声明）。如不同意，请立即关闭并彻底删除本单文件程序。
              </p>
            </div>

            {/* 捐赠 */}
            <div className="pt-2 border-t border-slate-700/40">
              <h5 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5">☕ 请作者喝杯咖啡</h5>
              <p className="text-[11px] text-slate-900 dark:text-slate-100 mb-3">
                如果你在使用中获得了乐趣，或觉得这个项目对你有帮助，欢迎通过下方二维码自由捐赠，支持继续开发与维护。
              </p>
              <div className="flex flex-col items-center gap-2 py-2">
                <img
                  src={DONATE_QR_BASE64}
                  alt="支付宝捐赠二维码"
                  width="180"
                  className="rounded-lg border border-slate-700/50"
                />
                <p className="text-[10px] text-slate-900 dark:text-slate-100">支付宝扫码 · 自由捐赠，金额随意，心意最重要 ❤️</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
