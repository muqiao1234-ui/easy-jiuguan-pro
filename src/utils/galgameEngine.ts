import type { GalgameData, MessageNode } from '../types';

/**
 * Galgame 数值引擎 — 默认 System Prompt 模板
 * 包含 ${targetCharacterName} 占位符，调用时动态替换
 * 用户可在设置中自定义覆盖
 */
export const DEFAULT_GALGAME_PROMPT = `你是不参与对话、绝对冰冷客观的 Galgame 游戏后台数值引擎。
你唯一的任务是：根据当前上下文（可能包含角色提示词、历史状态书和最近对话），评估并更新【指定目标角色】的状态数值。

当前你需要检测的目标角色卡名字为：\${targetCharacterName}
（注意：你必须且只能推导此名字角色的内心与外在数值，不要与其他乱入的角色混淆！）

上下文说明：
- 如果提供了"角色提示词"，它定义了该角色的性格底色、行为逻辑和底层心理学规则，你必须严格以该角色提示词为准来推导情感数值。
- 如果提供了"历史状态书"（assistant 消息），它代表上一轮该角色各维度的历史数值，你应基于历史趋势延续性地调整，而非从零随机写。
- 最后一条 user 消息是当前要评估的最近 2 轮对话。

为了确保数值推导符合逻辑，请遵循以下核心参数的底层心理学定义，禁止主观幻想：
1. "name": 必须严格输出你需要检测的目标角色卡名字，即 "\${targetCharacterName}"，禁止自己幻想或简写。
2. "health": 身体客观事实。仅通过该角色的行为描写（如揉太阳穴、咳嗽、叹气）判断其当前的生理状态（良好/疲惫/轻伤/不适等）。
3. "mood": 该角色当下展现给玩家的外在情绪。属于短期表象波动（如：傲娇、欣喜、强颜欢笑、冷漠、羞怯）。
4. "vigilance": 该角色对玩家或环境的警惕度 (0 到 100)。涉及秘密、谎言或肢体接触时会剧烈波动。
5. "surface_affinity": 表好感度 (-100 到 100)。角色主观认知到的、浮于表面的人际关系定位。极易产生短期大幅度波动。
6. "hidden_affinity": 里好感度 (-100 到 100)。角色内心深处最真实的潜意识羁绊。哪怕表面在生气，里好感也绝不会轻易下降。

你必须且只能输出以下严格格式的单行纯 JSON 字符串。
严禁包含任何 Markdown 标记、严禁输出任何换行符或多余解释文本：

{"name":"\${targetCharacterName}","health":"健康度","mood":"表面心情","vigilance":0,"surface_affinity":0,"hidden_affinity":0}`;

/**
 * 姓名强绑定约束片段 — 追加到用户自定义 prompt 末尾
 */
const NAME_BIND_SUFFIX = (charName: string) => `

【姓名强绑定】当前目标角色卡名字为：${charName}
你必须且只能推导此角色的数值，禁止与其他角色混淆。
JSON 的 "name" 字段必须严格输出 "${charName}"，禁止简写或幻想。`;

/**
 * 根据角色名生成最终 Galgame Prompt
 * - 若用户自定义了 prompt，在其末尾追加姓名强绑定约束
 * - 若未自定义，使用默认模板并替换占位符
 */
export function buildGalgamePrompt(charName: string, customPrompt?: string): string {
  const name = charName || '未知角色';
  if (customPrompt && customPrompt.trim()) {
    return customPrompt.trim() + NAME_BIND_SUFFIX(name);
  }
  return DEFAULT_GALGAME_PROMPT.replace(/\$\{targetCharacterName\}/g, name);
}

/**
 * Galgame 触发间隔：每 2 轮
 */
export const GALGAME_TRIGGER_INTERVAL = 2;

/**
 * Galgame 调用最大 token 数
 */
export const GALGAME_MAX_TOKENS = 500;

/**
 * 文本清洗：过滤 Emoji、Base64、HTML 标签、多余空白
 * 用于极大化压榨 Token 消耗
 */
export function cleanDialogueText(text: string): string {
  if (!text) return '';
  let result = text;
  // 移除 Emoji
  result = result.replace(/[\u{1F000}-\u{1F9FF}]/gu, '');
  result = result.replace(/[\u{2600}-\u{27BF}]/gu, '');
  // 移除 Base64 占位符
  result = result.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[图片]');
  // 移除 HTML 标签
  result = result.replace(/<[^>]+>/g, '');
  // 压缩连续换行和空格
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/[ \t]+/g, ' ');
  return result.trim();
}

