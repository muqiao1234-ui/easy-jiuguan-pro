import type {
  BodyPartId,
  BodyStatus,
  Character,
  GalgameData,
  MessageNode,
  ModuleRpgCharacterSlot,
  ModuleRpgCharacterState,
  ModuleRpgBodySpecialConfig,
  ModuleRpgBodySpecialPreset,
  ModuleRpgConfig,
  ModuleRpgData,
  ModuleRpgEvent,
  ModuleRpgField,
  ModuleRpgFieldId,
  ModuleRpgSnapshot,
  ModuleRpgSupportingCharacter,
} from '../types';

const BODY_PART_IDS: BodyPartId[] = [
  'head', 'torso', 'leftUpperArm', 'leftForearm', 'leftHand', 'rightUpperArm', 'rightForearm', 'rightHand',
  'leftThigh', 'leftCalf', 'leftFoot', 'rightThigh', 'rightCalf', 'rightFoot',
];
const BODY_STATUSES = new Set<BodyStatus>(['healthy', 'minor', 'severe', 'missing']);
const MAX_TEXT = 240;
const MAX_LIST_ITEMS = 12;
const MAX_BODY_SPECIAL_PRESETS = 32;
const MAX_BODY_SPECIAL_STATES_PER_PART = 6;

const defaultField = (id: ModuleRpgFieldId, label: string, prompt: string): ModuleRpgField => ({ id, label, prompt, enabled: true });
const DEFAULT_CHARACTER_SLOTS: ModuleRpgCharacterSlot[] = [
  { id: 'charA', enabled: true, name: '' },
  { id: 'charB', enabled: false, name: '' },
];

export const DEFAULT_MODULE_RPG_CONFIG: ModuleRpgConfig = {
  version: 1,
  characterSlots: DEFAULT_CHARACTER_SLOTS,
  fields: [
    defaultField('world.date', '当前日期', '只在剧情明确推进时间时更新日期或时段。'),
    defaultField('world.location', '当前地点', '记录角色当前所在的精确地点或场景。'),
    defaultField('world.faction', '势力/组织', '记录当前直接相关的势力、组织或阵营；无变化时保留。'),
    defaultField('character.body', '身体部位', '依据正文中的明确伤势更新对应部位；不要凭空制造伤势。'),
    defaultField('character.health', '生命/健康', '用简短、客观的健康状态描述。'),
    defaultField('character.mood', '心情', '记录角色外在可见的当前情绪。'),
    defaultField('character.buffs', 'Buff/状态', '仅保留仍有效的增益、减益、异常或关键状态。'),
    defaultField('character.currency', '货币', '记录货币标签和数量；修仙题材可使用灵石等自定义货币。'),
    defaultField('character.inventory', '物品栏', '仅记录携带或装备中的关键物品，最多 12 条。'),
    defaultField('character.relationships', '感情栏', '记录对用户和已命名角色的关系变化，避免无依据的大幅波动。'),
    defaultField('events', '事件栏', '记录未结束的关键事件、任务或重大剧情变化，最多 8 条。'),
    defaultField('supportingCharacters', '配角栏', '记录当前相关配角及其身份、位置、态度，最多 12 人。'),
    defaultField('note', '自由文本', '用一到两句保留无法放入其他字段的重要状态。'),
  ],
  bodySpecialStates: {
    enabled: false,
    prompt: '依据正文中的明确表现更新对应部位特殊状态；只能调用下方已有的 presetId，不得创建新 ID，不要凭空制造状态。',
    presets: [
      { id: 'poison', characterSlot: 'charA', bodyPart: 'head', label: '中毒', description: '正文明确出现中毒、毒发、毒素影响等情况时启用。', displayText: '毒素正在影响身体，需要持续观察。' },
      { id: 'gu_pain', characterSlot: 'charA', bodyPart: 'torso', label: '蛊毒疼痛', description: '正文明确出现蛊毒发作或剧烈疼痛时启用。', displayText: '因为蛊毒而剧烈疼痛，当前需要压制毒性。' },
      { id: 'fire_pill_warmth', characterSlot: 'charA', bodyPart: 'torso', label: '火丹温热', description: '服用火丹后，正文明确表现出身体发暖时启用。', displayText: '服用火丹后身体发暖，药力正在扩散。' },
    ],
  },
};

