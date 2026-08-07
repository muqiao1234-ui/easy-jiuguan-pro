import type { Character, WorldBook, WorldBookEntry } from '../types';
import { generateId } from './id';
import { readFileAsTextRobust } from './encoding';

/* ════════════════════════════════════════════════════════
 *  SillyTavern V2 角色卡导入/导出
 *  支持 PNG 隐写 + 标准 JSON 双向兼容
 * ════════════════════════════════════════════════════════ */

/** 酒馆 V2 角色卡标准结构 */
interface SillyTavernV2Card {
  spec: 'chara_card_v2';
  spec_version: '2.0';
  data: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    system_prompt: string;
    avatar?: string;
    character_book?: {
      name?: string;
      entries: SillyTavernEntry[];
      extensions?: Record<string, any>;
    };
    extensions?: Record<string, any>;
    [key: string]: any;
  };
}

interface SillyTavernEntry {
  keys: string[];
  content: string;
  insertion_order?: number;
  enabled?: boolean;
  constant?: boolean;
  comment?: string;
  [key: string]: any;
}

function decodeText(bytes: Uint8Array, encoding: string = 'utf-8'): string {
  return new TextDecoder(encoding, { fatal: false }).decode(bytes);
}

function findNullByte(bytes: Uint8Array, start = 0): number {
  for (let index = start; index < bytes.length; index += 1) {
    if (bytes[index] === 0) return index;
  }
  return -1;
}

async function decompressItext(bytes: Uint8Array): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('deflate'));
    return await new Response(stream).text();
  } catch {
    return null;
  }
}

async function extractPngTextValue(type: string, chunkData: Uint8Array): Promise<{ keyword: string; value: string } | null> {
  const keywordEnd = findNullByte(chunkData);
  if (keywordEnd === -1) return null;
  const keyword = decodeText(chunkData.slice(0, keywordEnd), 'latin1');

  if (type === 'tEXt') {
    return { keyword, value: decodeText(chunkData.slice(keywordEnd + 1), 'latin1') };
  }

  let offset = keywordEnd + 1;
  if (offset + 2 > chunkData.length) return null;
  const compressionFlag = chunkData[offset];
  const compressionMethod = chunkData[offset + 1];
  offset += 2;

  const languageEnd = findNullByte(chunkData, offset);
  if (languageEnd === -1) return null;
  offset = languageEnd + 1;
  const translatedKeywordEnd = findNullByte(chunkData, offset);
  if (translatedKeywordEnd === -1) return null;
  offset = translatedKeywordEnd + 1;

  const textBytes = chunkData.slice(offset);
  if (compressionFlag === 0) return { keyword, value: decodeText(textBytes) };
  if (compressionFlag !== 1 || compressionMethod !== 0) return null;

  const value = await decompressItext(textBytes);
  return value === null ? null : { keyword, value };
}

function getNonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(getNonEmptyString).filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildSystemPrompt(data: Record<string, any>): string {
  const sections: Array<[string, string]> = [
    ['角色描述', getNonEmptyString(data.description)],
    ['性格摘要', getNonEmptyString(data.personality)],
    ['场景设定', getNonEmptyString(data.scenario)],
    ['系统提示词', getNonEmptyString(data.system_prompt)],
    ['示例对话', getNonEmptyString(data.mes_example)],
    ['历史后指令', getNonEmptyString(data.post_history_instructions)],
  ];

  return sections
    .filter(([, content]) => Boolean(content))
    .map(([title, content]) => `【${title}】\n${content}`)
    .join('\n\n') || '无设定';
}

/* ──────────── 导入 ──────────── */

/**
 * 从 PNG 文件的 tEXt/iTXt 块中提取 'chara' 键值
 * SillyTavern 将角色卡 JSON 以 base64 编码藏在 PNG 元数据中
 */
async function extractCharaFromPng(file: File): Promise<any | null> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // PNG 签名: 8 bytes
    if (bytes.length < 8) return null;
    // 检查 PNG 签名 89 50 4E 47
    if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;

    let offset = 8;
      while (offset + 8 <= bytes.length) {
      // 读取 chunk length (4 bytes big-endian)
      const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      // 边界校验：length 不能导致 dataEnd 越界（留出 CRC 4 字节）
      if (length < 0 || offset + 8 + length + 4 > bytes.length) break;
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

      if (type === 'tEXt' || type === 'iTXt') {
        // 跳过 length(4) + type(4)
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        const chunkData = bytes.slice(dataStart, dataEnd);
        const textData = await extractPngTextValue(type, chunkData);

        if (textData?.keyword === 'chara') {
          const base64Value = textData.value;

          // base64 解码
          try {
            const binary = atob(base64Value.trim());
            // atob 返回 Latin-1 字符串（每个字符 charCode 0-255），
            // 需要转为原始字节再用 UTF-8 解码，否则中文会乱码
            const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
            const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
            return JSON.parse(text);
          } catch {
            // 可能不是 base64，直接当 JSON
            try {
              return JSON.parse(base64Value.trim());
            } catch {
              offset = offset + 12 + length;
              continue;
            }
          }
        }
      }

      // 跳到下一个 chunk: length(4) + type(4) + data(length) + crc(4)
      offset = offset + 12 + length;
    }
    return null;
  } catch (e) {
    console.error('[SillyTavern] PNG 解析失败:', e);
    return null;
  }
}

