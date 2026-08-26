import { describe, expect, test } from "bun:test";
import type { TelegramMessage, TelegramUser } from "../src/core/types";
import { loadConfig } from "../src/core/config";
import { authenticateUpdate, F } from "../src/bot/middlewares";
import type { TelegramClient } from "../src/bot/telegram-client";
import type { TopicManager } from "../src/services/topics";

const OWNER_ID = 999888777;
const config = loadConfig({ telegramToken: "mock-token", botOwnerId: OWNER_ID });
const owner: TelegramUser = { id: OWNER_ID, is_bot: false, first_name: "Owner" };
const stranger: TelegramUser = { id: 111222333, is_bot: false, first_name: "Stranger" };

function message(from: TelegramUser, type: "private" | "supergroup" = "private"): TelegramMessage {
  return {
    message_id: 1,
    date: 0,
    from,
    text: "hello",
    chat: { id: type === "private" ? from.id : -100123, type },
    message_thread_id: type === "supergroup" ? 42 : undefined,
  };
}

describe("Strict owner-only middleware", () => {
  test("authorization predicates accept only the numeric owner ID", () => {
    expect(F.isOwner(owner, config)).toBe(true);
    expect(F.isAuthorized(owner, config)).toBe(true);
    expect(F.isAdmin(owner, config)).toBe(true);
    expect(F.isOwner(stranger, config)).toBe(false);
    expect(F.isAuthorized(stranger, config)).toBe(false);
    expect(F.isAdmin(stranger, config)).toBe(false);
    expect(F.isAuthorized(undefined, config)).toBe(false);
  });

  test("a group topic never bypasses owner authentication", async () => {
    let topicChecks = 0;
    const topicManager = {
      isTopicActive: async () => {
        topicChecks++;
        return true;
      },
    } as unknown as TopicManager;
    const client = { sendMessage: async () => ({}) } as unknown as TelegramClient;

    expect(await authenticateUpdate(message(stranger, "supergroup"), config, client, topicManager)).toBe(false);
    expect(topicChecks).toBe(0);
    expect(await authenticateUpdate(message(owner, "supergroup"), config, client, topicManager)).toBe(true);
    expect(topicChecks).toBe(1);
  });

  test("an unauthorized private user is rejected before routing", async () => {
    let replies = 0;
    const client = {
      sendMessage: async () => {
        replies++;
        return {};
      },
    } as unknown as TelegramClient;

    expect(await authenticateUpdate(message(stranger), config, client)).toBe(false);
    expect(replies).toBe(1);
  });
});
