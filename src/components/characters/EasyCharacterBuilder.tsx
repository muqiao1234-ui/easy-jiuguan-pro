import React, { useState } from 'react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

/* ════════════════════════════════════════════════════════
 *  Easy人物卡 · 模块化组装器
 *  将角色卡拆分为 7 个模块，点选/填入后自动拼装为完整 systemPrompt
 *  预设文本来源: outputs/预设人物卡框架.txt
 * ════════════════════════════════════════════════════════ */

// ── 1. 引导头预设 ──
const GUIDE_PRESETS = [
  { value: 'none', label: '不使用引导头', text: '' },
  { value: 'rp', label: '📖 沉浸式单兵RP (推荐)', text: '你现在将完全沉浸地扮演目标角色。不要以 AI 助手或旁白身份发言，严禁跳戏（OOC）。你的所有回复必须且仅能代表该角色的言行、心理和物理反馈。' },
  { value: 'group', label: '🎭 互动群像叙事', text: '你将作为该角色的化身，同时兼任环境旁白。请根据玩家的行动，动态描绘周围场景、NPC的即时反应以及时间流逝，维持一个生动的半开放世界。' },
  { value: 'cocreate', label: '📝 协同剧本创作', text: '你是一个专业的文学共创助手。请在维持角色人设高度一致的前提下，配合玩家的剧情走向，产出具有张力、伏笔和情绪推拉的高质量叙事文本。' },
  { value: 'trpg', label: '🎮 经典TRPG跑团', text: '你将扮演该角色，并严格遵循世界观的物理规则。每一次交互都需要体现出角色的能力边界，不进行降智妥协，请把玩家当作平等的博弈对手。' },
];

// ── 2. 文风部标签 ──
const STYLE_TAGS = [
  { key: 'aesthetic', label: '唯美叙事', text: '【文风：唯美叙事】强调光影、空气、气味等环境要素与人物心境的通感。使用具有画面感的词汇，语速放缓，多用比喻和意象，避免直白生硬的动作交代。' },
  { key: 'street', label: '市井大白话', text: '【文风：市井写实】语言风格极度口语化、生活化。允许使用日常俚语、叹词。严禁使用书面化的翻译腔或辞藻堆砌，人物说话要像街头真实存在的人。' },
  { key: 'lightnovel', label: '二次元轻小说', text: '【文风：轻小说风格】多用短句。人物发言带有标志性的语气词或习惯性动作。内心独白活跃、情绪波动大，充满戏剧张力和ACG浓度。' },
  { key: 'hardboiled', label: '极简冷硬派', text: '【文风：硬汉/冷硬派】句子简短、有力，拒绝无病呻吟。只描写客观发生的物理事实和角色做出的实际行动，通过克制、冰冷的白描来传递情绪。' },
  { key: 'psycho', label: '意识流/心理剧', text: '【文风：深层心理】极其侧重人物的潜意识、思维跳跃、生理反射（如心跳突变、指尖微颤）以及心理防线的逐步崩溃，让肉体反应服务于心理博弈。' },
];

// ── 5. 逻辑+防退化+防神化标签 ──
const LOGIC_TAGS = [
  { key: 'anti-degrade', label: '🛡️ 拒绝复读机（防退化）', text: '[防退化协议]：严禁复制、改写或变相复述玩家上一轮输入中的大段描述与台词。你必须提供全新的情节推动、新的角色反应或未曾披露的细节。' },
  { key: 'anti-steal', label: '🛡️ 严禁替玩家操作（防抢戏）', text: '[防抢戏协议]：你只拥有你所扮演角色的绝对控制权。严禁代替玩家的角色发言、替玩家做出决定、或者描述玩家角色的心理活动与身体反应。将主动权和选择权留给玩家。' },
  { key: 'physics', label: '🛡️ 物理与常识限制（防神化）', text: '[逻辑约束]：角色不具有上帝视角。他/她只能通过五感获取当前环境内的已知信息，不能未卜先知。所有行动必须符合常人逻辑和该世界观下的物理规律，受伤会流血、疲惫会反应迟钝。' },
  { key: 'memory', label: '🛡️ 动态记忆更新', text: '[记忆维护]：请在每次对话中隐含地比对前文。随着对话推进，角色与玩家的好感度、信任度、当前的伤病状态必须实时发生物理和心理层面的线性改变，拒绝态度突然转折。' },
];