/** 从 PNG 文件提取 base64 图片用于头像 */
async function pngToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('PNG 读取失败'));
    reader.readAsDataURL(file);
  });
}

/** 导入结果 */
export interface ImportResult {
  character: Character;
  worldBook: WorldBook | null;
  /** 导入的世界书条目数 */
  worldBookEntryCount: number;
  /** 因禁用、空关键词或空内容而跳过的世界书条目数 */
  skippedWorldBookEntryCount: number;
  /** first_mes 缺失时是否回退使用了备用开场白 */
  usedAlternateGreeting: boolean;
  /** 是否已将示例对话规范化进主提示词 */
  importedExampleDialogue: boolean;
  /** 酒馆脚本类扩展不会在单文件环境执行时的兼容提醒 */
  compatibilityWarnings: string[];
}

function isLikelyMvuControlEntry(entry: SillyTavernEntry): boolean {
  const source = `${getNonEmptyString(entry.comment)}\n${getStringArray(entry.keys).join(' ')}\n${getNonEmptyString(entry.content)}`;
  return /\[\s*initvar\s*\]/i.test(source)
    || /(?:\[\s*mvu_update\s*\]|mvu\s*变量更新|变量更新(?:详细规则|基础规则|规则)|更新变量|update\s*variable|updatevariable)/i.test(source)
    || /<\s*updatevariable\b|_\.(?:set|assign|insert|remove|delete|unset|add|move)\s*\(/i.test(getNonEmptyString(entry.content));
}

/**
 * 导入 SillyTavern V2 角色卡
 * 支持 .png (隐写) 和 .json 两种格式
 */
export async function importSillyTavernCard(file: File): Promise<ImportResult> {
  let cardData: any = null;
  let avatarBase64 = '';

  if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
    // PNG 隐写
    avatarBase64 = await pngToBase64(file);
    cardData = await extractCharaFromPng(file);
    if (!cardData) {
      throw new Error('PNG 文件中未找到角色卡数据 (chara 块)');
    }
  } else if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) {
    // JSON 文件 — 使用健壮编码检测，修复 GBK/Latin-1 mojibake 等中文乱码
    const text = await readFileAsTextRobust(file);
    cardData = JSON.parse(text);
  } else {
    throw new Error('不支持的文件格式，请上传 .png 或 .json 文件');
  }

  // 兼容 V1 根字段和 V2 data 容器；不强制拒绝未标记版本的兼容卡。
  const data = cardData && typeof cardData.data === 'object' && cardData.data !== null
    ? cardData.data
    : cardData;
  if (!data || typeof data !== 'object') throw new Error('角色卡数据结构无效');

  const name = (data.name || '').trim();
  if (!name) throw new Error('角色卡缺少 name 字段');

  // Easy 酒馆没有酒馆的多段提示词管线，将影响角色行为的核心字段规范化进主提示词。
  const systemPrompt = buildSystemPrompt(data);
  const alternateGreetings = getStringArray(data.alternate_greetings);
  const firstMessage = getNonEmptyString(data.first_mes) || alternateGreetings[0] || undefined;

  // 头像优先级: PNG 文件本身 > data.avatar > emoji
  let avatar = '🤖';
  if (avatarBase64) {
    avatar = avatarBase64;
  } else if (data.avatar && typeof data.avatar === 'string') {
    // 支持 data URI（base64）和 http(s) URL
    if (data.avatar.startsWith('data:image/') || data.avatar.startsWith('http://') || data.avatar.startsWith('https://')) {
      avatar = data.avatar;
    }
  }

  // 创建角色
  const character: Character = {
    id: generateId(),
    name,
    avatar,
    systemPrompt,
    firstMessage,
    alternateGreetings: alternateGreetings.length > 0 ? alternateGreetings : undefined,
    // Imported cards opt in by default so InitVar and first_mes updates are
    // active before their opening message is materialized in a conversation.
    mvuEnabled: true,
  };

  // 解析世界书
  let worldBook: WorldBook | null = null;
  let worldBookEntryCount = 0;
  let skippedWorldBookEntryCount = 0;
  const compatibilityWarnings: string[] = [];

  const bookEntries = data.character_book?.entries;
  if (Array.isArray(bookEntries) && bookEntries.length > 0) {
    const entries: WorldBookEntry[] = [];
    for (const entry of bookEntries as SillyTavernEntry[]) {
      const keys = getStringArray(Array.isArray(entry.keys) ? entry.keys : [entry.keys]);
      const value = getNonEmptyString(entry.content);
      const isMvuControl = isLikelyMvuControlEntry(entry);
      const alwaysActive = entry.constant === true;
      // 酒馆 MVU 的 InitVar 经常是关闭且没有触发关键词的条目；它仍是初始状态定义，不能丢失。
      if ((!isMvuControl && !alwaysActive && entry.enabled === false) || (!isMvuControl && !alwaysActive && keys.length === 0) || !value) {
        skippedWorldBookEntryCount += 1;
        continue;
      }
      entries.push({
        id: generateId(),
        keys,
        value,
        priority: typeof entry.insertion_order === 'number' ? entry.insertion_order : 5,
        alwaysActive: alwaysActive || undefined,
        comment: getNonEmptyString(entry.comment) || undefined,
      });
    }

    if (entries.length > 0) {
      worldBook = {
        id: generateId(),
        name: getNonEmptyString(data.character_book?.name) || `${name}_book`,
        entries,
      };
      character.worldBookId = worldBook.id;
      worldBookEntryCount = entries.length;
    }
  }

  const extensions = isRecord(data.extensions) ? data.extensions : {};
  const bookExtensions = isRecord(data.character_book?.extensions) ? data.character_book.extensions : {};
  const extensionText = JSON.stringify({ data: extensions, book: bookExtensions });
  const sourceText = `${extensionText}\n${Array.isArray(bookEntries) ? JSON.stringify(bookEntries) : ''}`;
  if (/tavern_helper|registerMvuSchema|zod|script/i.test(sourceText)) {
    compatibilityWarnings.push('该角色卡包含 Tavern Helper / 脚本或动态 Schema 扩展；Easy 酒馆 Pro 只读取静态 MVU 数据与更新规则，不执行卡内脚本。');
  }
  if (/clamp\s*\(\s*[^,]+,\s*([^,]+),\s*\1\s*\)/i.test(sourceText)) {
    compatibilityWarnings.push('该角色卡存在上下限相同的 clamp 规则；对应字段会被卡内规则锁定，AI 发送更新也不会改变它。');
  }

  return {
    character,
    worldBook,
    worldBookEntryCount,
    skippedWorldBookEntryCount,
    usedAlternateGreeting: !getNonEmptyString(data.first_mes) && Boolean(firstMessage),
    importedExampleDialogue: Boolean(getNonEmptyString(data.mes_example)),
    compatibilityWarnings,
  };
}