export const DEFAULT_MODULE_RPG_BODY_SPECIAL_CONFIG: ModuleRpgBodySpecialConfig = {
  enabled: false,
  prompt: '依据正文中的明确表现更新对应部位特殊状态；只能调用下方已有的 presetId，不得创建新 ID，不要凭空制造状态。',
  presets: [
    { id: 'poison', characterSlot: 'charA', bodyPart: 'head', label: '中毒', description: '正文明确出现中毒、毒发、毒素影响等情况时启用。', displayText: '毒素正在影响身体，需要持续观察。' },
    { id: 'gu_pain', characterSlot: 'charA', bodyPart: 'torso', label: '蛊毒疼痛', description: '正文明确出现蛊毒发作或剧烈疼痛时启用。', displayText: '因为蛊毒而剧烈疼痛，当前需要压制毒性。' },
    { id: 'fire_pill_warmth', characterSlot: 'charA', bodyPart: 'torso', label: '火丹温热', description: '服用火丹后，正文明确表现出身体发暖时启用。', displayText: '服用火丹后身体发暖，药力正在扩散。' },
  ],
};

export const DEFAULT_MODULE_RPG_PROMPT = `你是【模块化 Gal/RPG 独立书记 AI】。你不参与角色扮演，不续写剧情，不输出解释、思考或 Markdown。你的唯一职责是根据刚完成的对话，维护玩家配置的结构化状态面板。

你只能输出一个合法 JSON 对象。不要编造未发生的事件；没有变化的字段可省略。程序会保留省略字段的旧数据。
输出结构：
{"world":{"date":"","location":"","faction":""},"characters":[{"id":"charA 或 charB","name":"","body":{"leftForearm":"minor"},"health":"","mood":"","buffs":[""],"currency":{"label":"","value":""},"inventory":[""],"relationshipToUser":"","relationships":[{"target":"","value":""}]}],"events":[{"title":"","status":"","detail":""}],"supportingCharacters":[{"name":"","role":"","location":"","attitude":""}],"note":""}

身体部位只能使用 healthy、minor、severe、missing。只更新已有角色槽位；数组内容必须短小明确。`;

/** Normalize old saved settings which did not yet have explicit character panels. */
export function getModuleRpgCharacterSlots(config: ModuleRpgConfig): ModuleRpgCharacterSlot[] {
  return DEFAULT_CHARACTER_SLOTS.map((fallback) => {
    const saved = config.characterSlots?.find((slot) => slot.id === fallback.id);
    return {
      ...fallback,
      ...saved,
      name: typeof saved?.name === 'string' ? saved.name.trim().slice(0, MAX_TEXT) : '',
    };
  });
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : fallback;
}

function normalizeBodySpecialPreset(value: unknown): ModuleRpgBodySpecialPreset | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = typeof source.id === 'string'
    ? source.id.trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)
    : '';
  const characterSlot = source.characterSlot === 'charB' ? 'charB' : 'charA';
  const bodyPart = typeof source.bodyPart === 'string' && BODY_PART_IDS.includes(source.bodyPart as BodyPartId)
    ? source.bodyPart as BodyPartId
    : 'head';
  const label = text(source.label);
  if (!id || !label) return null;
  return {
    id,
    characterSlot,
    bodyPart,
    label,
    description: text(source.description, label),
    displayText: text(source.displayText, label),
  };
}

/** Fill in the migration-safe defaults without mutating persisted settings. */
export function getModuleRpgBodySpecialConfig(config: ModuleRpgConfig): ModuleRpgBodySpecialConfig {
  const saved = config.bodySpecialStates;
  const sourcePresets = Array.isArray(saved?.presets)
    ? saved.presets
    : DEFAULT_MODULE_RPG_BODY_SPECIAL_CONFIG.presets;
  const usedIds = new Set<string>();
  const presets = sourcePresets
    .map((preset) => normalizeBodySpecialPreset(preset))
    .filter((preset): preset is ModuleRpgBodySpecialPreset => {
      if (!preset || usedIds.has(preset.id)) return false;
      usedIds.add(preset.id);
      return true;
    })
    .slice(0, MAX_BODY_SPECIAL_PRESETS);
  return {
    enabled: saved?.enabled === true,
    prompt: text(saved?.prompt, DEFAULT_MODULE_RPG_BODY_SPECIAL_CONFIG.prompt),
    presets,
  };
}

