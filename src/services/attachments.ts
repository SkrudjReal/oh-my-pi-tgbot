/**
 * Inbound Telegram attachment extractor & context builder.
 * Downloads photos, documents, and audio into the chat's workspace,
 * builds rich prompt context with file references and reply quotes.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { TelegramClient } from "../bot/telegram-client";
import type { TelegramMessage } from "../core/types";

export interface ExtractedMessageContext {
  promptText: string;
  hasMedia: boolean;
  downloadedFiles: string[];
}

export interface AttachmentLimits {
  maxInputChars: number;
  maxAttachmentBytes: number;
}

export class AttachmentLimitError extends Error {}

function assertAttachmentSize(fileSize: number | undefined, maxBytes: number): void {
  if (fileSize !== undefined && fileSize > maxBytes) {
    throw new AttachmentLimitError(
      `Вложение превышает лимит ${Math.floor(maxBytes / (1024 * 1024))} МБ.`,
    );
  }
}

export async function extractMessageContext(
  message: TelegramMessage,
  workspaceDir: string,
  client: TelegramClient,
  limits: AttachmentLimits,
  signal?: AbortSignal,
): Promise<ExtractedMessageContext> {
  const parts: string[] = [];
  const downloadedFiles: string[] = [];
  const downloadsDir = path.join(workspaceDir, "downloads");
  const bodyText = message.text || message.caption || "";
  if (bodyText.length > limits.maxInputChars) {
    throw new AttachmentLimitError(`Сообщение превышает лимит ${limits.maxInputChars} символов.`);
  }

  // 1. Reply context
  if (message.reply_to_message) {
    const reply = message.reply_to_message;
    const author = reply.from?.username ? `@${reply.from.username}` : reply.from?.first_name || "User";
    const text = (reply.text || reply.caption || "(media)").slice(0, limits.maxInputChars);
    parts.push(`[In reply to ${author}: "${text}"]\n`);
  }

  // 2. Photos
  if (message.photo && message.photo.length > 0) {
    const bestPhoto = message.photo[message.photo.length - 1];
    assertAttachmentSize(bestPhoto.file_size, limits.maxAttachmentBytes);
    const photoFilename = `photo_${Date.now()}_${bestPhoto.file_id.slice(-6)}.jpg`;
    const photoPath = path.join(downloadsDir, photoFilename);

    try {
      await client.downloadFile(bestPhoto.file_id, photoPath, limits.maxAttachmentBytes, signal);
      downloadedFiles.push(photoPath);
      const relPath = path.relative(workspaceDir, photoPath);
      parts.push(`[Attached Photo: @${relPath}]`);
    } catch (err) {
      if (err instanceof AttachmentLimitError || String(err).includes("size limit")) {
        throw new AttachmentLimitError("Фотография превышает допустимый размер.");
      }
      parts.push("[Attached Photo: download failed]");
    }
  }

  // 3. Documents
  if (message.document) {
    const doc = message.document;
    assertAttachmentSize(doc.file_size, limits.maxAttachmentBytes);
    const safeName = (doc.file_name || `doc_${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniquePrefix = `${Date.now()}_${doc.file_unique_id.slice(-8)}`;
    const docPath = path.join(downloadsDir, `${uniquePrefix}_${safeName}`);

    try {
      await client.downloadFile(doc.file_id, docPath, limits.maxAttachmentBytes, signal);
      downloadedFiles.push(docPath);
      const relPath = path.relative(workspaceDir, docPath);
      parts.push(`[Attached Document: @${relPath}]`);
    } catch (err) {
      if (err instanceof AttachmentLimitError || String(err).includes("size limit")) {
        throw new AttachmentLimitError("Документ превышает допустимый размер.");
      }
      parts.push("[Attached Document: download failed]");
    }
  }

  // 4. Voice / Audio
  if (message.voice || message.audio) {
    const audio = message.voice || message.audio;
    if (audio) {
      assertAttachmentSize(audio.file_size, limits.maxAttachmentBytes);
      const ext = message.voice ? "ogg" : "mp3";
      const audioFilename = `audio_${Date.now()}.${ext}`;
      const audioPath = path.join(downloadsDir, audioFilename);

      try {
        await client.downloadFile(audio.file_id, audioPath, limits.maxAttachmentBytes, signal);
        downloadedFiles.push(audioPath);
        const relPath = path.relative(workspaceDir, audioPath);
        parts.push(`[Attached Voice/Audio: @${relPath}]`);
      } catch (err) {
        if (err instanceof AttachmentLimitError || String(err).includes("size limit")) {
          throw new AttachmentLimitError("Аудиофайл превышает допустимый размер.");
        }
        parts.push("[Attached Audio: download failed]");
      }
    }
  }

  // 5. Sticker
  if (message.sticker) {
    const s = message.sticker;
    parts.push(`[Sticker: ${s.emoji || "🎨"} (set: ${s.set_name || "unknown"})]`);
  }

  // 6. Text / Caption body
  if (bodyText.trim()) {
    parts.push(bodyText.trim());
  }

  const promptText = parts.join("\n").trim();
  if (promptText.length > limits.maxInputChars) {
    throw new AttachmentLimitError(`Контекст сообщения превышает лимит ${limits.maxInputChars} символов.`);
  }
  return {
    promptText,
    hasMedia: downloadedFiles.length > 0,
    downloadedFiles,
  };
}
