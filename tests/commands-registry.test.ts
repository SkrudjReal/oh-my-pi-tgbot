import { describe, expect, test } from "bun:test";
import { OWNER_COMMANDS, setBotCommands } from "../src/bot/commands-registry";
import type { TelegramClient } from "../src/bot/telegram-client";
import { loadConfig } from "../src/core/config";

describe("Owner command registry", () => {
  test("contains only implemented owner commands and aliases", () => {
    const commands = OWNER_COMMANDS.map((command) => command.command);
    expect(commands).toContain("start");
    expect(commands).toContain("model");
    expect(commands).toContain("models");
    expect(commands).toContain("thinking");
    expect(commands).toContain("effort");
    expect(commands).toContain("status");
    expect(commands).toContain("stats");
    expect(commands).toContain("workspace");
    expect(commands).toContain("cancel");
    expect(commands).not.toContain("compact");
    expect(commands).not.toContain("skills");
  });

  test("publishes commands only to the owner's chat scope", async () => {
    const setScopes: unknown[] = [];
    const deletedScopes: unknown[] = [];
    const client = {
      setMyCommands: async (_commands: unknown, scope: unknown) => {
        setScopes.push(scope);
        return true;
      },
      deleteMyCommands: async (scope: unknown) => {
        deletedScopes.push(scope);
        return true;
      },
    } as unknown as TelegramClient;

    await setBotCommands(client, loadConfig({ telegramToken: "mock", botOwnerId: 424242 }));
    expect(setScopes).toEqual([{ type: "chat", chat_id: 424242 }]);
    expect(deletedScopes).toContainEqual({ type: "default" });
    expect(deletedScopes).toContainEqual({ type: "all_private_chats" });
    expect(deletedScopes).toContainEqual({ type: "all_group_chats" });
  });
});
