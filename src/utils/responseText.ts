const REASONING_TAG_NAMES = [
  'think',
  'thinking',
  'though',
  'thought',
  'thoughts',
  'reason',
  'reasoning',
  'analysis',
  'analyse',
  'reflection',
  'reflect',
  'chain_of_thought',
  'chain-of-thought',
  'cot',
  'internal_monologue',
  'inner_monologue',
  'scratchpad',
  'planning',
].join('|');

const REASONING_TAG_TOKEN = new RegExp(
  `([<\\[])\\s*(\\/?)\\s*(${REASONING_TAG_NAMES})\\b[^>\\]]*[>\\]]`,
  'gi'
);

function hideIncompleteTagPrefix(text: string): string {
  const tagStart = Math.max(text.lastIndexOf('<'), text.lastIndexOf('['));
  if (tagStart === -1) return text;

  const tail = text.slice(tagStart);
  const normalized = tail
    .replace(/^[<[]\s*\/?\s*/, '')
    .toLowerCase();

  if (normalized && REASONING_TAG_NAMES.split('|').some((name) => name.startsWith(normalized))) {
    return text.slice(0, tagStart);
  }
  return text;
}

/**
 * Removes reasoning blocks accidentally emitted in assistant-visible content.
 * Supports malformed model variants such as <though>, case differences, tag
 * attributes, square-bracket tags, and unfinished opening tags.
 */
export function stripReasoningBlocks(text: string): string {
  const openTags: string[] = [];
  let visible = '';
  let lastIndex = 0;

  for (const match of text.matchAll(REASONING_TAG_TOKEN)) {
    const token = match[0];
    const index = match.index ?? 0;
    const isClosingTag = match[2] === '/';
    const tagName = match[3].toLowerCase();

    if (!isClosingTag) {
      if (openTags.length === 0) visible += text.slice(lastIndex, index);
      openTags.push(tagName);
      lastIndex = index + token.length;
      continue;
    }

    if (openTags.length === 0) {
      // Discard a stray closing reasoning tag without affecting visible prose.
      visible += text.slice(lastIndex, index);
      lastIndex = index + token.length;
      continue;
    }

    const matchingOpenTag = openTags.lastIndexOf(tagName);
    if (matchingOpenTag >= 0) openTags.splice(matchingOpenTag);
    else openTags.pop();
    lastIndex = index + token.length;
  }

  return openTags.length === 0
    ? hideIncompleteTagPrefix(visible + text.slice(lastIndex))
    : visible;
}

/** Keeps incomplete reasoning tag prefixes hidden while a streaming response is arriving. */
export function filterStreamingReasoningText(text: string): string {
  return hideIncompleteTagPrefix(stripReasoningBlocks(text));
}