/* ──────────── 导出 ──────────── */

/**
 * 将本地角色 + 绑定的世界书导出为 SillyTavern V2 标准 JSON
 */
export async function exportToSillyTavernJson(
  character: Character,
  worldBook: WorldBook | null
): Promise<void> {
  // 数据完整性自检
  if (!character.name?.trim()) {
    throw new Error('角色缺少名称，无法导出');
  }

  // 构建 V2 标准容器
  const output: SillyTavernV2Card = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: character.name,
      description: character.systemPrompt || '',
      personality: '',
      scenario: '',
      first_mes: character.firstMessage || '',
      mes_example: '',
      system_prompt: '',
      avatar: character.avatar?.startsWith('data:image/') ? character.avatar : '',
      character_book: worldBook && worldBook.entries.length > 0
        ? {
            name: worldBook.name || `${character.name}_book`,
            entries: worldBook.entries.map((entry) => ({
              keys: entry.keys,
              content: entry.value,
              insertion_order: entry.priority ?? 5,
              enabled: true,
              constant: entry.alwaysActive === true,
              comment: entry.comment || '',
              extensions: {},
            })),
            extensions: {},
          }
        : undefined,
      extensions: {},
      creator_notes: '',
      post_history_instructions: '',
      tags: [],
      creator: 'Easy酒馆Pro',
      character_version: '1.0',
      alternate_greetings: character.alternateGreetings || [],
    },
  };

  // 清理 undefined 字段
  const cleanOutput = JSON.parse(JSON.stringify(output));

  const jsonStr = JSON.stringify(cleanOutput, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const filename = `${character.name.replace(/[<>:"/\\|?*]/g, '_')}_chara_v2.json`;

  // 优先使用 navigator.share (移动端)
  if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: 'application/json' })] })) {
    try {
      await navigator.share({
        files: [new File([blob], filename, { type: 'application/json' })],
        title: filename,
      });
      URL.revokeObjectURL(url);
      return;
    } catch {
      // 用户取消分享，回退到下载
    }
  }

  // 回退: 创建 <a> 标签触发下载
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