function stringList(value: unknown, max = MAX_LIST_ITEMS): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter(Boolean).slice(0, max);
}

function normalizeBody(value: unknown, fallback: ModuleRpgCharacterState['body']): ModuleRpgCharacterState['body'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const next = { ...fallback };
  for (const id of BODY_PART_IDS) {
    const status = (value as Record<string, unknown>)[id];
    if (typeof status === 'string' && BODY_STATUSES.has(status as BodyStatus)) next[id] = status as BodyStatus;
  }
  return next;
}

function normalizeBodySpecialStates(
  value: unknown,
  fallback: ModuleRpgCharacterState['bodySpecialStates'],
  config: ModuleRpgBodySpecialConfig,
  characterSlot: 'charA' | 'charB',
): ModuleRpgCharacterState['bodySpecialStates'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const source = value as Record<string, unknown>;
  const allowedByPart = new Map<BodyPartId, Set<string>>();
  for (const preset of config.presets) {
    if (preset.characterSlot !== characterSlot) continue;
    const ids = allowedByPart.get(preset.bodyPart) || new Set<string>();
    ids.add(preset.id);
    allowedByPart.set(preset.bodyPart, ids);
  }
  const next = { ...fallback };
  for (const id of BODY_PART_IDS) {
    const states = source[id];
    if (!Array.isArray(states)) continue;
    next[id] = [...new Set(states
      .filter((state): state is string => typeof state === 'string')
      .map((state) => state.trim())
      .filter((state) => allowedByPart.get(id)?.has(state) === true))].slice(0, MAX_BODY_SPECIAL_STATES_PER_PART);
  }
  return next;
}

function emptyCharacter(id: 'charA' | 'charB', name: string): ModuleRpgCharacterState {
  return {
    id,
    name: name || (id === 'charA' ? '角色A' : '角色B'),
    body: {}, bodySpecialStates: {}, health: '', mood: '', buffs: [],
    currency: { label: '货币', value: '' }, inventory: [], relationshipToUser: '', relationships: [],
  };
}

function slotName(slot: ModuleRpgCharacterSlot, character?: Character | null): string {
  return slot.name || character?.name || (slot.id === 'charA' ? '角色1' : '角色2');
}

export function createModuleRpgSnapshot(characterA?: Character | null, characterB?: Character | null, config: ModuleRpgConfig = DEFAULT_MODULE_RPG_CONFIG): ModuleRpgSnapshot {
  const characterBySlot = { charA: characterA, charB: characterB };
  const characters = getModuleRpgCharacterSlots(config)
    .filter((slot) => slot.enabled)
    .map((slot) => emptyCharacter(slot.id, slotName(slot, characterBySlot[slot.id])));
  return { schemaVersion: 1, revision: 0, world: { date: '', location: '', faction: '' }, characters, events: [], supportingCharacters: [], note: '' };
}

/** Apply the current panel layout to an existing snapshot before the scribe reads it. */
export function applyModuleRpgCharacterSlots(snapshot: ModuleRpgSnapshot, characterA?: Character | null, characterB?: Character | null, config: ModuleRpgConfig = DEFAULT_MODULE_RPG_CONFIG): ModuleRpgSnapshot {
  const characterBySlot = { charA: characterA, charB: characterB };
  const characters = getModuleRpgCharacterSlots(config)
    .filter((slot) => slot.enabled)
    .map((slot) => {
      const existing = snapshot.characters.find((character) => character.id === slot.id);
      const name = slotName(slot, characterBySlot[slot.id]);
      return existing ? { ...existing, name } : emptyCharacter(slot.id, name);
    });
  return { ...snapshot, characters };
}

function enabled(config: ModuleRpgConfig, id: ModuleRpgFieldId): boolean {
  return config.fields.find((field) => field.id === id)?.enabled !== false;
}