/**
 * 解析 Galgame 引擎返回的 JSON 字符串
 * 容错处理：去除可能的 markdown 包裹、提取 JSON 部分
 * @param expectedName 期望的角色名，若提供则做名字校验，不一致时强制修正
 */
export function parseGalgameResponse(raw: string, expectedName?: string): GalgameData | null {
  if (!raw) return null;

  // 1. 去除可能的 markdown 包裹，保留正文原始结构
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  // 2. 第一优先：直接 parse（模型若按 prompt 要求输出严格单行 JSON
  //    且字符串值内 proper 转义了 \n，这里就能一次命中）
  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === 'object') return buildGalgameData(obj, expectedName);
  } catch { /* 继续下一个策略 */ }

  // 3. 第二优先：从正文中提取最外层 JSON 对象块再 parse
  //    使用 [\s\S]*? (non-greedy) 替代 [^}]+，避免因 mood/health 等
  //    字符串值内含真实换行（非 \n 转义）导致 [^}]+ 提前截断。
  const extraction = cleaned.match(/\{[\s\S]*\}/);
  if (extraction) {
    try {
      const obj = JSON.parse(extraction[0]);
      return buildGalgameData(obj, expectedName);
    } catch { /* 继续兜底 */ }
  }

  // 4. 最终兜底：模型输出含真实换行的散装 JSON（如 mood 值跨了多行）。
  //    去掉换行（用空格替代避免换行两端的词直接拼接成新词），然后重试。
  const single = cleaned.replace(/\n/g, ' ');
  try {
    const obj = JSON.parse(single);
    return buildGalgameData(obj, expectedName);
  } catch {
    const m = single.match(/\{[^}]+\}/);
    if (m) {
      try {
        const obj = JSON.parse(m[0]);
        return buildGalgameData(obj, expectedName);
      } catch { /* 所有策略均失败 */ }
    }
  }

  return null;
}

/** 从解析后的对象构建 GalgameData，并做名字强校验 */
function buildGalgameData(obj: any, expectedName?: string): GalgameData {
  let name = String(obj.name || '未知');
  // 名字强校验：若模型返回的名字与期望角色名不一致，强制修正
  if (expectedName && expectedName.trim() && name !== expectedName) {
    console.warn(`[Galgame] 名字校验: 模型返回 "${name}" ≠ 期望 "${expectedName}"，强制修正`);
    name = expectedName;
  }
  return {
    name,
    health: String(obj.health || '未知'),
    mood: String(obj.mood || '未知'),
    vigilance: clampNum(obj.vigilance, 0, 100),
    surfaceAffinity: clampNum(obj.surface_affinity, -100, 100),
    hiddenAffinity: clampNum(obj.hidden_affinity, -100, 100),
  };
}