// ── 4. 安全词区预设 ──
const SAFE_WORD_PRESETS = [
  {
    label: '⚙️ 括号OOC控制法',
    text: '【安全指令】如果玩家在发言中使用双括号"(( OOC: 你的指令 ))"，你必须立即跳出角色扮演状态，将括号内的内容视为最高级别的系统修改指令执行，执行完毕后在下一次回复中重新切回角色。',
  },
  {
    label: '🔄 剧情快退/重置锚点',
    text: '【安全指令】当玩家输入"/reset"或"/rewind"时，表明当前剧情走向发生偏差。你必须立即停止当前的剧情推进，等待玩家给出最新的剧情修正方向，重新生成上一轮的对话。',
  },
];

// ── 7. 要求区预设 ──
const REQUIREMENT_PRESETS = [
  {
    label: '🏷️ 标准RP输出格式（默认）',
    text: '【格式规范】字数严格控制在 250~450 字之间，确保节奏紧凑。使用「」表示角色对话，正常文本表示动作和环境描写。禁止使用"*动作*"这种网聊符号格式。',
  },
  {
    label: '🏷️ 破冰开局（首条消息专用）',
    text: '【首发要求】请不要等待玩家输入，直接根据上述人设和世界观，生成一段包含细腻环境描写的【破冰开局】。留出悬念，并在结尾将行动权交还给玩家。',
  },
  {
    label: '🏷️ 轻量化极简输出',
    text: '【格式规范】每轮回复不得超过 150 字。语言精炼，像微信/IM聊天一样即时、高频交互，主打快节奏的生活化对白。',
  },
];

// ── 3. 核心人设 AI 搜索提示词 ──
const CORE_PERSONA_AI_PROMPT = `请帮我联网搜索【[请输入你想查询的角色/人物，例如：绫波丽]】的核心设定信息，并严格按照以下 Markdown 格式输出，不要包含任何多余解释：

# [Character_Profile]
- Name: 角色名 (原名/译名)
- Gender: 性别 | Age: 年龄 | Status: 身份/职业/状态
- Appearance: 外貌描写（身高、发型、瞳色、标志性穿着、伤疤/特征等）
- Personality: 性格特质（表面性格 + 深层性格，用具体行为倾向描述而非形容词堆砌）
- Background: 背景故事（出身、关键经历、当前处境，3-5句概括）
- Speech_Style: 说话风格（嗓音特点、常用语气词、口头禅、说话时的习惯性小动作）`;

interface EasyCharacterBuilderProps {
  open: boolean;
  onClose: () => void;
  /** 初始 systemPrompt（编辑模式时传入已有内容） */
  initialPrompt?: string;
  /** 保存回调，返回拼装后的完整 systemPrompt */
  onSave: (prompt: string) => void;
}