function mergeCharacter(value: unknown, previous: ModuleRpgCharacterState, config: ModuleRpgConfig): ModuleRpgCharacterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return previous;
  const source = value as Record<string, unknown>;
  const currency = source.currency && typeof source.currency === 'object' && !Array.isArray(source.currency)
    ? source.currency as Record<string, unknown> : {};
  const relationships = Array.isArray(source.relationships)
    ? source.relationships.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const target = text(record.target);
      const relation = text(record.value);
      return target && relation ? { target, value: relation } : null;
    }).filter((item): item is { target: string; value: string } => Boolean(item)).slice(0, MAX_LIST_ITEMS)
    : previous.relationships;
  const bodySpecialConfig = getModuleRpgBodySpecialConfig(config);
  return {
    ...previous,
    name: text(source.name, previous.name) || previous.name,
    body: enabled(config, 'character.body') ? normalizeBody(source.body, previous.body) : previous.body,
    bodySpecialStates: bodySpecialConfig.enabled && enabled(config, 'character.body')
      ? normalizeBodySpecialStates(source.bodySpecialStates, previous.bodySpecialStates || {}, bodySpecialConfig, previous.id)
      : previous.bodySpecialStates || {},
    health: enabled(config, 'character.health') && typeof source.health === 'string' ? text(source.health) : previous.health,
    mood: enabled(config, 'character.mood') && typeof source.mood === 'string' ? text(source.mood) : previous.mood,
    buffs: enabled(config, 'character.buffs') && Array.isArray(source.buffs) ? stringList(source.buffs) : previous.buffs,
    currency: enabled(config, 'character.currency') ? {
      label: typeof currency.label === 'string' ? text(currency.label, previous.currency.label) || previous.currency.label : previous.currency.label,
      value: typeof currency.value === 'string' || typeof currency.value === 'number' ? text(String(currency.value)) : previous.currency.value,
    } : previous.currency,
    inventory: enabled(config, 'character.inventory') && Array.isArray(source.inventory) ? stringList(source.inventory) : previous.inventory,
    relationshipToUser: enabled(config, 'character.relationships') && typeof source.relationshipToUser === 'string'
      ? text(source.relationshipToUser) : previous.relationshipToUser,
    relationships: enabled(config, 'character.relationships') ? relationships : previous.relationships,
  };
}

