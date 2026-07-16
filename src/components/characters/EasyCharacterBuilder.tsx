import React, { useState } from 'react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

/* ════════════════════════════════════════════════════════
 *  Easy人物卡 · 模块化组装器
 *  将角色卡拆分为 7 个模块，点选/填入后自动拼装为完整 systemPrompt
 * ════════════════════════════════════════════════════════ */

// ── 占位符数据（后续替换为正式文档）──

const GUIDE_PRESETS = [
  { value: 'none', label: '不使用引导头', text: '' },
  { value: 'novel', label: '小说叙事型', text: '【占位】你现在是一位小说叙事AI，请以第三人称沉浸式小说风格进行角色扮演……' },
  { value: 'chat', label: '对话陪伴型', text: '【占位】你现在是一位对话陪伴AI，请以第一人称亲切口吻与用户交流……' },
  { value: 'rp', label: '角色扮演型', text: '【占位】你现在是一位角色扮演AI，请完全代入角色设定进行沉浸式互动……' },
];

const STYLE_TAGS = [
  { key: 'casual', label: '轻松日常', text: '【占位·文风】语气轻松自然，多用口语化表达，偶尔使用emoji和网络用语。' },
  { key: 'serious', label: '严肃正剧', text: '【占位·文风】用词精准克制，注重逻辑性和氛围感，避免轻浮表达。' },
  { key: 'literary', label: '文学细腻', text: '【占位·文风】注重心理描写和感官细节，善用比喻和意象，行文有节奏感。' },
  { key: 'humor', label: '幽默吐槽', text: '【占位·文风】以吐槽和反转制造喜剧效果，但不过度破坏沉浸感。' },
  { key: 'dark', label: '暗黑压抑', text: '【占位·文风】基调沉重，注重绝望感和无力感，不回避残酷描写。' },
  { key: 'moe', label: '软萌可爱', text: '【占位·文风】语气软糯，多用叠词和语气词，偶尔撒娇。' },
];

const LOGIC_TAGS = [
  { key: 'anti-degrade', label: '防退化', text: '【占位·防退化】不得遗忘已有剧情进展，不得回退角色关系发展阶段，每次回复需体现前期积累。' },
  { key: 'anti-god', label: '防神化', text: '【占位·防神化】角色不得无理由获得新能力，不得超越设定范围内的实力上限，遇到超出能力的情况应表现出挣扎或失败。' },
  { key: 'consistency', label: '人设一致', text: '【占位·一致性】角色的性格、说话方式、价值取向必须始终与核心人设保持一致，不得OOC。' },
  { key: 'emotion-pace', label: '情感节奏', text: '【占位·节奏】情感发展需循序渐进，不得跳跃式升温或降温，好感度变化需有合理触发事件。' },
  { key: 'npc-aware', label: 'NPC意识', text: '【占位·NPC】角色作为独立个体存在，有自己的生活轨迹和信息盲区，不得全知全能。' },
  { key: 'scene-logic', label: '场景逻辑', text: '【占位·场景】物理法则和场景逻辑须自洽，不得出现穿墙、瞬移等不合逻辑的行为。' },
];

interface EasyCharacterBuilderProps {
  open: boolean;
  onClose: () => void;
  /** 初始 systemPrompt（编辑模式时传入已有内容） */
  initialPrompt?: string;
  /** 保存回调，返回拼装后的完整 systemPrompt */
  onSave: (prompt: string) => void;
}

