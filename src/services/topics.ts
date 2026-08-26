/**
 * Telegram Forum Topics & Supergroup Thread Manager.
 * Persists and validates active topic bindings for isolated thread routing.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { TelegramClient } from "../bot/telegram-client";

export interface ActiveTopicEntry {
  chat_id: number;
  topic_id: number;
  chat_title: string;
  added_by: number;
  created_at: number;
}

export interface ParsedTopicLink {
  chatId: number;
  topicId: number;
}

export class TopicManager {
  private readonly storagePath: string;
  private readonly topics = new Map<string, ActiveTopicEntry>();
  private isLoaded = false;
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(storagePath?: string) {
    this.storagePath =
      storagePath || path.join(os.homedir(), ".omp", "active_topics.json");
  }

  private makeKey(chatId: number, topicId: number): string {
    return `${chatId}:${topicId}`;
  }

  async load(): Promise<void> {
    if (this.isLoaded) return;
    try {
      const data = await fs.readFile(this.storagePath, "utf-8");
      const parsed = JSON.parse(data) as { topics?: Record<string, ActiveTopicEntry> };
      if (parsed.topics) {
        for (const entry of Object.values(parsed.topics)) {
          if (
            Number.isSafeInteger(entry?.chat_id) &&
            Number.isSafeInteger(entry?.topic_id) &&
            entry.topic_id > 0 &&
            typeof entry.chat_title === "string" &&
            Number.isSafeInteger(entry.added_by) &&
            Number.isFinite(entry.created_at)
          ) {
            this.topics.set(this.makeKey(entry.chat_id, entry.topic_id), entry);
          }
        }
      }
    } catch {
      // File does not exist or empty, start fresh
    }
    this.isLoaded = true;
  }

  private async save(): Promise<void> {
    const snapshot = Array.from(this.topics.entries());
    this.saveQueue = this.saveQueue.catch(() => undefined).then(async () => {
      const obj: { topics: Record<string, ActiveTopicEntry> } = { topics: {} };
      for (const [key, entry] of snapshot) {
        obj.topics[key] = entry;
      }
      const parent = path.dirname(this.storagePath);
      const temporaryPath = `${this.storagePath}.${process.pid}.${randomUUID()}.tmp`;
      await fs.mkdir(parent, { recursive: true, mode: 0o700 });
      try {
        await fs.writeFile(temporaryPath, JSON.stringify(obj, null, 2), {
          encoding: "utf-8",
          mode: 0o600,
        });
        await fs.rename(temporaryPath, this.storagePath);
        await fs.chmod(this.storagePath, 0o600);
      } finally {
        await fs.rm(temporaryPath, { force: true });
      }
    });
    return this.saveQueue;
  }

  /**
   * Parses and normalizes Telegram internal forum topic URLs:
   * https://t.me/c/<chat_num>/<topic_id>
   */
  parseTopicLink(url: string): ParsedTopicLink | null {
    if (!url) return null;
    const clean = url.trim();

    // 1. Matches t.me/c/4488980222/5 or telegram.me/c/...
    const linkMatch = clean.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/c\/(\d+)\/(\d+)(?:[/?#].*)?$/i);
    if (linkMatch) {
      const chatNum = linkMatch[1];
      const topicId = Number(linkMatch[2]);
      const chatId = chatNum.startsWith("100")
        ? Number(`-${chatNum}`)
        : Number(`-100${chatNum}`);
      if (!Number.isSafeInteger(chatId) || chatId === 0 || !Number.isSafeInteger(topicId) || topicId <= 0) return null;
      return { chatId, topicId };
    }

    // 2. Matches raw format: -1004488980222:5 or 4488980222:5
    const rawMatch = clean.match(/^(-?\d+):(\d+)$/);
    if (rawMatch) {
      let chatId = Number(rawMatch[1]);
      if (chatId > 0) {
        chatId = String(chatId).startsWith("100")
          ? Number(`-${chatId}`)
          : Number(`-100${chatId}`);
      }
      const topicId = Number(rawMatch[2]);
      if (!Number.isSafeInteger(chatId) || chatId === 0 || !Number.isSafeInteger(topicId) || topicId <= 0) return null;
      return { chatId, topicId };
    }

    return null;
  }

  /**
   * Checks if bot is present in the specified supergroup chat.
   */
  async checkBotInChat(
    client: TelegramClient,
    chatId: number,
    botId: number,
  ): Promise<{ inChat: boolean; chatTitle?: string; error?: string }> {
    try {
      const chat = await client.getChat(chatId);
      const title = chat.title || `Chat ${chatId}`;

      const member = await client.getChatMember(chatId, botId);
      const status = member?.status;
      const inChat = status === "member" || status === "administrator" || status === "creator";

      return {
        inChat,
        chatTitle: title,
      };
    } catch (err) {
      return {
        inChat: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async addTopic(
    chatId: number,
    topicId: number,
    chatTitle: string,
    addedBy: number,
  ): Promise<ActiveTopicEntry> {
    await this.load();
    const entry: ActiveTopicEntry = {
      chat_id: chatId,
      topic_id: topicId,
      chat_title: chatTitle,
      added_by: addedBy,
      created_at: Date.now(),
    };
    this.topics.set(this.makeKey(chatId, topicId), entry);
    await this.save();
    return entry;
  }

  async removeTopic(chatId: number, topicId: number): Promise<boolean> {
    await this.load();
    const key = this.makeKey(chatId, topicId);
    if (this.topics.has(key)) {
      this.topics.delete(key);
      await this.save();
      return true;
    }
    return false;
  }

  async isTopicActive(chatId: number, topicId?: number): Promise<boolean> {
    await this.load();
    if (topicId === undefined) {
      // Check if any topic in this chat is active
      for (const entry of this.topics.values()) {
        if (entry.chat_id === chatId) return true;
      }
      return false;
    }
    return this.topics.has(this.makeKey(chatId, topicId));
  }

  async listTopics(): Promise<ActiveTopicEntry[]> {
    await this.load();
    return Array.from(this.topics.values());
  }
}