export function mergeModuleRpgSnapshot(value: unknown, previous: ModuleRpgSnapshot, config: ModuleRpgConfig): { snapshot: ModuleRpgSnapshot; diagnostics: string[] } {
  const diagnostics: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { snapshot: previous, diagnostics: ['书记输出不是合法对象，已保留上一份状态。'] };
  const source = value as Record<string, unknown>;
  const worldSource = source.world && typeof source.world === 'object' && !Array.isArray(source.world) ? source.world as Record<string, unknown> : {};
  const next: ModuleRpgSnapshot = {
    ...previous,
    revision: previous.revision + 1,
    world: {
      date: enabled(config, 'world.date') && typeof worldSource.date === 'string' ? text(worldSource.date) : previous.world.date,
      location: enabled(config, 'world.location') && typeof worldSource.location === 'string' ? text(worldSource.location) : previous.world.location,
      faction: enabled(config, 'world.faction') && typeof worldSource.faction === 'string' ? text(worldSource.faction) : previous.world.faction,
    },
    note: enabled(config, 'note') && typeof source.note === 'string' ? text(source.note) : previous.note,
    characters: previous.characters.map((character) => {
      const candidate = Array.isArray(source.characters)
        ? source.characters.find((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
          const record = item as Record<string, unknown>;
          return record.id === character.id || (typeof record.name === 'string' && record.name.trim() === character.name);
        })
        : undefined;
      return mergeCharacter(candidate, character, config);
    }),
    events: previous.events,
    supportingCharacters: previous.supportingCharacters,
  };
  if (enabled(config, 'events') && Array.isArray(source.events)) {
    next.events = source.events.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const title = text(record.title); const status = text(record.status); const detail = text(record.detail);
      return title ? { title, status, detail } : null;
    }).filter((item): item is ModuleRpgEvent => Boolean(item)).slice(0, 8);
  }
  if (enabled(config, 'supportingCharacters') && Array.isArray(source.supportingCharacters)) {
    next.supportingCharacters = source.supportingCharacters.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>; const name = text(record.name);
      return name ? { name, role: text(record.role), location: text(record.location), attitude: text(record.attitude) } : null;
    }).filter((item): item is ModuleRpgSupportingCharacter => Boolean(item)).slice(0, MAX_LIST_ITEMS);
  }
  const bodySpecialConfig = getModuleRpgBodySpecialConfig(config);
  if (Array.isArray(source.characters)) {
    const allowedParts = new Set<string>(BODY_PART_IDS);
    const presetById = new Map(bodySpecialConfig.presets.map((preset) => [preset.id, preset]));
    const unknownParts = new Set<string>();
    const unknownPresets = new Set<string>();
    const bindingMismatches = new Set<string>();
    let hasSpecialPayload = false;
    for (const item of source.characters) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const specialStates = (item as Record<string, unknown>).bodySpecialStates;
      if (!specialStates || typeof specialStates !== 'object' || Array.isArray(specialStates)) continue;
      hasSpecialPayload = Object.keys(specialStates).length > 0 || hasSpecialPayload;
      const characterSlot = (item as Record<string, unknown>).id === 'charB' ? 'charB' : 'charA';
      for (const [part, states] of Object.entries(specialStates as Record<string, unknown>)) {
        if (!allowedParts.has(part)) unknownParts.add(part);
        if (Array.isArray(states)) {
          states.filter((state): state is string => typeof state === 'string').forEach((state) => {
            const presetId = state.trim();
            const preset = presetById.get(presetId);
            if (!preset) unknownPresets.add(presetId);
            else if (allowedParts.has(part) && (preset.characterSlot !== characterSlot || preset.bodyPart !== part)) {
              bindingMismatches.add(`${presetId}（${characterSlot}/${part}）`);
            }
          });
        }
      }
    }
    if (unknownParts.size > 0) diagnostics.push(`身体特殊状态包含未知部位，已忽略：${[...unknownParts].join('、')}`);
    if (unknownPresets.size > 0) diagnostics.push(`身体特殊状态包含未配置的 presetId，已忽略：${[...unknownPresets].join('、')}`);
    if (bindingMismatches.size > 0) diagnostics.push(`身体特殊状态与预设绑定目标不一致，已忽略：${[...bindingMismatches].join('、')}`);
    if (hasSpecialPayload && (!bodySpecialConfig.enabled || !enabled(config, 'character.body'))) diagnostics.push('身体部位特殊状态功能当前未启用，输出已忽略。');
  }
  if (Array.isArray(source.characters) && source.characters.some((item) => item && typeof item === 'object' && !Array.isArray(item) && !previous.characters.some((character) => character.id === (item as Record<string, unknown>).id))) {
    diagnostics.push('书记尝试写入未绑定角色槽位，已忽略。');
  }
  return { snapshot: next, diagnostics };
}

export function parseModuleRpgResponse(raw: string): unknown | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(cleaned); } catch { /* Try to recover the first JSON object. */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
  }
  return null;
}

function legacyGalgameSnapshot(data: GalgameData, role: MessageNode['role']): ModuleRpgSnapshot {
  const snapshot = createModuleRpgSnapshot();
  const slot = role === 'charB' ? 'charB' : 'charA';
  snapshot.characters = [{
    ...emptyCharacter(slot, data.name), health: data.health, mood: data.mood,
    relationshipToUser: `表好感 ${data.surfaceAffinity >= 0 ? '+' : ''}${data.surfaceAffinity}；里好感 ${data.hiddenAffinity >= 0 ? '+' : ''}${data.hiddenAffinity}`,
  }];
  return snapshot;
}

export function getModuleRpgData(node: MessageNode): ModuleRpgData | undefined {
  if (node.moduleRpgData) return node.moduleRpgData;
  if (!node.galgameData && !node.scribeUpdate?.rawText?.trim()) return undefined;
  const snapshot = node.galgameData ? legacyGalgameSnapshot(node.galgameData, node.role) : createModuleRpgSnapshot();
  if (node.scribeUpdate?.rawText?.trim()) snapshot.note = node.scribeUpdate.rawText.trim();
  return { snapshot, source: 'legacy' };
}

export function findLatestModuleRpgData(nodes: MessageNode[]): ModuleRpgData | undefined {
  return [...nodes].sort((a, b) => b.timestamp - a.timestamp).map(getModuleRpgData).find(Boolean);
}

