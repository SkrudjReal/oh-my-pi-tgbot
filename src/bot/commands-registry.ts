/**
 * Telegram Bot Command Menu Registration.
 * Configures the native Telegram command popup menu for users and owners.
 */

import type { BotConfig } from "../core/config";
import type { TelegramBotCommand } from "../core/types";
import type { TelegramClient } from "./telegram-client";

export const OWNER_COMMANDS: TelegramBotCommand[] = [
  { command: "start", description: "🚀 Главное меню и статус" },
  { command: "new", description: "🧹 Сбросить контекст диалога" },
  { command: "model", description: "🎯 Сменить модель LLM" },
  { command: "models", description: "📋 Модели текущего OMP-профиля" },
  { command: "mode", description: "🛡 Режим аппрува инструментов" },
  { command: "thinking", description: "🧠 Уровень размышлений (thinking)" },
  { command: "effort", description: "⚡ Effort выбранной модели" },
  { command: "status", description: "📊 Статус сессии и расход токенов" },
  { command: "tools", description: "🛠 Список инструментов агента" },
  { command: "topic", description: "🧵 Управление топиками супергрупп" },
  { command: "cancel", description: "🛑 Прервать текущую задачу" },
  { command: "help", description: "📖 Полное руководство и команды" },
  { command: "workspace", description: "📁 Воркспейс и файлы чата" },
  { command: "stats", description: "📈 Расширенная аналитика" },
];

export async function setBotCommands(client: TelegramClient, config: BotConfig): Promise<void> {
  try {
    // Remove public command discovery, then publish commands only in the owner's private chat.
    await client.deleteMyCommands({ type: "default" });
    await client.deleteMyCommands({ type: "all_private_chats" });
    await client.deleteMyCommands({ type: "all_group_chats" });
    await client.deleteMyCommands({ type: "all_chat_administrators" });
    await client.setMyCommands(OWNER_COMMANDS, {
      type: "chat",
      chat_id: config.botOwnerId,
    });
    console.log(`✨ Registered owner-only command menu for ID: ${config.botOwnerId}`);

    console.log("✅ Telegram command menu successfully configured.");
  } catch (err) {
    console.error("Failed to register Telegram bot commands:", err);
  }
}

export async function delBotCommands(client: TelegramClient, config: BotConfig): Promise<void> {
  try {
    await client.deleteMyCommands({ type: "default" });
    await client.deleteMyCommands({ type: "all_private_chats" });
    await client.deleteMyCommands({ type: "all_group_chats" });
    await client.deleteMyCommands({ type: "all_chat_administrators" });

    await client.deleteMyCommands({ type: "chat", chat_id: config.botOwnerId });
  } catch (err) {
    console.error("Failed to delete Telegram bot commands:", err);
  }
}
