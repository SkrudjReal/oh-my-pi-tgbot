#!/usr/bin/env bun
/**
 * OMP Telegram Bot CLI entry point and library exports.
 */

import { type BotConfig, loadConfig } from "./core/config";
import { OmpTelegramBot } from "./bot/bot";
export { TelegramClient } from "./bot/telegram-client";
export { AgentBridge } from "./services/agent-bridge";
export { TelegramStreamConsumer } from "./services/streamer";
export {
  escapeHtml,
  extractReactions,
  extractStickers,
  mdToTelegramHtml,
  splitTelegramText,
  stripDeliveryTags,
  stripThinkTags,
  wrapMarkdownTables,
} from "./services/formatter";
export { loadConfig } from "./core/config";
export { F, authenticateUpdate } from "./bot/middlewares";
export { OmpTelegramBot } from "./bot/bot";

export function parseCliFlags(argv: string[]): Partial<BotConfig> {
  const overrides: Partial<BotConfig> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--token" || arg.startsWith("--token=")) {
      throw new Error("Pass TELEGRAM_BOT_TOKEN through the environment, not process arguments.");
    } else if (arg.startsWith("--owner=") || arg.startsWith("--owner-id=")) {
      overrides.botOwnerId = Number(arg.split("=")[1]);
    } else if ((arg === "--owner" || arg === "--owner-id") && argv[i + 1]) {
      overrides.botOwnerId = Number(argv[++i]);
    } else if (arg.startsWith("--model=")) {
      overrides.defaultModel = arg.split("=")[1];
    } else if (arg === "--model" && argv[i + 1]) {
      overrides.defaultModel = argv[++i];
    } else if (arg.startsWith("--workspace=")) {
      overrides.workspaceRoot = arg.split("=")[1];
    } else if (arg === "--workspace" && argv[i + 1]) {
      overrides.workspaceRoot = argv[++i];
    } else if (arg === "--public" || arg === "--allow-all") {
      throw new Error("Public mode is disabled: this bot is owner-only.");
    } else if (arg === "--yolo" || arg === "--auto-approve") {
      overrides.defaultApprovalMode = "yolo";
    }
  }
  return overrides;
}

export async function runTelegramBotCli(argv = process.argv.slice(2)): Promise<void> {
  const overrides = parseCliFlags(argv);
  const config = loadConfig(overrides);

  if (!config.telegramToken) {
    console.error("❌ Error: TELEGRAM_BOT_TOKEN is required.");
    console.error("Provide it via .env or the TELEGRAM_BOT_TOKEN environment variable.");
    process.exit(1);
  }

  const bot = new OmpTelegramBot(config);

  process.on("SIGINT", () => {
    console.log("\nReceived SIGINT. Shutting down gracefully...");
    bot.stop();
  });

  process.on("SIGTERM", () => {
    console.log("\nReceived SIGTERM. Shutting down gracefully...");
    bot.stop();
  });

  await bot.start();
}

if (import.meta.main) {
  void runTelegramBotCli();
}
