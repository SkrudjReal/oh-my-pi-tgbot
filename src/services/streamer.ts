/**
 * Live Telegram Streaming & Message Consumer.
 * Handles progressive Telegram message edits, live tool status updates,
 * reaction dispatching, sticker handling, and chunked delivery.
 */

import type { TelegramClient } from "../bot/telegram-client";
import type { TelegramMessage, TelegramReactionType } from "../core/types";
import {
  extractReactions,
  extractStickers,
  escapeHtml,
  mdToTelegramHtml,
  splitTelegramText,
  stripDeliveryTags,
  stripThinkTags,
} from "./formatter";

export interface StreamerOptions {
  chatId: number;
  messageThreadId?: number;
  replyToMessageId?: number;
  client: TelegramClient;
  enableStreaming?: boolean;
  enableReactions?: boolean;
  enableStickers?: boolean;
  debounceMs?: number;
}

export class TelegramStreamConsumer {
  private readonly chatId: number;
  private readonly messageThreadId?: number;
  private readonly replyToMessageId?: number;
  private readonly client: TelegramClient;
  private readonly enableStreaming: boolean;
  private readonly enableReactions: boolean;
  private readonly enableStickers: boolean;
  private readonly debounceMs: number;

  private activeToolName: string | null = null;
  private activeToolIntent: string | null = null;
  private completedTools: string[] = [];
  private accumulatedText = "";
  private sentMessage: TelegramMessage | null = null;
  private editTimer: Timer | null = null;
  private typingTimer: Timer | null = null;
  private isFinalized = false;
  private lastRenderedHtml = "";
  private abortController: AbortController = new AbortController();
  private static globalMessageCounter = 0;

  constructor(options: StreamerOptions) {
    this.chatId = options.chatId;
    this.messageThreadId = options.messageThreadId;
    this.replyToMessageId = options.replyToMessageId;
    this.client = options.client;
    this.enableStreaming = options.enableStreaming ?? true;
    this.enableReactions = options.enableReactions ?? true;
    this.enableStickers = options.enableStickers ?? true;
    this.debounceMs = options.debounceMs ?? 1200;
  }

  async start(): Promise<void> {
    this.startTypingLoop();

    if (this.enableStreaming) {
      try {
        this.sentMessage = await this.client.sendMessage(
          this.chatId,
          "⚡ <i>Thinking...</i>",
          {
            message_thread_id: this.messageThreadId,
            reply_to_message_id: this.replyToMessageId,
            parse_mode: "HTML",
          },
          this.abortController.signal,
        );
      } catch {
        // Ignored, will retry on first content push
      }
    }
  }

  private startTypingLoop(): void {
    const sendTyping = () => {
      if (this.isFinalized) return;
      void this.client.sendChatAction(
        this.chatId,
        "typing",
        { message_thread_id: this.messageThreadId },
        this.abortController.signal,
      );
    };

    sendTyping();
    this.typingTimer = setInterval(sendTyping, 4500);
  }

  private stopTypingLoop(): void {
    if (this.typingTimer) {
      clearInterval(this.typingTimer);
      this.typingTimer = null;
    }
  }

  onTurnStart(): void {
    this.scheduleRender();
  }

  onToolStart(toolName: string, args: Record<string, unknown>, intent?: string): void {
    this.activeToolName = toolName;
    this.activeToolIntent = intent || this.formatToolIntent(toolName, args);
    this.scheduleRender();
  }

  onToolEnd(toolName: string, _result?: unknown, isError?: boolean): void {
    if (this.activeToolIntent) {
      const icon = isError ? "⚠️" : "✓";
      this.completedTools.push(`${icon} ${this.activeToolIntent}`);
      if (this.completedTools.length > 20) {
        this.completedTools.splice(0, this.completedTools.length - 20);
      }
    }
    this.activeToolName = null;
    this.activeToolIntent = null;
    this.scheduleRender();
  }

  onTextDelta(delta: string): void {
    this.accumulatedText += delta;
    this.scheduleRender();
  }

  private formatToolIntent(name: string, args: Record<string, unknown>): string {
    switch (name) {
      case "bash":
        return `bash: ${String(args.command || "").slice(0, 40)}`;
      case "read":
        return `read: ${String(args.path || "").slice(0, 35)}`;
      case "edit":
        return "edit file";
      case "write":
        return `write: ${String(args.path || "").slice(0, 35)}`;
      case "grep":
        return `grep: ${String(args.pattern || "").slice(0, 30)}`;
      case "glob":
        return `glob: ${String(args.path || "").slice(0, 30)}`;
      case "web_search":
        return `search: ${String(args.query || "").slice(0, 30)}`;
      case "task":
        return "running subagents";
      default:
        return name;
    }
  }

  private scheduleRender(): void {
    if (!this.enableStreaming || this.isFinalized) return;
    if (this.editTimer) return;

    this.editTimer = setTimeout(() => {
      this.editTimer = null;
      void this.renderProgress();
    }, this.debounceMs);
  }