export function buildModuleRpgPrompt(basePrompt: string, config: ModuleRpgConfig, snapshot: ModuleRpgSnapshot): string {
  const slots = getModuleRpgCharacterSlots(config).filter((slot) => slot.enabled);
  const panelRules = slots.map((slot) => {
    const current = snapshot.characters.find((character) => character.id === slot.id);
    const fallback = slot.id === 'charA' ? '角色1' : '角色2';
    return `- ${slot.id}: 名称“${current?.name || slot.name || fallback}”。只更新此名称对应的面板；JSON 优先写 id，也可写完全一致的 name。`;
  }).join('\n');
  basePrompt = `${basePrompt.trim() || DEFAULT_MODULE_RPG_PROMPT}\n\n【启用角色面板】\n${panelRules || '未启用角色面板；不要输出 characters。'}`;
  const fields = config.fields.filter((field) => field.enabled).map((field) => `- ${field.label}（${field.id}）：${field.prompt || '根据对话客观维护。'}`).join('\n');
  const bodySpecialConfig = getModuleRpgBodySpecialConfig(config);
  const bodySpecialRules = bodySpecialConfig.enabled && enabled(config, 'character.body')
    ? `\n\n【身体部位特殊状态协议】\n${bodySpecialConfig.prompt}\nbodySpecialStates 的值必须是“身体部位 ID -> presetId 数组”，一个部位允许多个 presetId。只能把预设写入它绑定的角色槽位和身体部位；输出空数组表示清除该部位的特殊状态；省略部位表示保留原状态。\n${bodySpecialConfig.presets.map((preset) => `- ${preset.id}：绑定角色 ${preset.characterSlot} / 部位 ${preset.bodyPart}；${preset.label}；匹配条件：${preset.description}`).join('\n')}\n示例：{"characters":[{"id":"charA","bodySpecialStates":{"head":["poison"],"torso":["gu_pain","fire_pill_warmth"]}}]}`
    : '';
  return `${basePrompt.trim() || DEFAULT_MODULE_RPG_PROMPT}\n\n【玩家启用字段及维护规则】\n${fields}${bodySpecialRules}\n\n【当前合法状态，只读】\n${JSON.stringify(snapshot)}\n\n请只返回本轮发生变化的字段组成的 JSON 对象。`;
}

export function buildModuleRpgSystemInjection(data: ModuleRpgData, activeCharacterName: string, config?: ModuleRpgConfig): string {
  const state = data.snapshot;
  const active = state.characters.find((character) => character.name === activeCharacterName) || state.characters[0];
  const lines = ['【模块化 Gal/RPG 当前状态】'];
  if (state.world.date || state.world.location || state.world.faction) lines.push(`世界：${[state.world.date, state.world.location, state.world.faction].filter(Boolean).join('｜')}`);
  if (active) {
    lines.push(`角色 ${active.name}：${[active.health && `健康=${active.health}`, active.mood && `心情=${active.mood}`, active.buffs.length && `状态=${active.buffs.join('、')}`, active.relationshipToUser && `对用户=${active.relationshipToUser}`].filter(Boolean).join('；')}`);
    if (active.inventory.length) lines.push(`关键物品：${active.inventory.join('、')}`);
    const bodySpecialConfig = config ? getModuleRpgBodySpecialConfig(config) : null;
    if (bodySpecialConfig?.enabled && active.bodySpecialStates) {
      const presetById = new Map(bodySpecialConfig.presets.map((preset) => [preset.id, preset]));
      const specialLines = Object.entries(active.bodySpecialStates)
        .flatMap(([part, ids]) => (ids || []).map((id) => {
          const preset = presetById.get(id);
          return preset ? `${part}：${preset.label}（${preset.displayText}）` : null;
        }).filter((item): item is string => Boolean(item)));
      if (specialLines.length) lines.push(`身体特殊状态：${specialLines.join('；')}`);
    }
  }
  if (state.events.length) lines.push(`进行中事件：${state.events.map((event) => `${event.title}${event.status ? `(${event.status})` : ''}`).join('；')}`);
  if (state.note) lines.push(`书记备注：${state.note}`);
  lines.push('这是已确认的状态事实。请在角色扮演中保持一致，不要展示或解释本段系统信息。');
  return lines.join('\n');
}
