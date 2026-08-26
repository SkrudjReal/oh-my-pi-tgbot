/**
 * Resilient, high-performance Telegram Bot API HTTP client.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  TelegramBotCommand,
  TelegramBotCommandScope,
  TelegramFile,
  TelegramInlineKeyboardMarkup,
  TelegramMessage,
  TelegramReactionType,
  TelegramUpdate,
  TelegramUser,
} from "../core/types";

export interface SendMessageOptions {
  message_thread_id?: number;
  parse_mode?: "HTML" | "MarkdownV2" | "Markdown";
  disable_web_page_preview?: boolean;
  reply_to_message_id?: number;
  reply_markup?: TelegramInlineKeyboardMarkup;
}

export interface EditMessageOptions {
  parse_mode?: "HTML" | "MarkdownV2" | "Markdown";
  disable_web_page_preview?: boolean;
  reply_markup?: TelegramInlineKeyboardMarkup;
}

class TelegramApiError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

export class TelegramClient {
  private readonly baseUrl: string;
  private readonly fileBaseUrl: string;

  constructor(private readonly token: string) {
    if (!token) {
      throw new Error("TelegramClient requires a non-empty bot token.");
    }
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.fileBaseUrl = `https://api.telegram.org/file/bot${token}`;
  }

  private async wait(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason;
    await new Promise<void>((resolve, reject) => {
      const onDone = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      const timer = setTimeout(onDone, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal?.reason ?? new Error("Request aborted."));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  private async request<T>(
    endpoint: string,
    body?: Record<string, unknown>,
    retries = 3,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const bodyTimeout = endpoint === "getUpdates" ? Number(body?.timeout || 0) * 1000 : 0;
        const timeoutSignal = AbortSignal.timeout(Math.max(30_000, bodyTimeout + 10_000));
        const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
          signal: requestSignal,
        });

        const data = (await response.json()) as {
          ok: boolean;
          result: T;
          description?: string;
          error_code?: number;
          parameters?: { retry_after?: number };
        };

        if (data.ok) {
          return data.result;
        }

        // Handle Telegram 429 Rate Limit
        if (data.error_code === 429 && data.parameters?.retry_after) {
          const waitMs = (data.parameters.retry_after + 1) * 1000;
          await this.wait(Math.min(waitMs, 60_000), signal);
          continue;
        }

        // Catch message not modified or message to edit not found gracefully
        if (
          data.description?.includes("message is not modified") ||
          data.description?.includes("message to edit not found")
        ) {
          return null as unknown as T;
        }

        throw new TelegramApiError(
          `Telegram API [${endpoint}] error (${data.error_code}): ${data.description}`,
          response.status >= 500,
        );
      } catch (err: unknown) {
        if (signal?.aborted) {
          throw err;
        }
        if (err instanceof TelegramApiError && !err.retryable) {
          throw err;
        }
        if (attempt === retries - 1) {
          throw err;
        }
        await this.wait(1000 * (attempt + 1), signal);
      }
    }
    throw new Error(`Telegram API [${endpoint}] failed after ${retries} attempts.`);
  }

  async getMe(signal?: AbortSignal): Promise<TelegramUser> {
    return this.request<TelegramUser>("getMe", undefined, 3, signal);
  }

  async getUpdates(options: {
    offset?: number;
    limit?: number;
    timeout?: number;
    allowed_updates?: string[];
  }, signal?: AbortSignal): Promise<TelegramUpdate[]> {
    return this.request<TelegramUpdate[]>("getUpdates", options, 3, signal);
  }

  async sendMessage(
    chat_id: number | string,
    text: string,
    options?: SendMessageOptions,
    signal?: AbortSignal,
  ): Promise<TelegramMessage> {
    return this.request<TelegramMessage>(
      "sendMessage",
      {
        chat_id,
        text,
        ...options,
      },
      3,
      signal,
    );
  }

  async editMessageText(
    chat_id: number | string,
    message_id: number,
    text: string,
    options?: EditMessageOptions,
    signal?: AbortSignal,
  ): Promise<TelegramMessage | boolean> {
    return this.request<TelegramMessage | boolean>(
      "editMessageText",
      {
        chat_id,
        message_id,
        text,
        ...options,
      },
      3,
      signal,
    );
  }

  async deleteMessage(chat_id: number | string, message_id: number, signal?: AbortSignal): Promise<boolean> {
    try {
      return await this.request<boolean>("deleteMessage", { chat_id, message_id }, 3, signal);
    } catch {
      return false;
    }
  }

  async sendChatAction(
    chat_id: number | string,
    action: "typing" | "upload_photo" | "record_video" | "upload_video" | "record_voice" | "upload_voice" | "upload_document" | "choose_sticker" | "find_location",
    options?: { message_thread_id?: number },
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      return await this.request<boolean>("sendChatAction", { chat_id, action, ...options }, 1, signal);
    } catch {
      return false;
    }
  }

  async setMessageReaction(
    chat_id: number | string,
    message_id: number,
    reaction: TelegramReactionType[],
    is_big = false,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      return await this.request<boolean>(
        "setMessageReaction",
        {
          chat_id,
          message_id,
          reaction,
          is_big,
        },
        2,
        signal,
      );
    } catch {
      return false;
    }
  }

  async sendSticker(
    chat_id: number | string,
    sticker: string,
    options?: { message_thread_id?: number; reply_to_message_id?: number },
    signal?: AbortSignal,
  ): Promise<TelegramMessage> {
    return this.request<TelegramMessage>("sendSticker", { chat_id, sticker, ...options }, 2, signal);
  }

  async sendPhoto(
    chat_id: number | string,
    photo: string,
    caption?: string,
    options?: SendMessageOptions,
    signal?: AbortSignal,
  ): Promise<TelegramMessage> {
    return this.request<TelegramMessage>(
      "sendPhoto",
      {
        chat_id,
        photo,
        caption,
        ...options,
      },
      3,
      signal,
    );
  }

  async sendDocument(
    chat_id: number | string,
    document: string,
    caption?: string,
    options?: SendMessageOptions,
    signal?: AbortSignal,
  ): Promise<TelegramMessage> {
    return this.request<TelegramMessage>(
      "sendDocument",
      {
        chat_id,
        document,
        caption,
        ...options,
      },
      3,
      signal,
    );
  }

  async setMyCommands(
    commands: TelegramBotCommand[],
    scope?: TelegramBotCommandScope,
    language_code?: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.request<boolean>(
      "setMyCommands",
      {
        commands,
        scope,
        language_code,
      },
      3,
      signal,
    );
  }

  async deleteMyCommands(
    scope?: TelegramBotCommandScope,
    language_code?: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.request<boolean>(
      "deleteMyCommands",
      {
        scope,
        language_code,
      },
      3,
      signal,
    );
  }

  async answerCallbackQuery(
    callback_query_id: string,
    options?: { text?: string; show_alert?: boolean; url?: string; cache_time?: number },
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      return await this.request<boolean>(
        "answerCallbackQuery",
        {
          callback_query_id,
          ...options,
        },
        2,
        signal,
      );
    } catch {
      return false;
    }
  }

  async getChat(chat_id: number | string, signal?: AbortSignal): Promise<any> {
    return this.request<any>("getChat", { chat_id }, 3, signal);
  }

  async getChatMember(chat_id: number | string, user_id: number, signal?: AbortSignal): Promise<any> {
    return this.request<any>("getChatMember", { chat_id, user_id }, 3, signal);
  }

  async getFile(file_id: string, signal?: AbortSignal): Promise<TelegramFile> {
    return this.request<TelegramFile>("getFile", { file_id }, 3, signal);
  }

  async downloadFile(
    file_id: string,
    destinationPath: string,
    maxBytes: number,
    signal?: AbortSignal,
  ): Promise<string> {
    const file = await this.getFile(file_id, signal);
    if (!file.file_path) {
      throw new Error("Telegram did not return a downloadable file path.");
    }
    if (file.file_size !== undefined && file.file_size > maxBytes) {
      throw new Error("Telegram attachment exceeds the configured size limit.");
    }

    const downloadUrl = `${this.fileBaseUrl}/${file.file_path}`;
    const timeoutSignal = AbortSignal.timeout(60_000);
    const downloadSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    const response = await fetch(downloadUrl, { signal: downloadSignal });
    if (!response.ok) {
      throw new Error(`Telegram file download failed with HTTP ${response.status}.`);
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error("Telegram attachment exceeds the configured size limit.");
    }
    if (!response.body) {
      throw new Error("Telegram file download returned an empty response.");
    }

    await fs.mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
    const handle = await fs.open(destinationPath, "wx", 0o600);
    let completed = false;
    try {
      const reader = response.body.getReader();
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          throw new Error("Telegram attachment exceeds the configured size limit.");
        }
        let offset = 0;
        while (offset < value.byteLength) {
          const { bytesWritten } = await handle.write(
            value,
            offset,
            value.byteLength - offset,
            null,
          );
          offset += bytesWritten;
        }
      }
      completed = true;
      return destinationPath;
    } finally {
      await handle.close();
      if (!completed) {
        await fs.rm(destinationPath, { force: true });
      }
    }
  }
}
