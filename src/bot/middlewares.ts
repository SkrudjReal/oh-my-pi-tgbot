/**
 * Magic Filters & Middleware Pipeline for OMP Telegram Bot.
 * Enforces strict Owner, ACL & Forum Topic isolation boundaries.
 */

import type { BotConfig } from "../core/config";
import type { TelegramMessage, TelegramUser } from "../core/types";
import type { TopicManager } from "../services/topics";
import type { TelegramClient } from "./telegram-client";

/**
 * Magic Filter predicates (inspired by aiogram Magic Filters F).
 */
export const F = {
  isOwner: (user: TelegramUser | undefined, config: BotConfig): boolean => {
    if (!user) return false;
    return user.id === config.botOwnerId;
  },

  isAdmin: (user: TelegramUser | undefined, config: BotConfig): boolean => {
    return F.isOwner(user, config);
  },

  isAuthorized: (user: TelegramUser | undefined, config: BotConfig): boolean => {
    return F.isOwner(user, config);
  },

  isPrivateChat: (message: TelegramMessage): boolean => {
    return message.chat.type === "private";
  },

  isGroupChat: (message: TelegramMessage): boolean => {
    return message.chat.type === "group" || message.chat.type === "supergroup";
  },

  hasCommand: (message: TelegramMessage, commandName: string): boolean => {
    const text = (message.text || message.caption || "").trim();
    if (!text.startsWith("/")) return false;
    const cmd = text.split(/\s+/)[0].toLowerCase().split("@")[0];
    return cmd === `/${commandName.toLowerCase().replace(/^\//, "")}`;
  },
};

/**
 * Strict Owner, ACL & Topic Authentication Middleware.
 * Intercepts incoming messages before any command or agent execution.
 */
export async function authenticateUpdate(
  message: TelegramMessage,
  config: BotConfig,
  client: TelegramClient,
  topicManager?: TopicManager,
): Promise<boolean> {
  const user = message.from;
  const isPrivate = F.isPrivateChat(message);

  if (!F.isOwner(user, config)) {
    console.warn(`Unauthorized Telegram update rejected: user=${user?.id ?? "unknown"} chat=${message.chat.id}`);

    if (isPrivate) {
      try {
        await client.sendMessage(
          message.chat.id,
          '<blockquote><b>Доступ запрещён.</b> Бот доступен только владельцу.</blockquote>',
          {
            reply_to_message_id: message.message_id,
            parse_mode: "HTML",
          },
        );
      } catch {
        // Do not let an error response bypass or disrupt authentication.
      }
    }
    return false;
  }

  // 1. Group / Forum Supergroup Thread Routing
  if (!isPrivate) {
    const text = (message.text || message.caption || "").trim();
    // Allow topic management commands from admins/owners
    if (F.hasCommand(message, "topic") || F.hasCommand(message, "topics")) {
      return true;
    }

    // Check if the current thread/topic is registered and active
    if (topicManager) {
      const isTopicActive = await topicManager.isTopicActive(
        message.chat.id,
        message.message_thread_id,
      );
      if (!isTopicActive) {
        // Silently drop messages from unconfigured group threads
        return false;
      }
    }
    return true;
  }

  return true;
}