// ── UI 组件：模块卡片（必须在组件外部，避免 render 时函数引用变化导致滚动跳顶）──
function ModuleCard({ icon, title, subtitle, children }: { icon: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-3 space-y-2 border border-slate-700/50">
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <div>
          <h4 className="text-xs font-semibold text-amber-400">{title}</h4>
          {subtitle && <p className="text-[10px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ── UI 组件：可点选标签（同上，必须在组件外部）──
function TagButton({ tag, selected, onClick }: { tag: { key: string; label: string }; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs rounded-lg px-3 py-1.5 border transition-colors ${
        selected
          ? 'bg-amber-600/20 border-amber-500 text-amber-300'
          : 'bg-slate-800/50 border-slate-700/50 text-slate-900 dark:text-slate-100 hover:border-amber-500/50'
      }`}
    >
      {tag.label}
    </button>
  );
}

export default function EasyCharacterBuilder({
  open,
  onClose,
  initialPrompt,
  onSave,
}: EasyCharacterBuilderProps) {
  // ── 各模块状态 ──
  const [guideKey, setGuideKey] = useState('rp');
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [corePersona, setCorePersona] = useState('');
  const [safeWord, setSafeWord] = useState('');
  const [selectedLogic, setSelectedLogic] = useState<string[]>(['anti-degrade', 'anti-steal', 'physics', 'memory']);
  const [demoText, setDemoText] = useState('');
  const [requirements, setRequirements] = useState(REQUIREMENT_PRESETS[0].text);

  // ── 核心人设 AI 提示词弹窗 ──
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── 预览弹窗 ──
  const [previewOpen, setPreviewOpen] = useState(false);

  // ── 标签切换 ──
  const toggleTag = (key: string, list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  };

  // ── 一键复制 AI 搜索提示词 ──
  const handleCopyAiPrompt = async () => {
    try {
      await navigator.clipboard.writeText(CORE_PERSONA_AI_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级方案
      const textarea = document.createElement('textarea');
      textarea.value = CORE_PERSONA_AI_PROMPT;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ── 拼装完整 systemPrompt ──
  const assemblePrompt = (): string => {
    const parts: string[] = [];

    // 1. 引导头
    const guide = GUIDE_PRESETS.find((g) => g.value === guideKey);
    if (guide?.text) parts.push(guide.text);

    // 2. 文风部
    const styleTexts = selectedStyles
      .map((k) => STYLE_TAGS.find((t) => t.key === k)?.text)
      .filter(Boolean);
    if (styleTexts.length > 0) {
      parts.push(styleTexts.join('\n'));
    }

    // 3. 核心人设
    if (corePersona.trim()) {
      parts.push(corePersona.trim());
    }

    // 4. 安全词区
    if (safeWord.trim()) {
      parts.push(safeWord.trim());
    }

    // 5. 逻辑+防退化+防神化
    const logicTexts = selectedLogic
      .map((k) => LOGIC_TAGS.find((t) => t.key === k)?.text)
      .filter(Boolean);
    if (logicTexts.length > 0) {
      parts.push(logicTexts.join('\n'));
    }

    // 6. 示范区
    if (demoText.trim()) {
      parts.push('【回复示范】\n' + demoText.trim());
    }

    // 7. 要求区
    if (requirements.trim()) {
      parts.push(requirements.trim());
    }

    return parts.join('\n\n');
  };

  const assembledPreview = assemblePrompt();

  return (
    <>
      {/* ── 主弹窗：全屏模块化组装器 ── */}
      <Modal
        open={open}
        onClose={onClose}
        title="🧩 Easy人物卡 · 模块化组装"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">

          {/* 1. 引导头 */}
          <ModuleCard icon="🧭" title="引导头" subtitle="决定 AI 的运行模式，影响配合度与叙事自主性">
            <select
              className="input-field text-xs"
              value={guideKey}
              onChange={(e) => setGuideKey(e.target.value)}
            >
              {GUIDE_PRESETS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
            {guideKey !== 'none' && (
              <pre className="text-[10px] text-slate-500 bg-slate-900/50 rounded p-2 whitespace-pre-wrap font-mono">
                {GUIDE_PRESETS.find((g) => g.value === guideKey)?.text}
              </pre>
            )}
          </ModuleCard>

          {/* 2. 文风部 */}
          <ModuleCard icon="✍️" title="文风部" subtitle="多选叠加，后台自动拼接到文风规范区">
            <div className="flex flex-wrap gap-2">
              {STYLE_TAGS.map((tag) => (
                <TagButton
                  key={tag.key}
                  tag={tag}
                  selected={selectedStyles.includes(tag.key)}
                  onClick={() => toggleTag(tag.key, selectedStyles, setSelectedStyles)}
                />
              ))}
            </div>
          </ModuleCard>

          {/* 3. 核心人设 */}
          <ModuleCard icon="🎯" title="核心人设" subtitle="角色的核心设定。可手写，也可用AI搜索提示词一键复制去豆包/DS生成">
            <div className="flex items-center gap-2 mb-1">
              <Button size="sm" variant="secondary" onClick={() => setAiPromptOpen(true)}>
                🔍 一键复制AI搜索提示词
              </Button>
              <span className="text-[10px] text-slate-500">
                复制 → 打开豆包/DS联网 → 粘贴搜索 → 复制结果 → 粘贴到下方
              </span>
            </div>
            <textarea
              className="input-field min-h-[120px] text-xs"
              value={corePersona}
              onChange={(e) => setCorePersona(e.target.value)}
              placeholder={'填写或粘贴角色的核心设定，格式参考：\n# [Character_Profile]\n- Name: 角色名\n- Gender: 性别 | Age: 年龄 | Status: 身份\n- Appearance: 外貌...\n- Personality: 性格...\n- Background: 背景...\n- Speech_Style: 说话风格...'}
            />
          </ModuleCard>

          {/* 4. 安全词区 */}
          <ModuleCard icon="🛡️" title="安全词 / 金手指" subtitle="OOC控制、剧情重置等特殊指令，默认留空">
            <div className="flex flex-wrap gap-2 mb-1">
              {SAFE_WORD_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setSafeWord(p.text)}
                  className="text-[10px] rounded-lg px-2 py-1 border border-slate-700/50 bg-slate-800/50 text-slate-900 dark:text-slate-100 hover:border-amber-500/50 transition-colors"
                >
                  {p.label}
                </button>
              ))}
              {safeWord && (
                <button
                  type="button"
                  onClick={() => setSafeWord('')}
                  className="text-[10px] rounded-lg px-2 py-1 border border-red-700/30 bg-red-900/20 text-red-400 hover:bg-red-900/30 transition-colors"
                >
                  ✕ 清空
                </button>
              )}
            </div>
            <textarea
              className="input-field min-h-[50px] text-xs"
              value={safeWord}
              onChange={(e) => setSafeWord(e.target.value)}
              placeholder="留空表示不使用。点击上方预设按钮可快速填入，也可手动编辑..."
            />
          </ModuleCard>

          {/* 5. 逻辑+防退化+防神化 */}
          <ModuleCard icon="⚙️" title="逻辑 · 防退化 · 防神化" subtitle="AI长文本不复读、不降智、不抢戏的地基防线，强烈建议全选">
            <div className="flex flex-wrap gap-2">
              {LOGIC_TAGS.map((tag) => (
                <TagButton
                  key={tag.key}
                  tag={tag}
                  selected={selectedLogic.includes(tag.key)}
                  onClick={() => toggleTag(tag.key, selectedLogic, setSelectedLogic)}
                />
              ))}
            </div>
          </ModuleCard>

          {/* 6. 示范区 */}
          <ModuleCard icon="📝" title="回复示范" subtitle="给AI看的一段范例文本，最有效的腔调塑造工具">
            <textarea
              className="input-field min-h-[80px] text-xs"
              value={demoText}
              onChange={(e) => setDemoText(e.target.value)}
              placeholder={'写一段你期望角色如何回复的示范文本。例如：\n陆行舟头也没抬，从围裙口袋里摸出一盒压扁的烟，用指尖弹出一支叼在嘴里，却没有点燃。\n"本店凌晨五点准时打烊。还有十分钟。"'}
            />
          </ModuleCard>

          {/* 7. 要求区 */}
          <ModuleCard icon="📋" title="输出要求" subtitle="字数、格式、行为规范等硬性约束">
            <div className="flex flex-wrap gap-2 mb-1">
              {REQUIREMENT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setRequirements(p.text)}
                  className={`text-[10px] rounded-lg px-2 py-1 border transition-colors ${
                    requirements === p.text
                      ? 'border-amber-500 bg-amber-600/20 text-amber-300'
                      : 'border-slate-700/50 bg-slate-800/50 text-slate-900 dark:text-slate-100 hover:border-amber-500/50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <textarea
              className="input-field min-h-[50px] text-xs"
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="选择上方预设或手动编辑输出格式要求..."
            />
          </ModuleCard>

          {/* ── 底部操作栏 ── */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-700/50">
            <Button size="sm" variant="ghost" onClick={() => setPreviewOpen(true)}>
              👁 预览拼装结果
            </Button>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={onClose}>取消</Button>
              <Button size="sm" onClick={() => { onSave(assembledPreview); onClose(); }}>
                ✅ 保存到角色卡
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── AI 搜索提示词弹窗 ── */}
      <Modal
        open={aiPromptOpen}
        onClose={() => setAiPromptOpen(false)}
        title="🔍 AI 搜索提示词"
        maxWidth="max-w-lg"
      >
        <div className="space-y-3">
          <div className="text-xs text-slate-400 space-y-1">
            <p>使用方法：</p>
            <ol className="list-decimal list-inside space-y-0.5 text-slate-500">
              <li>点击「一键复制」复制下方提示词</li>
              <li>打开豆包 / DeepSeek 等 AI，开启「联网搜索」</li>
              <li>把提示词里的 [角色名] 替换成你想搜的角色，发送</li>
              <li>复制 AI 返回的规范文本，粘贴到「核心人设」输入框</li>
            </ol>
          </div>
          <div className="relative">
            <pre className="text-xs text-slate-300 bg-slate-900/50 rounded-lg p-3 pr-20 whitespace-pre-wrap break-words font-mono leading-relaxed border border-slate-700/50">
              {CORE_PERSONA_AI_PROMPT}
            </pre>
            <button
              type="button"
              onClick={handleCopyAiPrompt}
              className={`absolute top-2 right-2 px-2.5 py-1 text-xs rounded-lg transition-colors ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-600 hover:bg-amber-500 text-white'
              }`}
            >
              {copied ? '✅ 已复制' : '一键复制'}
            </button>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => setAiPromptOpen(false)}>关闭</Button>
          </div>
        </div>
      </Modal>

      {/* ── 预览弹窗 ── */}
      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="拼装预览"
        maxWidth="max-w-lg"
      >
        <pre className="text-xs text-slate-300 bg-slate-900/50 rounded-lg p-3 whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto font-mono leading-relaxed">
          {assembledPreview || '(空 — 请至少填写一个模块)'}
        </pre>
        <div className="flex justify-end pt-2">
          <Button size="sm" variant="secondary" onClick={() => setPreviewOpen(false)}>关闭</Button>
        </div>
      </Modal>
    </>
  );
}
