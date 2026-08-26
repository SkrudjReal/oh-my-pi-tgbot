import { describe, expect, test } from "bun:test";
import {
  escapeHtml,
  extractReactions,
  extractStickers,
  mdToTelegramHtml,
  splitTelegramText,
  stripDeliveryTags,
  stripThinkTags,
  wrapMarkdownTables,
} from "../src/services/formatter";

describe("Telegram Formatter & Markdown Converter", () => {
  test("escapeHtml escapes basic HTML special chars", () => {
    expect(escapeHtml("1 < 2 & 3 > 0")).toBe("1 &lt; 2 &amp; 3 &gt; 0");
  });

  test("stripThinkTags removes think/thought tags", () => {
    const raw = "<think>Secret internal reasoning here</think>Hello world!";
    expect(stripThinkTags(raw)).toBe("Hello world!");

    const incomplete = "Hello world! <thought>Still pondering...";
    expect(stripThinkTags(incomplete)).toBe("Hello world!");
  });

  test("extractReactions only allows 4 strict reactions: ❤, 👍, 🔥, 👎", () => {
    const text = 'Great! <tg-react emoji="🔥"/>, <tg-react emoji="❤"/>, <tg-react emoji="👍"/>, <tg-react emoji="👎"/> and <tg-react emoji="🤡"/>';
    expect(extractReactions(text)).toEqual(["🔥", "❤", "👍", "👎"]);
  });

  test("extractStickers parses <tg-sticker> tags", () => {
    const text = 'Here is a gift <tg-sticker tag="heart"/> for you!';
    expect(extractStickers(text)).toEqual(["heart"]);
  });

  test("stripDeliveryTags removes control tags cleanly", () => {
    const text = 'Hello <tg-react emoji="🔥"/> and <tg-sticker tag="heart"/>';
    expect(stripDeliveryTags(text)).toBe("Hello and");
  });

  test("wrapMarkdownTables converts pipe tables to card lists", () => {
    const mdTable = `| Tool | Description | Status |
| --- | --- | --- |
| bash | Execute commands | Active |
| read | Read files | Ready |`;

    const converted = wrapMarkdownTables(mdTable);
    expect(converted).toContain("📊 <b>Tool:</b> bash");
    expect(converted).toContain("• <b>Description:</b> Execute commands");
    expect(converted).toContain("• <b>Status:</b> Active");
  });

  test("mdToTelegramHtml formats bold, italic, code, spoilers, and custom emojis", () => {
    const markdown = [
      "# Main Title",
      "This is **bold** and _italic_ and `inline code`.",
      "Check this ||spoiler|| and [Docs](https://omp.sh).",
      '<tg-emoji emoji-id="5336824751673343377">👌</tg-emoji>',
      "```ts",
      "const a = 1 < 2;",
      "```",
    ].join("\n");

    const html = mdToTelegramHtml(markdown);
    expect(html).toContain("<b>Main Title</b>");
    expect(html).toContain("<b>bold</b>");
    expect(html).toContain("<i>italic</i>");
    expect(html).toContain("<code>inline code</code>");
    expect(html).toContain("<tg-spoiler>spoiler</tg-spoiler>");
    expect(html).toContain('<a href="https://omp.sh">Docs</a>');
    expect(html).toContain('<tg-emoji emoji-id="5336824751673343377">👌</tg-emoji>');
    expect(html).toContain('<pre><code class="language-ts">const a = 1 &lt; 2;</code></pre>');
  });

  test("splitTelegramText cleanly splits long text without breaking lines", () => {
    const longText = "Paragraph 1\n\n".repeat(500);
    const chunks = splitTelegramText(longText, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1000);
    }
  });

  test("splitTelegramText closes and reopens HTML tags across chunks", () => {
    const html = `<blockquote expandable><b>${"long &amp; safe text ".repeat(80)}</b></blockquote>`;
    const chunks = splitTelegramText(html, 240);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(240);
      expect((chunk.match(/<blockquote expandable>/g) || []).length).toBe(1);
      expect((chunk.match(/<\/blockquote>/g) || []).length).toBe(1);
      expect((chunk.match(/<b>/g) || []).length).toBe(1);
      expect((chunk.match(/<\/b>/g) || []).length).toBe(1);
    }
  });

  test("mdToTelegramHtml ensures blockquotes have no internal leading/trailing newlines", () => {
    const md = "> \n> First line\n> Second line\n> ";
    const html = mdToTelegramHtml(md);
    expect(html).toContain("<blockquote>First line\nSecond line</blockquote>");
    expect(html).not.toContain("<blockquote>\n");
    expect(html).not.toContain("\n</blockquote>");
  });

  test("mdToTelegramHtml automatically promotes long blockquotes to expandable", () => {
    const longQuote = "> " + "This is a very long blockquote line that exceeds the standard single preview threshold. ".repeat(4);
    const html = mdToTelegramHtml(longQuote);
    expect(html).toContain("<blockquote expandable>");
  });

  test("mdToTelegramHtml preserves direct HTML tags (b, i, u, s, code) without escaping to entities", () => {
    const rawHtml = '✨ <b>Премиум-стиль активирован!</b> 💎\n<i>Курсив</i> и <code>консоль</code> & 1 < 2';
    const res = mdToTelegramHtml(rawHtml);
    expect(res).toContain("<b>Премиум-стиль активирован!</b>");
    expect(res).toContain("<i>Курсив</i>");
    expect(res).toContain("<code>консоль</code>");
    expect(res).toContain("&amp; 1 &lt; 2");
    expect(res).not.toContain("&lt;b&gt;");
  });
});
