import { describe, expect, test } from "bun:test";
import type { TelegramClient } from "../src/bot/telegram-client";
import type { TelegramMessage } from "../src/core/types";
import { AttachmentLimitError, extractMessageContext } from "../src/services/attachments";

describe("Attachment limits", () => {
  test("rejects an oversized document before attempting a download", async () => {
    let downloads = 0;
    const client = {
      downloadFile: async () => {
        downloads++;
        return "unused";
      },
    } as unknown as TelegramClient;
    const message: TelegramMessage = {
      message_id: 1,
      date: 0,
      from: { id: 1, is_bot: false, first_name: "Owner" },
      chat: { id: 1, type: "private" },
      document: {
        file_id: "file",
        file_unique_id: "unique",
        file_name: "large.bin",
        file_size: 2048,
      },
    };

    await expect(
      extractMessageContext(message, "/tmp/unused-workspace", client, {
        maxInputChars: 1000,
        maxAttachmentBytes: 1024,
      }),
    ).rejects.toBeInstanceOf(AttachmentLimitError);
    expect(downloads).toBe(0);
  });
});
