import type { Character, WorldBook, WorldBookEntry } from '../types';
import { generateId } from './id';

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
  comment?: string;
  [key: string]: any;
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
    while (offset < bytes.length - 8) {
      // 读取 chunk length (4 bytes big-endian)
      const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

      if (type === 'tEXt' || type === 'iTXt') {
        // 跳过 length(4) + type(4)
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        const chunkData = bytes.slice(dataStart, dataEnd);
        const text = new TextDecoder().decode(chunkData);

        // tEXt 格式: keyword\0value
        // iTXt 格式: keyword\0compressionFlag\0compressionMethod\0languageTag\0translatedKeyword\0text
        const nullIdx = text.indexOf('\0');
        if (nullIdx === -1) continue;
        const keyword = text.substring(0, nullIdx);

        if (keyword === 'chara') {
          let base64Value: string;
          if (type === 'tEXt') {
            base64Value = text.substring(nullIdx + 1);
          } else {
            // iTXt: skip compressionFlag(1) + compressionMethod(1) + languageTag\0 + translatedKeyword\0
            let pos = nullIdx + 1;
            pos += 1; // compression flag
            pos += 1; // compression method
            const langEnd = text.indexOf('\0', pos);
            if (langEnd === -1) continue;
            pos = langEnd + 1;
            const transEnd = text.indexOf('\0', pos);
            if (transEnd === -1) continue;
            pos = transEnd + 1;
            base64Value = text.substring(pos);
          }

          // base64 解码
          try {
            const decoded = atob(base64Value.trim());
            return JSON.parse(decoded);
          } catch {
            // 可能不是 base64，直接当 JSON
            try {
              return JSON.parse(base64Value.trim());
            } catch {
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
    // JSON 文件
    const text = await file.text();
    cardData = JSON.parse(text);
  } else {
    throw new Error('不支持的文件格式，请上传 .png 或 .json 文件');
  }

  // 兼容 V1 和 V2 格式
  // V1: { name, description, personality, first_mes, ... } 直接在根级
  // V2: { spec, spec_version, data: { name, description, ... } }
  const data = cardData.data || cardData;

  const name = (data.name || '').trim();
  if (!name) throw new Error('角色卡缺少 name 字段');

  // 组装 systemPrompt: description + personality + system_prompt
  const parts: string[] = [];
  if (data.description) parts.push(String(data.description));
  if (data.personality) parts.push(String(data.personality));
  if (data.system_prompt) parts.push(String(data.system_prompt));
  const systemPrompt = parts.join('\n\n').trim() || '无设定';

  // 头像优先级: PNG 文件本身 > data.avatar > emoji
  let avatar = '🤖';
  if (avatarBase64) {
    avatar = avatarBase64;
  } else if (data.avatar && typeof data.avatar === 'string') {
    // 确保是 data URI 格式
    if (data.avatar.startsWith('data:image/')) {
      avatar = data.avatar;
    } else if (data.avatar.startsWith('http')) {
      avatar = data.avatar;
    }
  }

  // 创建角色
  const character: Character = {
    id: generateId(),
    name,
    avatar,
    systemPrompt,
  };

  // 解析世界书
  let worldBook: WorldBook | null = null;
  let worldBookEntryCount = 0;

  const bookEntries = data.character_book?.entries;
  if (Array.isArray(bookEntries) && bookEntries.length > 0) {
    const entries: WorldBookEntry[] = bookEntries
      .filter((e: SillyTavernEntry) => e.keys && e.keys.length > 0 && e.content)
      .map((e: SillyTavernEntry) => ({
        id: generateId(),
        keys: Array.isArray(e.keys) ? e.keys : [String(e.keys)],
        value: String(e.content),
        priority: typeof e.insertion_order === 'number' ? e.insertion_order : 5,
      }));

    if (entries.length > 0) {
      worldBook = {
        id: generateId(),
        name: `${name}_book`,
        entries,
      };
      character.worldBookId = worldBook.id;
      worldBookEntryCount = entries.length;
    }
  }

  return { character, worldBook, worldBookEntryCount };
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
      first_mes: '',
      mes_example: '',
      system_prompt: '',
      avatar: character.avatar?.startsWith('data:image/') ? character.avatar : '',
      character_book: worldBook && worldBook.entries.length > 0
        ? {
            name: `${character.name}_book`,
            entries: worldBook.entries.map((entry) => ({
              keys: entry.keys,
              content: entry.value,
              insertion_order: entry.priority ?? 5,
              enabled: true,
              extensions: {},
            })),
          }
        : undefined,
      extensions: {
        depth_prompt: {},
        talkativeness: '0.5',
        fav: false,
      },
      creator_notes: '',
      post_history_instructions: '',
      tags: [],
      creator: 'Easy酒馆Pro',
      character_version: '1.0',
      alternate_greetings: [],
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