// ── UI 组件：模块卡片（必须定义在组件外部，否则每次 render 产生新函数引用，导致子树 unmount/remount、滚动位置丢失）──
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
  const [guideKey, setGuideKey] = useState('none');
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [corePersona, setCorePersona] = useState('');
  const [safeWord, setSafeWord] = useState('');
  const [selectedLogic, setSelectedLogic] = useState<string[]>([]);
  const [demoText, setDemoText] = useState('');
  const [requirements, setRequirements] = useState('每次回复约300-500字。保持角色语气一致，避免AI感。');

  // ── 核心人设 JSON 导入弹窗 ──
  const [jsonImportOpen, setJsonImportOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');

  // ── 预览弹窗 ──
  const [previewOpen, setPreviewOpen] = useState(false);

  // ── 标签切换 ──
  const toggleTag = (key: string, list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
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
      parts.push('【文风要求】\n' + styleTexts.join('\n'));
    }

    // 3. 核心人设
    if (corePersona.trim()) {
      parts.push('【角色设定】\n' + corePersona.trim());
    }

    // 4. 安全词区
    if (safeWord.trim()) {
      parts.push('【安全词/金手指】\n' + safeWord.trim());
    }

    // 5. 逻辑+防退化+防神化
    const logicTexts = selectedLogic
      .map((k) => LOGIC_TAGS.find((t) => t.key === k)?.text)
      .filter(Boolean);
    if (logicTexts.length > 0) {
      parts.push('【行为规范】\n' + logicTexts.join('\n'));
    }

    // 6. 示范区
    if (demoText.trim()) {
      parts.push('【回复示范】\n' + demoText.trim());
    }

    // 7. 要求区
    if (requirements.trim()) {
      parts.push('【输出要求】\n' + requirements.trim());
    }

    return parts.join('\n\n');
  };

  // ── JSON 导入核心人设 ──
  const handleJsonImport = () => {
    setJsonError('');
    try {
      let clean = jsonText.trim();
      const fence = clean.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) clean = fence[1].trim();

      const parsed = JSON.parse(clean);
      if (typeof parsed === 'object' && parsed !== null) {
        // 尝试提取常见字段
        const fields = ['name', 'description', 'personality', 'system_prompt', 'scenario', 'first_mes'];
        const extracted = fields
          .map((f) => (parsed[f] ? `${f}: ${parsed[f]}` : null))
          .filter(Boolean)
          .join('\n');
        if (extracted) {
          setCorePersona(extracted);
          setJsonImportOpen(false);
          setJsonText('');
        } else {
          setJsonError('JSON 中未找到可识别的角色字段（name/description/personality 等）');
        }
      } else {
        setJsonError('请粘贴 JSON 对象');
      }
    } catch {
      setJsonError('JSON 解析失败，请检查格式');
    }
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
          <ModuleCard icon="🧭" title="引导头" subtitle="下拉选择预设文本，决定AI的基础叙事模式">
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
          <ModuleCard icon="✍️" title="文风部" subtitle="点选标签组合，每个标签对应一段预设文风要求">
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
          <ModuleCard icon="🎯" title="核心人设" subtitle="角色的核心设定。可用JSON导入，也可手写">
            <div className="flex items-center gap-2 mb-1">
              <Button size="sm" variant="secondary" onClick={() => setJsonImportOpen(true)}>
                📥 JSON导入
              </Button>
              <span className="text-[10px] text-slate-500">
                支持酒馆卡格式 / 自定义JSON / 手动输入
              </span>
            </div>
            <textarea
              className="input-field min-h-[100px] text-xs"
              value={corePersona}
              onChange={(e) => setCorePersona(e.target.value)}
              placeholder="填写角色的核心设定：姓名、性格、外貌、背景故事、与用户的关系等……"
            />
          </ModuleCard>

          {/* 4. 安全词区 */}
          <ModuleCard icon="🛡️" title="安全词 / 金手指" subtitle="特殊指令或安全词功能，默认留空">
            <textarea
              className="input-field min-h-[50px] text-xs"
              value={safeWord}
              onChange={(e) => setSafeWord(e.target.value)}
              placeholder="留空表示不使用。可填写：金手指指令、安全词、特殊能力触发等……"
            />
          </ModuleCard>

          {/* 5. 逻辑+防退化+防神化 */}
          <ModuleCard icon="⚙️" title="逻辑 · 防退化 · 防神化" subtitle="点选需要的规则模块，自动拼装到行为规范区">
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
          <ModuleCard icon="📝" title="回复示范" subtitle="给AI看的范例文本，让AI模仿你的期望风格">
            <textarea
              className="input-field min-h-[80px] text-xs"
              value={demoText}
              onChange={(e) => setDemoText(e.target.value)}
              placeholder="写一段你期望角色如何回复的示范文本，AI会学习这个风格……"
            />
          </ModuleCard>

          {/* 7. 要求区 */}
          <ModuleCard icon="📋" title="输出要求" subtitle="字数、格式、行为规范等硬性要求">
            <textarea
              className="input-field min-h-[50px] text-xs"
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="如：每次回复约300-500字。保持角色语气一致，避免AI感。"
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

      {/* ── JSON 导入弹窗 ── */}
      <Modal
        open={jsonImportOpen}
        onClose={() => setJsonImportOpen(false)}
        title="JSON 导入核心人设"
        maxWidth="max-w-lg"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            粘贴角色卡 JSON（酒馆V2格式或自定义对象），系统会自动提取 name / description / personality / system_prompt / scenario / first_mes 字段。
          </p>
          <textarea
            className="input-field min-h-[150px] text-xs font-mono"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder={'{\n  "name": "角色名",\n  "description": "角色描述...",\n  "personality": "性格特征..."\n}'}
          />
          {jsonError && <p className="text-xs text-red-400">{jsonError}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setJsonImportOpen(false)}>取消</Button>
            <Button size="sm" onClick={handleJsonImport}>导入</Button>
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