  private buildProgressHtml(): string {
    const parts: string[] = [];

    // 1. Show active / recent tools
    if (this.completedTools.length > 0) {
      const recent = this.completedTools.slice(-3);
      for (const t of recent) {
        parts.push(`<code>${escapeHtml(t)}</code>`);
      }
    }

    if (this.activeToolName && this.activeToolIntent) {
      parts.push(`⚙️ <b>Running:</b> <code>${escapeHtml(this.activeToolIntent)}</code>`);
    }

    // 2. Clean streamed text
    const cleanText = stripThinkTags(this.accumulatedText);
    const bodyHtml = mdToTelegramHtml(cleanText);

    if (bodyHtml) {
      if (parts.length > 0) {
        parts.push("");
      }
      parts.push(bodyHtml);
    } else if (parts.length === 0) {
      parts.push("⚡ <i>Thinking...</i>");
    }

    return parts.join("\n");
  }

  private async renderProgress(): Promise<void> {
    if (this.isFinalized) return;

    const html = this.buildProgressHtml();
    if (!html || html === this.lastRenderedHtml) return;

    // Keep under limit for progressive rendering
    const chunk = splitTelegramText(html, 3800)[0];
    this.lastRenderedHtml = chunk;

    try {
      if (!this.sentMessage) {
        this.sentMessage = await this.client.sendMessage(
          this.chatId,
          chunk,
          {
            message_thread_id: this.messageThreadId,
            reply_to_message_id: this.replyToMessageId,
            parse_mode: "HTML",
          },
          this.abortController.signal,
        );
      } else {
        await this.client.editMessageText(
          this.chatId,
          this.sentMessage.message_id,
          chunk,
          { parse_mode: "HTML" },
          this.abortController.signal,
        );
      }
    } catch {
      // Ignore intermediate render errors (e.g. temporary parse errors or 429)
    }
  }

  async finalize(): Promise<void> {
    if (this.isFinalized) return;
    this.isFinalized = true;

    this.stopTypingLoop();
    if (this.editTimer) {
      clearTimeout(this.editTimer);
      this.editTimer = null;
    }

    const rawText = this.accumulatedText;

    // 1. Extract and dispatch reactions (strictly 1 in 10 messages, and only ❤, 👍, 🔥, 👎)
    TelegramStreamConsumer.globalMessageCounter++;
    if (this.enableReactions && this.replyToMessageId) {
      const reactions = extractReactions(rawText);
      if (reactions.length > 0 && TelegramStreamConsumer.globalMessageCounter % 10 === 0) {
        const reactionObjs: TelegramReactionType[] = reactions.slice(0, 1).map((emoji) => ({
          type: "emoji",
          emoji,
        }));
        void this.client
          .setMessageReaction(this.chatId, this.replyToMessageId, reactionObjs)
          .catch(() => false);
      }
    }

    // 2. Extract and dispatch stickers
    if (this.enableStickers) {
      const stickers = extractStickers(rawText);
      for (const sticker of stickers.slice(0, 2)) {
        void this.client
          .sendSticker(this.chatId, sticker, {
            message_thread_id: this.messageThreadId,
            reply_to_message_id: this.replyToMessageId,
          })
          .catch(() => undefined);
      }
    }

    // 3. Prepare final text without control tags
    const cleanRaw = stripDeliveryTags(rawText);
    const cleanFinal = stripThinkTags(cleanRaw);
    let finalHtml = mdToTelegramHtml(cleanFinal);

    if (!finalHtml || finalHtml.trim() === "") {
      finalHtml = "<i>(Done)</i>";
    }

    // 4. Split into chunks if exceeds Telegram 4096 limit
    const chunks = splitTelegramText(finalHtml, 3800);

    try {
      if (this.sentMessage) {
        // Edit first message with chunk 0
        await this.client.editMessageText(
          this.chatId,
          this.sentMessage.message_id,
          chunks[0] || "<i>(Done)</i>",
          { parse_mode: "HTML" },
        );

        // Send any overflow chunks as new messages
        for (let i = 1; i < chunks.length; i++) {
          await this.client.sendMessage(this.chatId, chunks[i], {
            message_thread_id: this.messageThreadId,
            reply_to_message_id: this.sentMessage.message_id,
            parse_mode: "HTML",
          });
        }
      } else {
        // Send all chunks
        for (const chunk of chunks) {
          await this.client.sendMessage(this.chatId, chunk, {
            message_thread_id: this.messageThreadId,
            reply_to_message_id: this.replyToMessageId,
            parse_mode: "HTML",
          });
        }
      }
    } catch {
      // Fallback: send as unformatted plain text if HTML was somehow rejected
      const characters = Array.from(cleanFinal || "(No output)");
      const plainChunks: string[] = [];
      for (let i = 0; i < characters.length; i += 3800) {
        plainChunks.push(characters.slice(i, i + 3800).join(""));
      }
      if (this.sentMessage) {
        await this.client.editMessageText(this.chatId, this.sentMessage.message_id, plainChunks[0]);
        for (let i = 1; i < plainChunks.length; i++) {
          await this.client.sendMessage(this.chatId, plainChunks[i], {
            message_thread_id: this.messageThreadId,
            reply_to_message_id: this.sentMessage.message_id,
          });
        }
      } else {
        for (const plainChunk of plainChunks) {
          await this.client.sendMessage(this.chatId, plainChunk, {
            message_thread_id: this.messageThreadId,
            reply_to_message_id: this.replyToMessageId,
          });
        }
      }
    }
  }

  abort(): void {
    this.isFinalized = true;
    this.stopTypingLoop();
    if (this.editTimer) {
      clearTimeout(this.editTimer);
      this.editTimer = null;
    }
    this.abortController.abort();
  }
}
