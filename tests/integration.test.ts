import { afterEach, describe, expect, test } from "bun:test";
import { TelegramClient } from "../src/bot/telegram-client";
import { loadConfig } from "../src/core/config";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Telegram Client & Config", () => {
  test("getMe parses a mocked Telegram response without network access", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          result: { id: 123456789, is_bot: true, first_name: "Test Bot", username: "test_bot" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const client = new TelegramClient("123456:TEST_TOKEN_FOR_MOCK_ONLY");
    const me = await client.getMe();
    expect(me.is_bot).toBe(true);
    expect(me.id).toBe(123456789);
    expect(me.username).toBe("test_bot");
  });

  test("loadConfig requires and preserves a valid owner ID", () => {
    const config = loadConfig({
      telegramToken: "mock-token",
      botOwnerId: 123456789,
      defaultModel: "google-antigravity/gemini-3.7-flash",
    });

    expect(config.telegramToken).toBe("mock-token");
    expect(config.botOwnerId).toBe(123456789);
    expect(config.maxInputChars).toBeGreaterThan(0);
    expect(config.maxAttachmentBytes).toBeGreaterThan(0);
  });

  test("loadConfig rejects an invalid owner ID", () => {
    expect(() =>
      loadConfig({
        telegramToken: "mock-token",
        botOwnerId: Number.NaN,
      }),
    ).toThrow("BOT_OWNER_ID");
  });

  test("does not retry non-retryable Telegram 4xx responses", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(
        JSON.stringify({ ok: false, error_code: 400, description: "Bad Request" }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const client = new TelegramClient("123456:TEST_TOKEN_FOR_MOCK_ONLY");
    await expect(client.getMe()).rejects.toThrow("Bad Request");
    expect(calls).toBe(1);
  });
});
