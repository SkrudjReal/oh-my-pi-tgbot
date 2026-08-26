/**
 * Telegram Markdown to HTML Formatter, Table-to-Card Transformer,
 * Custom Emoji/Reaction/Sticker Parser, and Message Chunking Engine.
 */

const THINK_BLOCK_RE = /<(?:think|thought|reasoning|thinking)>[\s\S]*?(?:<\/(?:think|thought|reasoning|thinking)>|$)/gi;
const INCOMPLETE_THINK_RE = /<(?:think|thought|reasoning|thinking)>[\s\S]*$/i;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*){1,}\|?\s*$/;

export const STICKER_TAG_RE = /<tg-sticker\s+([^>]+)\s*\/?>/gi;
export const REACT_TAG_RE = /<tg-react\s+([^>]+)\s*\/?>/gi;
export const CUSTOM_EMOJI_TAG_RE = /<tg-emoji\s+emoji-id="([^"]+)">([\s\S]*?)<\/tg-emoji>/gi;

// Matches valid Telegram HTML tags to preserve them during escaping
const VALID_TG_TAG_RE = /<\/?(?:b|strong|i|em|u|ins|s|strike|del|tg-spoiler|code|pre|blockquote(?:\s+expandable)?|a(?:\s+href="[^"]*")?|tg-emoji(?:\s+emoji-id="[^"]*")?)>/gi;

// Strictly allowed Telegram reactions
export const ALLOWED_REACTION_EMOJIS = new Set(["❤", "❤️", "👍", "🔥", "👎"]);

/**
 * Escapes characters for HTML.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Strips reasoning / internal thinking blocks.
 */
export function stripThinkTags(text: string): string {
  let cleaned = text.replace(THINK_BLOCK_RE, "");
  cleaned = cleaned.replace(INCOMPLETE_THINK_RE, "");
  return cleaned.trim();
}

/**
 * Strips delivery control tags (<tg-react>, <tg-sticker>) from user-visible text.
 */
export function stripDeliveryTags(text: string): string {
  return text
    .replace(STICKER_TAG_RE, "")
    .replace(REACT_TAG_RE, "")
    .replace(/<tg-photo[^>]*\/?>/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Extracts strictly allowed reactions from <tg-react emoji="..."/> tags.
 * Only permits: ❤, 👍, 🔥, 👎.
 */
export function extractReactions(text: string): string[] {
  const reactions: string[] = [];
  const matches = text.matchAll(REACT_TAG_RE);
  for (const match of matches) {
    const rawAttrs = match[1];
    const emojiMatch =
      rawAttrs.match(/(?:emoji|tag|name)=["']?([^"'\s>]+)["']?/i) ||
      rawAttrs.match(/["']?([^"'\s>]+)["']?/);
    if (emojiMatch && emojiMatch[1]) {
      const emoji = emojiMatch[1].trim();
      const normalized = emoji === "❤️" ? "❤" : emoji;
      if (ALLOWED_REACTION_EMOJIS.has(normalized)) {
        reactions.push(normalized);
      }
    }
  }
  return reactions;
}

/**
 * Extracts stickers from <tg-sticker tag="..."/> tags.
 */
export function extractStickers(text: string): string[] {
  const stickers: string[] = [];
  const matches = text.matchAll(STICKER_TAG_RE);
  for (const match of matches) {
    const rawAttrs = match[1];
    const tagMatch =
      rawAttrs.match(/(?:tag|id|name|file_id)=["']?([^"'\s>]+)["']?/i) ||
      rawAttrs.match(/["']?([^"'\s>]+)["']?/);
    if (tagMatch && tagMatch[1]) {
      stickers.push(tagMatch[1]);
    }
  }
  return stickers;
}

function splitTableRow(rowStr: string): string[] {
  const row = rowStr.trim();
  const content = row.replace(/^\|/, "").replace(/\|$/, "");
  return content.split("|").map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  const s = line.trim();
  return Boolean(s.startsWith("|") || s.endsWith("|") || (s.includes("|") && !s.startsWith("```")));
}

/**
 * Transforms Markdown tables into mobile-friendly cards.
 */
export function wrapMarkdownTables(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!isTableRow(line) || i + 1 >= lines.length || !TABLE_SEPARATOR_RE.test(lines[i + 1])) {
      out.push(line);
      i++;
      continue;
    }

    const headers = splitTableRow(line);
    i += 2; // skip header and delimiter

    const tableRows: string[][] = [];
    while (i < lines.length && isTableRow(lines[i]) && lines[i].trim() !== "") {
      tableRows.push(splitTableRow(lines[i]));
      i++;
    }

    if (tableRows.length === 0) {
      out.push(line);
      continue;
    }

    const cards: string[] = [];
    for (let rIdx = 0; rIdx < tableRows.length; rIdx++) {
      const row = tableRows[rIdx];
      const primaryHeader = headers[0] || "Item";
      const primaryVal = row[0] || `#${rIdx + 1}`;
      const cardLines = [`📊 <b>${escapeHtml(primaryHeader)}:</b> ${escapeHtml(primaryVal)}`];

      for (let cIdx = 1; cIdx < Math.max(headers.length, row.length); cIdx++) {
        const h = headers[cIdx] || `Col ${cIdx + 1}`;
        const v = row[cIdx] || "-";
        if (v && v !== "-") {
          cardLines.push(`  • <b>${escapeHtml(h)}:</b> ${escapeHtml(v)}`);
        }
      }
      cards.push(cardLines.join("\n"));
    }

    out.push(cards.join("\n\n"));
  }

  return out.join("\n");
}

