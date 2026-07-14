/**
 * 健壮的文件文本读取 — 自动检测编码，修复中文乱码
 *
 * 解决问题：
 * 1. GBK/GB2312 编码的 JSON 文件被 file.text() 以 UTF-8 解码 → 乱码
 * 2. UTF-8 编码的文件被中间环节以 Latin-1/Windows-1252 读取后再保存 → mojibake
 *    （如 "中" 的 UTF-8 字节 E4 B8 AD 被逐字节读成 Ã¤Â¸Â­）
 * 3. 带 BOM 的文件（UTF-8 BOM / UTF-16 BOM）
 *
 * 策略：
 * 1. 检测 BOM → 按对应编码解码
 * 2. 尝试 UTF-8 → 若无替换字符 U+FFFD 则成功
 * 3. UTF-8 失败 → 尝试 GBK → 尝试 Big5
 * 4. UTF-8 成功但检测到 Latin-1 mojibake 特征 → 反向修复
 */

/** 检测并修复 Latin-1/Windows-1252 mojibake */
function fixLatin1Mojibake(text: string): string {
  // mojibake 特征：UTF-8 中文字节被 Latin-1 读取后产生的字符
  // 如 Ã¤ Â¸ Â­ Â¥ Â¶ 等（Latin-1 范围 0x80-0xFF 的字符）
  const mojibakePattern = /[\u00C0-\u00FF]{2,}/;
  if (!mojibakePattern.test(text)) return text;

  // 反向修复：将每个字符的 charCode 取低 8 位还原为原始字节，再用 UTF-8 解码
  try {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i) & 0xff;
    }
    const fixed = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    // 修复成功标志：无替换字符 + 包含 CJK 字符
    if (!fixed.includes('\uFFFD') && /[\u4e00-\u9fff\u3400-\u4dbf]/.test(fixed)) {
      return fixed;
    }
  } catch {
    /* ignore */
  }
  return text;
}

/**
 * 健壮地读取文件文本，自动检测编码
 * 支持 UTF-8（带/不带 BOM）、UTF-16、GBK、Big5
 * 并自动修复 Latin-1 mojibake
 */
export async function readFileAsTextRobust(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // 空文件
  if (bytes.length === 0) return '';

  // 1. 检测 BOM
  // UTF-8 BOM: EF BB BF
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }
  // UTF-16 LE BOM: FF FE
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.slice(2));
  }
  // UTF-16 BE BOM: FE FF
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.slice(2));
  }

  // 2. 尝试 UTF-8 解码（non-fatal，替换字符而非抛异常）
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

  // 若 UTF-8 解码无替换字符，说明是合法 UTF-8
  if (!utf8Text.includes('\uFFFD')) {
    // 检查是否有 Latin-1 mojibake（UTF-8 文本被中间环节以 Latin-1 读取后再保存）
    const fixed = fixLatin1Mojibake(utf8Text);
    return fixed;
  }

  // 3. UTF-8 解码有替换字符 → 尝试 GBK
  const candidateEncodings = ['gbk', 'gb18030', 'big5', 'shift_jis', 'euc-kr'];
  for (const encoding of candidateEncodings) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: false }).decode(bytes);
      if (!decoded.includes('\uFFFD')) {
        return decoded;
      }
    } catch {
      // 该编码不被浏览器支持，跳过
    }
  }

  // 4. 所有编码都失败 → 返回 UTF-8 解码结果（可能有替换字符）
  return utf8Text;
}