function clampNum(val: any, min: number, max: number): number {
  const n = Number(val);
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/**
 * 非对称信息映射 — 将好感度数字转换为模糊氛围描述
 * 主 AI 只能看到模糊描述，看不到具体数字，防止谄媚作弊
 */
export function affinityToDescription(surface: number, hidden: number): string {
  const parts: string[] = [];

  // 表好感度模糊化 — "你"指真正的 user（玩家），避免 AI 误认为是自己
  if (surface >= 70) parts.push('对方明显对真正的user表现出好感与亲近');
  else if (surface >= 30) parts.push('对方对真正的user态度友善，有一定信任基础');
  else if (surface >= -10) parts.push('对方与真正的user保持着礼貌的距离');
  else if (surface >= -40) parts.push('对方对真正的user有些不满或警惕');
  else parts.push('对方明显对真正的user表现出敌意或厌恶');

  // 里好感度模糊化
  if (hidden >= 60) parts.push('但隐约可以察觉到对方潜意识里对真正的user有深层的依赖');
  else if (hidden >= 20) parts.push('对方内心深处似乎并不排斥真正的user的存在');
  else if (hidden >= -20) parts.push('对方内心对真正的user保持中立');
  else parts.push('对方内心深处对真正的user存在难以化解的隔阂');

  return parts.join('，') + '。';
}

/**
 * 生成非对称上下文注入文本 — 主 AI 可见的"客观事实"
 * 采用第三人称客观陈述，绝不使用"作为[角色名]，你..."的主观代入句式
 * 根据状态书归属角色是否为当前回戏角色，使用不同模板：
 *   - 情况 A（属于当前回戏角色）: "[系统环境提示] 角色 [X] 当前..."
 *   - 情况 B（属于旁观/NPC角色）: "[当前场景NPC状态] 现场的另一位角色 [X] 当前..."
 * 无论哪种情况，都剔除具体好感度数字，只输出模糊氛围描述
 *
 * @param data Galgame 数值数据
 * @param isActiveChar 该状态书是否属于当前正在回戏的角色
 */
export function buildGalgameSystemInjection(data: GalgameData, isActiveChar: boolean = false): string {
  const desc = affinityToDescription(data.surfaceAffinity, data.hiddenAffinity);
  if (isActiveChar) {
    return `[系统环境提示] 角色 [${data.name}] 当前身体状态为(${data.health})，外在情绪表现为(${data.mood})。${desc}`;
  }
  return `[当前场景NPC状态] 现场的另一位角色 [${data.name}] 当前身体状态为(${data.health})，外在情绪表现为(${data.mood})。${desc}`;
}

/**
 * 生成像素方块进度条字符串
 * ■■■■■□□□□□
 */
export function pixelBar(value: number, min: number, max: number, length: number = 10): string {
  const normalized = (value - min) / (max - min);
  const filled = Math.round(normalized * length);
  return '■'.repeat(filled) + '□'.repeat(length - filled);
}

/**
 * 把一个 GalgameData 实例序列化为 LLM 可读的纯文本格式，
 * 用于将"上一次推断的状态书"作为 assistant 角色重新喂给 Galgame 引擎，
 * 让模型能看到上一轮的状态，避免每轮都从零随机推断。
 *
 * 输出格式与 buildGalgamePrompt 中要求输出的 JSON 字段一一对应，
 * 但展示为人类/LLM 都易读的语句化形式，避免硬塞 JSON 给模型造成格式混淆。
 */
export function serializeGalgameData(data: GalgameData): string {
  // 使用 key:value 格式而非硬编码中文标签，避免模型输出英文值时
  // 出现"中文标签 + 英文值"的语言混用，降低 LLM 理解质量。
  return [
    `name:${data.name}`,
    `health:${data.health}`,
    `mood:${data.mood}`,
    `vigilance:${data.vigilance}`,
    `surfaceAffinity:${data.surfaceAffinity}`,
    `hiddenAffinity:${data.hiddenAffinity}`,
  ].join(' | ');
}

/**
 * 收集某个目标角色名下，按时间倒序的最近 N 个 galgame 状态书文本。
 *
 * 设计：触发 Galgame 引擎时，扫描 recentNodes 中带有 galgameData 的 assistant
 * 节点，且 galgameData.name 与目标角色名一致。返回 N 个序列化后的状态书
 * 字符串，按时间正序排列（最旧的在前，最新的在后），以便模型作为
 * "assistant 历史"接在 system / user 之后。
 *
 * @param recentNodes 当前对话的所有消息节点（任意顺序）
 * @param charName 目标角色名
 * @param maxCount 最多抓取的状态书数量（默认 2）
 * @returns 序列化状态书的纯文本数组，按时间正序排列；若没有则返回空数组
 */
export function collectRecentGalgameStates(
  recentNodes: MessageNode[],
  charName: string,
  maxCount: number = 2
): string[] {
  const nodes = [...recentNodes].sort((a, b) => a.timestamp - b.timestamp);
  const matches = nodes.filter(
    (n) =>
      (n.role === 'charA' || n.role === 'charB') &&
      n.galgameData &&
      n.galgameData.name === charName
  );
  // 取最近 maxCount 个，按时间正序输出
  return matches
    .slice(-maxCount)
    .map((n) => serializeGalgameData(n.galgameData!));
}

/**
 * 生成带符号的进度条（适用于 -100 到 100 的数值）
 * 负值用红色方块，正值用绿色方块
 */
export function signedPixelBar(value: number, length: number = 10): string {
  const half = Math.floor(length / 2);
  const normalized = Math.round((value / 100) * half);
  if (normalized >= 0) {
    return '□'.repeat(half) + '■'.repeat(normalized) + '□'.repeat(half - normalized);
  } else {
    const abs = Math.abs(normalized);
    return '□'.repeat(half - abs) + '■'.repeat(abs) + '□'.repeat(half);
  }
}
