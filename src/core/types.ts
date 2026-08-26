/**
 * Core type definitions for OMP Telegram Bot bridge.
 */

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_forum?: boolean;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramSticker {
  file_id: string;
  file_unique_id: string;
  type?: string;
  width: number;
  height: number;
  is_animated?: boolean;
  is_video?: boolean;
  emoji?: string;
  set_name?: string;
  file_size?: number;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramAudio {
  file_id: string;
  file_unique_id: string;
  duration: number;
  performer?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessageEntity {
  type: "mention" | "hashtag" | "cashtag" | "bot_command" | "url" | "email" | "phone_number" | "bold" | "italic" | "underline" | "strikethrough" | "spoiler" | "blockquote" | "code" | "pre" | "text_link" | "text_mention" | "custom_emoji";
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
  language?: string;
  custom_emoji_id?: string;
}

export interface TelegramMessage {
  message_id: number;
  message_thread_id?: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  date: number;
  chat: TelegramChat;
  forward_from?: TelegramUser;
  forward_from_chat?: TelegramChat;
  reply_to_message?: TelegramMessage;
  text?: string;
  entities?: TelegramMessageEntity[];
  caption?: string;
  caption_entities?: TelegramMessageEntity[];
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  sticker?: TelegramSticker;
  voice?: TelegramVoice;
  audio?: TelegramAudio;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export interface TelegramReactionTypeEmoji {
  type: "emoji";
  emoji: string;
}

export interface TelegramReactionTypeCustomEmoji {
  type: "custom_emoji";
  custom_emoji_id: string;
}

export type TelegramReactionType = TelegramReactionTypeEmoji | TelegramReactionTypeCustomEmoji;

export interface TelegramBotCommand {
  command: string;
  description: string;
}

export type TelegramBotCommandScope =
  | { type: "default" }
  | { type: "all_private_chats" }
  | { type: "all_group_chats" }
  | { type: "all_chat_administrators" }
  | { type: "chat"; chat_id: number | string }
  | { type: "chat_administrators"; chat_id: number | string }
  | { type: "chat_member"; chat_id: number | string; user_id: number };

// ==========================================
// OMP Agent JSON-Streaming Event Definitions
// ==========================================

export interface OmpTurnStartEvent {
  type: "turn_start";
}

export interface OmpTurnEndEvent {
  type: "turn_end";
  message?: {
    role: "assistant";
    content: Array<{
      type: "text" | "toolCall";
      text?: string;
    }>;
    usage?: {
      input: number;
      output: number;
      totalTokens: number;
      cost?: {
        total?: number;
      };
    };
    duration?: number;
  };
}

export interface OmpToolExecutionStartEvent {
  type: "tool_execution_start";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  intent?: string;
}

export interface OmpToolExecutionUpdateEvent {
  type: "tool_execution_update";
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  partialResult?: {
    content?: Array<{
      type: string;
      text?: string;
    }>;
  };
}

export interface OmpToolExecutionEndEvent {
  type: "tool_execution_end";
  toolCallId: string;
  toolName: string;
  result?: {
    content?: Array<{
      type: string;
      text?: string;
    }>;
  };
  isError?: boolean;
}

export interface OmpMessageUpdateEvent {
  type: "message_update";
  assistantMessageEvent: {
    type: "text_start" | "text_delta" | "text_end" | "toolcall_start" | "toolcall_delta" | "toolcall_end";
    delta?: string;
    content?: string;
    contentIndex?: number;
  };
}

export interface OmpAgentEndEvent {
  type: "agent_end";
  messages?: unknown[];
}

export type OmpStreamEvent =
  | OmpTurnStartEvent
  | OmpTurnEndEvent
  | OmpToolExecutionStartEvent
  | OmpToolExecutionUpdateEvent
  | OmpToolExecutionEndEvent
  | OmpMessageUpdateEvent
  | OmpAgentEndEvent
  | { type: string; [key: string]: unknown };

// ==========================================
// Session State & Chat Session Info
// ==========================================

export interface ChatSessionState {
  sessionKey: string;
  chatId: number;
  threadId?: number;
  userId: number;
  username?: string;
  model: string;
  approvalMode: "yolo" | "write" | "always-ask";
  thinkingLevel: string;
  sessionDir: string;
  workspaceDir: string;
  createdAt: number;
  lastActiveAt: number;
  totalTokens: number;
  totalCost: number;
  isRunning: boolean;
  currentProcessAbortController?: AbortController;
}

export interface OmpModelInfo {
  provider: string;
  id: string;
  selector: string;
  name: string;
  reasoning: boolean;
  thinking: string[] | null;
  input: string[];
  contextWindow?: number;
  maxTokens?: number;
}