/**
 * Converts Markdown text into rich, Telegram-compatible HTML.
 * Ensures <blockquote> tags never contain internal leading/trailing \n and formats
 * long blockquotes (>180 chars or >=4 lines) with <blockquote expandable>.
 */
export function mdToTelegramHtml(markdown: string): string {
  if (!markdown) return "";

  // 1. Strip thinking tags
  let text = stripThinkTags(markdown);

  // 2. Transform tables to cards
  text = wrapMarkdownTables(text);

  // 3. Temporarily stash fenced code blocks
  const codeBlocks: string[] = [];
  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
    const placeholder = `\x01CB${codeBlocks.length}\x02`;
    codeBlocks.push(`<pre><code${langAttr}>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
    return placeholder;
  });

  // 4. Temporarily stash inline code spans
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const placeholder = `\x01IC${inlineCodes.length}\x02`;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  // 5. Clean & stash direct HTML blockquotes (trim internal \n and handle expandable)
  text = text.replace(/<blockquote(\s+expandable)?>\s*([\s\S]*?)\s*<\/blockquote>/gi, (_, exp, content) => {
    const cleanContent = content.trim();
    const isLong = cleanContent.length > 180 || cleanContent.split("\n").length >= 4;
    const expAttr = exp || isLong ? " expandable" : "";
    return `<blockquote${expAttr}>${cleanContent}</blockquote>`;
  });

  // 6. Temporarily stash existing valid Telegram HTML tags
  const validHtmlTags: string[] = [];
  text = text.replace(VALID_TG_TAG_RE, (tag) => {
    const placeholder = `\x01TG${validHtmlTags.length}\x02`;
    validHtmlTags.push(tag);
    return placeholder;
  });

  // 7. Escape HTML characters in remaining text
  text = escapeHtml(text);

  // 8. Headers (# Header -> <b>Header</b>)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>\n");

  // 9. Bold (**text** or __text__)
  text = text.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
  text = text.replace(/__(.*?)__/g, "<b>$1</b>");

  // 10. Italic (*text* or _text_)
  text = text.replace(/(?<!\w)\*(?!\s)([^*]+?)(?<!\s)\*(?!\w)/g, "<i>$1</i>");
  text = text.replace(/(?<!\w)_(?!\s)([^_]+?)(?<!\s)_(?!\w)/g, "<i>$1</i>");

  // 11. Strikethrough (~~text~~)
  text = text.replace(/~~(.*?)~~/g, "<s>$1</s>");

  // 12. Spoilers (||text||)
  text = text.replace(/\|\|(.*?)\|\|/g, "<tg-spoiler>$1</tg-spoiler>");

  // 13. Multi-line Markdown Blockquotes (> text or &gt; text)
  // Strips leading/trailing \n inside blockquote and adds expandable for long text
  text = text.replace(/(?:^(?:>|&gt;)[ \t]?(?:.*(?:\n|$)))+/gm, (block) => {
    const lines = block.split("\n").filter((l) => l.startsWith(">") || l.startsWith("&gt;") || l.trim() !== "");
    const inner = lines.map((line) => line.replace(/^(?:>|&gt;)[ \t]?/, "")).join("\n").trim();
    if (!inner) return "";
    const isLong = inner.length > 180 || inner.split("\n").length >= 4;
    const tag = isLong ? "<blockquote expandable>" : "<blockquote>";
    return `${tag}${inner}</blockquote>\n`;
  });

  // 14. Links ([text](url))
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

  // 15. Restore valid Telegram HTML tags
  for (let i = 0; i < validHtmlTags.length; i++) {
    text = text.replace(`\x01TG${i}\x02`, validHtmlTags[i]);
  }

  // 16. Restore inline code
  for (let i = 0; i < inlineCodes.length; i++) {
    text = text.replace(`\x01IC${i}\x02`, inlineCodes[i]);
  }

  // 17. Restore code blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    text = text.replace(`\x01CB${i}\x02`, codeBlocks[i]);
  }

  return text.trim();
}

/**
 * Splits text into chunks under limit (default 3800) preserving paragraphs and HTML tags.
 */
export function splitTelegramText(text: string, limit = 3800): string[] {
  if (!Number.isSafeInteger(limit) || limit < 32) {
    throw new Error("Telegram chunk limit must be an integer of at least 32 characters.");
  }
  if (text.length <= limit) {
    return [text];
  }

  type OpenTag = { name: string; open: string; close: string };
  const closeTags = (stack: OpenTag[]) => stack.slice().reverse().map((tag) => tag.close).join("");
  const reopenTags = (stack: OpenTag[]) => stack.map((tag) => tag.open).join("");
  const advanceStack = (source: OpenTag[], token: string): OpenTag[] => {
    const stack = source.slice();
    const closing = token.match(/^<\s*\/\s*([a-z0-9-]+)\s*>$/i);
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === closing[1].toLowerCase()) {
          stack.splice(i, 1);
          break;
        }
      }
      return stack;
    }

    const opening = token.match(/^<\s*([a-z0-9-]+)(?:\s[^>]*)?>$/i);
    if (!opening || /\/\s*>$/.test(token) || opening[1].toLowerCase() === "br") {
      return stack;
    }
    const name = opening[1].toLowerCase();
    stack.push({ name, open: token, close: `</${name}>` });
    return stack;
  };

  // Tags and entities are indivisible tokens; the Unicode fallback keeps surrogate pairs intact.
  const tokens = text.match(/<[^>]+>|&(?:#\d+|#x[\da-f]+|[a-z]+);|[\s\S]/giu) ?? [];
  const chunks: string[] = [];
  let stack: OpenTag[] = [];
  let current = "";

  for (const token of tokens) {
    const nextStack = advanceStack(stack, token);
    const projectedLength = current.length + token.length + closeTags(nextStack).length;
    const prefixLength = reopenTags(stack).length;

    if (projectedLength > limit && current.length > prefixLength) {
      chunks.push(current + closeTags(stack));
      current = reopenTags(stack);
    }

    current += token;
    stack = advanceStack(stack, token);
  }

  if (current) {
    chunks.push(current + closeTags(stack));
  }

  for (const chunk of chunks) {
    if (chunk.length > limit) {
      throw new Error("Unable to split Telegram HTML safely within the configured limit.");
    }
  }

  return chunks;
}
