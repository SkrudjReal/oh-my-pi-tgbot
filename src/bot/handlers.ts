/**
 * Telegram Message, Command & Callback Query Dispatcher with Interactive Keyboards,
 * Forum Topic / Thread Routing, and Native Telegram Premium Custom Emoji Styling.
 */

import * as fs from "node:fs/promises";
import { createHash } from "node:crypto";
import type { BotConfig } from "../core/config";
import type {
  OmpModelInfo,
  TelegramCallbackQuery,
  TelegramInlineKeyboardMarkup,
  TelegramMessage,
} from "../core/types";
import type { AgentBridge } from "../services/agent-bridge";
import { AttachmentLimitError, extractMessageContext } from "../services/attachments";
import { escapeHtml } from "../services/formatter";
import { TelegramStreamConsumer } from "../services/streamer";
import type { TopicManager } from "../services/topics";
import { authenticateUpdate, F } from "./middlewares";
import type { TelegramClient } from "./telegram-client";

export class MessageHandler {
  private readonly modelCallbacks = new Map<string, string>();

  constructor(
    private readonly client: TelegramClient,
    private readonly agentBridge: AgentBridge,
    private readonly config: BotConfig,
    private readonly topicManager: TopicManager,
  ) {}

  private getThinkingOptions(model: OmpModelInfo): string[] {
    if (!model.reasoning || !model.thinking) return ["off"];
    return [...new Set(["off", ...model.thinking, "auto"])];
  }

  private registerModelCallback(selector: string): string {
    const key = createHash("sha256").update(selector).digest("hex").slice(0, 16);
    this.modelCallbacks.set(key, selector);
    return key;
  }

  async handleMessage(message: TelegramMessage): Promise<void> {
    // 1. Strict Middleware Authentication & Forum Topic isolation
    const isAllowed = await authenticateUpdate(
      message,
      this.config,
      this.client,
      this.topicManager,
    );
    if (!isAllowed) {
      return;
    }

    const chatId = message.chat.id;
    const threadId = message.message_thread_id;
    const userId = message.from?.id || 0;
    const username = message.from?.username;
    const text = (message.text || message.caption || "").trim();

    // 2. Direct Topic Link Ingestion in Private Chat
    if (F.isPrivateChat(message) && this.topicManager.parseTopicLink(text)) {
      await this.handleTopicAddLink(message, text);
      return;
    }

    // 3. Command Routing
    if (text.startsWith("/")) {
      const parts = text.split(/\s+/);
      const command = parts[0].toLowerCase().split("@")[0];
      const args = parts.slice(1).join(" ");

      switch (command) {
        case "/start":
          await this.handleStart(message);
          return;

        case "/help":
          await this.handleHelp(message);
          return;

        case "/new":
        case "/clear":
        case "/reset":
          await this.handleReset(message);
          return;

        case "/model":
        case "/models":
          await this.handleModel(message, args);
          return;

        case "/mode":
        case "/approval":
          await this.handleApprovalMode(message, args);
          return;

        case "/thinking":
        case "/effort":
          await this.handleThinking(message, args);
          return;

        case "/status":
        case "/stats":
          await this.handleStatus(message);
          return;

        case "/tools":
          await this.handleTools(message);
          return;

        case "/workspace":
          await this.handleWorkspace(message);
          return;

        case "/topic":
        case "/topics":
          await this.handleTopic(message, args);
          return;

        case "/cancel":
        case "/stop":
          await this.handleCancel(message);
          return;

        default:
          // Unrecognized command -> forward to agent prompt
          break;
      }
    }

    // 4. Regular Prompt / Attachment Execution
    const session = await this.agentBridge.getOrCreateSession(chatId, userId, username, threadId);
    let promptText: string;
    try {
      ({ promptText } = await extractMessageContext(
        message,
        session.workspaceDir,
        this.client,
        {
          maxInputChars: this.config.maxInputChars,
          maxAttachmentBytes: this.config.maxAttachmentBytes,
        },
      ));
    } catch (err) {
      const detail = err instanceof AttachmentLimitError ? err.message : "Не удалось обработать вложение.";
      await this.client.sendMessage(
        chatId,
        `<blockquote><b>Запрос отклонён:</b> ${escapeHtml(detail)}</blockquote>`,
        {
          message_thread_id: threadId,
          reply_to_message_id: message.message_id,
          parse_mode: "HTML",
        },
      );
      return;
    }

    if (!promptText) {
      return;
    }

    const streamer = new TelegramStreamConsumer({
      chatId,
      messageThreadId: threadId,
      replyToMessageId: message.message_id,
      client: this.client,
      enableStreaming: this.config.enableStreaming,
      enableReactions: this.config.enableReactions,
      enableStickers: this.config.enableStickers,
      debounceMs: this.config.streamDebounceMs,
    });

    try {
      await this.agentBridge.executePrompt(chatId, userId, username, promptText, streamer, threadId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.client.sendMessage(
        chatId,
        `<blockquote><tg-emoji emoji-id="5350400112503845756">🔥</tg-emoji> <b>Ошибка выполнения агента:</b>\n${escapeHtml(msg)}</blockquote>`,
        {
          message_thread_id: threadId,
          reply_to_message_id: message.message_id,
          parse_mode: "HTML",
        },
      );
    }
  }

  async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    const data = query.data || "";
    const user = query.from;
    const message = query.message;

    if (!F.isOwner(user, this.config)) {
      await this.client.answerCallbackQuery(query.id, {
        text: "🔒 Доступ запрещен (только для владельца)",
        show_alert: true,
      });
      return;
    }

    if (!message) {
      await this.client.answerCallbackQuery(query.id);
      return;
    }

    const chatId = message.chat.id;
    const threadId = message.message_thread_id;
    const ownerMessage: TelegramMessage = { ...message, from: user };

    if (data === "cmd_new") {
      const reset = await this.agentBridge.resetSession(chatId, threadId);
      await this.client.answerCallbackQuery(query.id, {
        text: reset ? "🧹 Контекст сессии очищен!" : "Сначала остановите активную задачу",
        show_alert: !reset,
      });
      if (!reset) return;
      await this.client.sendMessage(
        chatId,
        '<blockquote><tg-emoji emoji-id="6138879610386912023">✅</tg-emoji> <b>Контекст сессии успешно очищен.</b>\n<tg-emoji emoji-id="6136155901041578903">✨</tg-emoji> Готов к новым задачам с чистого листа.</blockquote>',
        { message_thread_id: threadId, parse_mode: "HTML" },
      );
      return;
    }

    if (data === "menu_models") {
      await this.client.answerCallbackQuery(query.id);
      await this.handleModel(ownerMessage, "");
      return;
    }

    if (data.startsWith("model:")) {
      const selector = this.modelCallbacks.get(data.slice("model:".length));
      if (!selector) {
        await this.client.answerCallbackQuery(query.id, {
          text: "Меню моделей устарело. Откройте /models ещё раз.",
          show_alert: true,
        });
        return;
      }
      let models: OmpModelInfo[];
      try {
        models = await this.agentBridge.listModels();
      } catch {
        await this.client.answerCallbackQuery(query.id, {
          text: "Не удалось обновить модели OMP.",
          show_alert: true,
        });
        return;
      }
      const model = models.find((item) => item.selector === selector);
      if (!model) {
        await this.client.answerCallbackQuery(query.id, {
          text: "Модель больше недоступна в профиле OMP.",
          show_alert: true,
        });
        return;
      }
      const session = await this.agentBridge.getOrCreateSession(
        chatId,
        user.id,
        user.username,
        threadId,
      );
      this.agentBridge.setModel(chatId, model.selector, threadId);
      const supported = this.getThinkingOptions(model);
      if (!supported.includes(session.thinkingLevel)) {
        this.agentBridge.setThinkingLevel(chatId, model.reasoning ? "auto" : "off", threadId);
      }
      await this.client.answerCallbackQuery(query.id, { text: `✅ Модель: ${model.name}` });
      await this.client.sendMessage(
        chatId,
        `<blockquote><tg-emoji emoji-id="6136441086870033177">🌟</tg-emoji> <b>Модель переключена:</b>\n<code>${escapeHtml(model.selector)}</code></blockquote>`,
        { message_thread_id: threadId, parse_mode: "HTML" },
      );
      return;
    }

    if (data === "menu_modes") {
      await this.client.answerCallbackQuery(query.id);
      await this.handleApprovalMode(ownerMessage, "");
      return;
    }

    if (data.startsWith("set_mode:")) {
      const mode = data.slice("set_mode:".length) as "yolo" | "write" | "always-ask";
      if (!["yolo", "write", "always-ask"].includes(mode)) {
        await this.client.answerCallbackQuery(query.id, { text: "Недопустимый режим", show_alert: true });
        return;
      }
      await this.agentBridge.getOrCreateSession(chatId, user.id, user.username, threadId);
      this.agentBridge.setApprovalMode(chatId, mode, threadId);
      await this.client.answerCallbackQuery(query.id, { text: `🛡 Режим: ${mode}` });
      await this.client.sendMessage(
        chatId,
        `<blockquote><tg-emoji emoji-id="6136408896090150077">💎</tg-emoji> <b>Режим подтверждения обновлен:</b>\n<code>${mode}</code></blockquote>`,
        { message_thread_id: threadId, parse_mode: "HTML" },
      );
      return;
    }

    if (data === "menu_thinking") {
      await this.client.answerCallbackQuery(query.id);
      await this.handleThinking(ownerMessage, "");
      return;
    }

    if (data.startsWith("thinking:")) {
      await this.client.answerCallbackQuery(query.id);
      await this.handleThinking(ownerMessage, data.slice("thinking:".length));
      return;
    }

    if (data === "cmd_status") {
      await this.client.answerCallbackQuery(query.id);
      await this.handleStatus(ownerMessage);
      return;
    }

    if (data === "cmd_tools") {
      await this.client.answerCallbackQuery(query.id);
      await this.handleTools(ownerMessage);
      return;
    }

    if (data === "cmd_workspace") {
      await this.client.answerCallbackQuery(query.id);
      await this.handleWorkspace(ownerMessage);
      return;
    }

    if (data === "cmd_help") {
      await this.client.answerCallbackQuery(query.id);
      await this.handleHelp(ownerMessage);
      return;
    }

    if (data === "cmd_cancel") {
      await this.handleCancel(ownerMessage);
      await this.client.answerCallbackQuery(query.id, { text: "🛑 Команда обработана" });
      return;
    }

    // Forum Topics Callbacks
    if (data === "topic_add_prompt") {
      await this.client.answerCallbackQuery(query.id);
      const text = [
        '<b><tg-emoji emoji-id="5348222744473398688">📁</tg-emoji> Подключение Telegram топика</b>',
        "",
        "<blockquote>Отправьте внутреннюю ссылку на топик в супергруппе в формате:\n<code>https://t.me/c/4488980222/5</code></blockquote>",
        "",
        '<tg-emoji emoji-id="5305423313764363203">🤫</tg-emoji> <i>Как получить ссылку: в Telegram нажмите правой кнопкой (или долгим тапом) на топик → «Скопировать ссылку на топик».</i>',
      ].join("\n");
      await this.client.sendMessage(chatId, text, {
        message_thread_id: threadId,
        parse_mode: "HTML",
      });
      return;
    }

    if (data === "topic_list") {
      await this.client.answerCallbackQuery(query.id);
      await this.handleTopic(ownerMessage, "list");
      return;
    }

    if (data === "topic_remove_menu") {
      await this.client.answerCallbackQuery(query.id);
      const topics = await this.topicManager.listTopics();
      if (topics.length === 0) {
        await this.client.sendMessage(
          chatId,
          '<blockquote><tg-emoji emoji-id="6136155901041578903">✨</tg-emoji> Нет активных подключенных топиков.</blockquote>',
          { message_thread_id: threadId, parse_mode: "HTML" },
        );
        return;
      }

      const buttons = topics.map((t) => [
        {
          text: `🗑 ${t.chat_title} (ID: ${t.topic_id})`,
          callback_data: `topic_del:${t.chat_id}:${t.topic_id}`,
        },
      ]);

      await this.client.sendMessage(
        chatId,
        '<b><tg-emoji emoji-id="5350400112503845756">🔥</tg-emoji> Выберите топик для отключения:</b>',
        {
          message_thread_id: threadId,
          reply_markup: { inline_keyboard: buttons },
          parse_mode: "HTML",
        },
      );
      return;
    }

    if (data.startsWith("topic_del:")) {
      const parts = data.slice("topic_del:".length).split(":");
      const targetChatId = Number(parts[0]);
      const targetTopicId = Number(parts[1]);
      if (!Number.isSafeInteger(targetChatId) || !Number.isSafeInteger(targetTopicId) || targetTopicId <= 0) {
        await this.client.answerCallbackQuery(query.id, { text: "Некорректные данные топика", show_alert: true });
        return;
      }
      await this.topicManager.removeTopic(targetChatId, targetTopicId);
      await this.client.answerCallbackQuery(query.id, { text: "🗑 Топик отключен!" });
      await this.client.sendMessage(
        chatId,
        `<blockquote><tg-emoji emoji-id="6138879610386912023">✅</tg-emoji> Топик <code>${targetChatId}:${targetTopicId}</code> успешно удален из маршрутизации.</blockquote>`,
        { message_thread_id: threadId, parse_mode: "HTML" },
      );
      return;
    }

    await this.client.answerCallbackQuery(query.id);
  }

  private async handleTopic(message: TelegramMessage, args: string): Promise<void> {
    const trimmed = args.trim();

    // 1. /topic add <link>
    if (trimmed.startsWith("add ")) {
      const url = trimmed.slice(4).trim();
      await this.handleTopicAddLink(message, url);
      return;
    }

    // 2. /topic list
    if (trimmed === "list") {
      const topics = await this.topicManager.listTopics();
      if (topics.length === 0) {
        await this.client.sendMessage(
          message.chat.id,
          '<blockquote><tg-emoji emoji-id="6136155901041578903">✨</tg-emoji> <b>Активные топики отсутствуют.</b>\nИспользуйте <code>/topic add &lt;ссылка&gt;</code> для подключения.</blockquote>',
          {
            message_thread_id: message.message_thread_id,
            reply_to_message_id: message.message_id,
            parse_mode: "HTML",
          },
        );
        return;
      }

      const listLines = topics
        .map(
          (t, i) =>
            `${i + 1}. <b>${escapeHtml(t.chat_title)}</b>\n` +
            `   • Chat ID: <code>${t.chat_id}</code>\n` +
            `   • Topic ID: <code>${t.topic_id}</code>`,
        )
        .join("\n\n");

      const text = [
        '<b><tg-emoji emoji-id="5348222744473398688">📁</tg-emoji> Подключенные Telegram топики:</b>',
        "",
        `<blockquote expandable>${listLines}</blockquote>`,
      ].join("\n");

      await this.client.sendMessage(message.chat.id, text, {
        message_thread_id: message.message_thread_id,
        reply_to_message_id: message.message_id,
        parse_mode: "HTML",
      });
      return;
    }

    // 3. /topic enable / activate inside group
    if (
      (trimmed === "enable" || trimmed === "activate" || trimmed === "") &&
      F.isGroupChat(message) &&
      message.message_thread_id
    ) {
      const title = message.chat.title || `Chat ${message.chat.id}`;
      await this.topicManager.addTopic(
        message.chat.id,
        message.message_thread_id,
        title,
        message.from?.id || 0,
      );

      await this.client.sendMessage(
        message.chat.id,
        `<blockquote><tg-emoji emoji-id="6138879610386912023">✅</tg-emoji> <b>Топик успешно активирован!</b>\nOMP агент теперь отвечает в ветке <code>${message.message_thread_id}</code> группы <b>${escapeHtml(title)}</b>.</blockquote>`,
        {
          message_thread_id: message.message_thread_id,
          reply_to_message_id: message.message_id,
          parse_mode: "HTML",
        },
      );
      return;
    }

    // 4. Interactive menu for /topic
    const menuText = [
      '<b><tg-emoji emoji-id="5348222744473398688">📁</tg-emoji> Управление топиками супергрупп (Forum Threads)</b>',
      "",
      "<blockquote>Подключайте агента к отдельным топикам групп, чтобы бот отвечал только в нужных ветках и не спамил в общие чаты.</blockquote>",
      "",
      "<b>Команды:</b>",
      "• <code>/topic add &lt;ссылка_на_топик&gt;</code> — Подключить топик по ссылке",
      "• <code>/topic list</code> — Список активных топиков",
      "• <code>/topic enable</code> — Активировать текущий топик (при вызове внутри группы)",
    ].join("\n");

    const keyboard: TelegramInlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "➕ Добавить топик по ссылке", callback_data: "topic_add_prompt" },
        ],
        [
          { text: "📑 Список топиков", callback_data: "topic_list" },
          { text: "🗑 Отключить топик", callback_data: "topic_remove_menu" },
        ],
      ],
    };

    await this.client.sendMessage(message.chat.id, menuText, {
      message_thread_id: message.message_thread_id,
      reply_to_message_id: message.message_id,
      reply_markup: keyboard,
      parse_mode: "HTML",
    });
  }

  private async handleTopicAddLink(message: TelegramMessage, url: string): Promise<void> {
    const parsed = this.topicManager.parseTopicLink(url);
    if (!parsed) {
      await this.client.sendMessage(
        message.chat.id,
        '<blockquote><tg-emoji emoji-id="5350400112503845756">🔥</tg-emoji> <b>Неверный формат ссылки на топик!</b>\nИспользуйте формат: <code>https://t.me/c/4488980222/5</code></blockquote>',
        {
          message_thread_id: message.message_thread_id,
          reply_to_message_id: message.message_id,
          parse_mode: "HTML",
        },
      );
      return;
    }

    const botMe = await this.client.getMe();
    const check = await this.topicManager.checkBotInChat(this.client, parsed.chatId, botMe.id);

    if (!check.inChat) {
      await this.client.sendMessage(
        message.chat.id,
        `<blockquote><tg-emoji emoji-id="5305423313764363203">🤫</tg-emoji> <b>Бот пока не добавлен в целевую группу!</b>\n` +
          `Chat ID: <code>${parsed.chatId}</code>\n` +
          `1. Добавьте бота @${botMe.username} в группу администратором или участником.\n` +
          `2. Отправьте ссылку на топик повторно.</blockquote>`,
        {
          message_thread_id: message.message_thread_id,
          reply_to_message_id: message.message_id,
          parse_mode: "HTML",
        },
      );
      return;
    }

    const title = check.chatTitle || `Chat ${parsed.chatId}`;
    await this.topicManager.addTopic(
      parsed.chatId,
      parsed.topicId,
      title,
      message.from?.id || 0,
    );

    await this.client.sendMessage(
      message.chat.id,
      `<blockquote><tg-emoji emoji-id="6138879610386912023">✅</tg-emoji> <b>Топик успешно подключен и активирован!</b>\n` +
        `• <b>Группа:</b> ${escapeHtml(title)}\n` +
        `• <b>Topic ID:</b> <code>${parsed.topicId}</code>\n` +
        `• <b>Chat ID:</b> <code>${parsed.chatId}</code>\n` +
        `<tg-emoji emoji-id="6136155901041578903">✨</tg-emoji> Сообщения из этого топика теперь обрабатываются агентом.</blockquote>`,
      {
        message_thread_id: message.message_thread_id,
        reply_to_message_id: message.message_id,
        parse_mode: "HTML",
      },
    );
  }

  private async handleStart(message: TelegramMessage): Promise<void> {
    const session = await this.agentBridge.getOrCreateSession(
      message.chat.id,
      message.from?.id || 0,
      message.from?.username,
      message.message_thread_id,
    );

    const welcome = [
      '<b><tg-emoji emoji-id="6136155901041578903">✨</tg-emoji> Oh My Pi (omp) AI Agent Bridge</b>',
      "",
      '<blockquote expandable><tg-emoji emoji-id="6136387648886935976">👑</tg-emoji> <b>Автономный AI Ассистент с полным доступом к инструментам:</b>\n' +
        `• <tg-emoji emoji-id="6136441086870033177">🌟</tg-emoji> <b>Модель:</b> <code>${escapeHtml(session.model || "OMP Default")}</code>\n` +
        `• <tg-emoji emoji-id="6136408896090150077">💎</tg-emoji> <b>Режим:</b> <code>${session.approvalMode}</code>\n` +
        `• <tg-emoji emoji-id="6138837841829957663">⚡️</tg-emoji> <b>Thinking:</b> <code>${escapeHtml(session.thinkingLevel)}</code>\n` +
        `• <tg-emoji emoji-id="5348222744473398688">📁</tg-emoji> <b>Воркспейс:</b> <code>${escapeHtml(session.workspaceDir)}</code></blockquote>`,
      "",
      '<tg-emoji emoji-id="5348202175875016422">📖</tg-emoji> <i>Отправьте любую задачу кодом, прикрепите файлы/фото/голосовые или выберите действие ниже:</i>',
    ].join("\n");

    const keyboard: TelegramInlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "🧹 Сбросить контекст", callback_data: "cmd_new" },
          { text: "🎯 Сменить модель", callback_data: "menu_models" },
        ],
        [
          { text: "🛡 Режим работы", callback_data: "menu_modes" },
          { text: "🧠 Размышления", callback_data: "menu_thinking" },
        ],
        [
          { text: "🛠 Инструменты", callback_data: "cmd_tools" },
          { text: "📁 Топики групп", callback_data: "topic_list" },
        ],
        [
          { text: "📊 Статус сессии", callback_data: "cmd_status" },
          { text: "📁 Воркспейс", callback_data: "cmd_workspace" },
        ],
        [
          { text: "📖 Справка и документация", callback_data: "cmd_help" },
        ],
      ],
    };

    await this.client.sendMessage(message.chat.id, welcome, {
      message_thread_id: message.message_thread_id,
      reply_to_message_id: message.message_id,
      reply_markup: keyboard,
      parse_mode: "HTML",
    });
  }

  private async handleHelp(message: TelegramMessage): Promise<void> {
    const help = [
      '<b><tg-emoji emoji-id="5348202175875016422">📖</tg-emoji> Команды и руководство OMP Telegram Bot</b>',
      "",
      '<blockquote expandable><tg-emoji emoji-id="6136155901041578903">✨</tg-emoji> <b>Управление сессией:</b>\n' +
        "• <code>/new</code>, <code>/clear</code> — Очистить контекст диалога\n" +
        "• <code>/status</code> — Статус активного процесса, токены и аптайм\n" +
        "• <code>/cancel</code> — Немедленно прервать текущую запущенную задачу\n" +
        "• <code>/workspace</code> — Показать файлы и путь к рабочей директории\n" +
        "• <code>/topic</code> — Управление подключенными топиками супергрупп</blockquote>",
      "",
      '<blockquote expandable><tg-emoji emoji-id="5348318754172331709">✏️</tg-emoji> <b>Конфигурация агента:</b>\n' +
        "• <code>/model</code>, <code>/models</code> — Модели активного OMP-профиля\n" +
        "• <code>/mode [yolo|write|always-ask]</code> — Политика инструментов; в headless-режиме запросы подтверждения отклоняются\n" +
        "• <code>/thinking</code>, <code>/effort</code> — Только effort, поддерживаемые выбранной моделью\n" +
        "• <code>/tools</code> — Инструменты установленной версии OMP</blockquote>",
      "",
      '<blockquote><tg-emoji emoji-id="6136257464133228971">🦋</tg-emoji> <b>Мультимодальность:</b>\n' +
        "Отправляйте изображения, архивы, код, документы и аудио — бот сохраняет их в рабочий каталог чата и подключает к анализу.</blockquote>",
    ].join("\n");

    await this.client.sendMessage(message.chat.id, help, {
      message_thread_id: message.message_thread_id,
      reply_to_message_id: message.message_id,
      parse_mode: "HTML",
    });
  }

  private async handleReset(message: TelegramMessage): Promise<void> {
    const reset = await this.agentBridge.resetSession(message.chat.id, message.message_thread_id);
    await this.client.sendMessage(
      message.chat.id,
      reset
        ? '<blockquote><tg-emoji emoji-id="6138879610386912023">✅</tg-emoji> <b>Контекст сессии очищен!</b>\n<tg-emoji emoji-id="6136155901041578903">✨</tg-emoji> История диалога сброшена, готов к новым задачам.</blockquote>'
        : '<blockquote><b>Сессия занята.</b> Сначала остановите задачу командой <code>/cancel</code>, затем повторите сброс.</blockquote>',
      {
        message_thread_id: message.message_thread_id,
        reply_to_message_id: message.message_id,
        parse_mode: "HTML",
      },
    );
  }

  private async handleModel(message: TelegramMessage, args: string): Promise<void> {
    const session = await this.agentBridge.getOrCreateSession(
      message.chat.id,
      message.from?.id || 0,
      message.from?.username,
      message.message_thread_id,
    );

    let models: OmpModelInfo[];
    try {
      models = await this.agentBridge.listModels();
    } catch {
      await this.client.sendMessage(
        message.chat.id,
        '<blockquote><b>Не удалось получить модели OMP.</b> Проверьте авторизацию и журнал сервера.</blockquote>',
        {
          message_thread_id: message.message_thread_id,
          reply_to_message_id: message.message_id,
          parse_mode: "HTML",
        },
      );
      return;
    }

    const requestedModel = args.trim();
    if (requestedModel) {
      const normalized = requestedModel.toLowerCase();
      const matches = models.filter(
        (model) =>
          model.selector.toLowerCase() === normalized ||
          model.id.toLowerCase() === normalized ||
          model.name.toLowerCase() === normalized,
      );
      if (matches.length !== 1) {
        await this.client.sendMessage(
          message.chat.id,
          '<blockquote><b>Модель не найдена или имя неоднозначно.</b> Выберите точный вариант через <code>/models</code>.</blockquote>',
          {
            message_thread_id: message.message_thread_id,
            reply_to_message_id: message.message_id,
            parse_mode: "HTML",
          },
        );
        return;
      }
      const model = matches[0];
      this.agentBridge.setModel(message.chat.id, model.selector, message.message_thread_id);
      const supported = this.getThinkingOptions(model);
      if (!supported.includes(session.thinkingLevel)) {
        this.agentBridge.setThinkingLevel(
          message.chat.id,
          model.reasoning ? "auto" : "off",
          message.message_thread_id,
        );
      }
      await this.client.sendMessage(
        message.chat.id,
        `<blockquote><tg-emoji emoji-id="6136441086870033177">🌟</tg-emoji> <b>Модель успешно установлена:</b>\n<code>${escapeHtml(model.selector)}</code></blockquote>`,
        {
          message_thread_id: message.message_thread_id,
          reply_to_message_id: message.message_id,
          parse_mode: "HTML",
        },
      );
      return;
    }

    const text = [
      `<blockquote><tg-emoji emoji-id="6136441086870033177">🌟</tg-emoji> <b>Текущая модель:</b> <code>${escapeHtml(session.model || "OMP Default")}</code>\nДоступно в текущем профиле: <b>${models.length}</b></blockquote>`,
      "",
      '<tg-emoji emoji-id="5348202175875016422">📖</tg-emoji> <i>Список получен напрямую из <code>omp models --json</code>. Выберите модель:</i>',
    ].join("\n");

    const keyboard: TelegramInlineKeyboardMarkup = {
      inline_keyboard: models.map((model) => [
        {
          text: `${model.reasoning ? "🧠" : "⚡"} ${model.name}`.slice(0, 60),
          callback_data: `model:${this.registerModelCallback(model.selector)}`,
        },
      ]),
    };

    await this.client.sendMessage(message.chat.id, text, {
      message_thread_id: message.message_thread_id,
      reply_to_message_id: message.message_id,
      reply_markup: keyboard,
      parse_mode: "HTML",
    });
  }

  private async handleApprovalMode(message: TelegramMessage, args: string): Promise<void> {
    const session = await this.agentBridge.getOrCreateSession(
      message.chat.id,
      message.from?.id || 0,
      message.from?.username,
      message.message_thread_id,
    );

    const mode = args.trim().toLowerCase();
    if (mode === "yolo" || mode === "write" || mode === "always-ask") {
      this.agentBridge.setApprovalMode(message.chat.id, mode, message.message_thread_id);
      await this.client.sendMessage(
        message.chat.id,
        `<blockquote><tg-emoji emoji-id="6136408896090150077">💎</tg-emoji> <b>Режим подтверждения инструментов:</b>\n<code>${mode}</code></blockquote>`,
        {
          message_thread_id: message.message_thread_id,
          reply_to_message_id: message.message_id,
          parse_mode: "HTML",
        },
      );
      return;
    }

    const text = [
      `<blockquote><tg-emoji emoji-id="6136408896090150077">💎</tg-emoji> <b>Текущий режим:</b> <code>${session.approvalMode}</code></blockquote>`,
      "",
      '<tg-emoji emoji-id="5348202175875016422">📖</tg-emoji> <b>Выберите политику выполнения инструментов:</b>',
      '<i>Telegram UI не подтверждает отдельные tool calls: всё выше разрешённого tier будет заблокировано.</i>',
    ].join("\n");

    const keyboard: TelegramInlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "⚡ YOLO (Полный авто-аппрув)", callback_data: "set_mode:yolo" },
        ],
        [
          { text: "✏️ Write (read/write; exec блок)", callback_data: "set_mode:write" },
        ],
        [
          { text: "🛡 Always Ask (только read)", callback_data: "set_mode:always-ask" },
        ],
      ],
    };

    await this.client.sendMessage(message.chat.id, text, {
      message_thread_id: message.message_thread_id,
      reply_to_message_id: message.message_id,
      reply_markup: keyboard,
      parse_mode: "HTML",
    });
  }

  private async handleThinking(message: TelegramMessage, args: string): Promise<void> {
    const session = await this.agentBridge.getOrCreateSession(
      message.chat.id,
      message.from?.id || 0,
      message.from?.username,
      message.message_thread_id,
    );
    let model: OmpModelInfo | undefined;
    try {
      const models = await this.agentBridge.listModels();
      model = models.find((item) => item.selector === session.model);
    } catch {
      // A concise user-facing error is sent below.
    }
    if (!model) {
      await this.client.sendMessage(
        message.chat.id,
        '<blockquote><b>Нельзя определить effort.</b> Текущая модель отсутствует в профиле OMP; сначала выберите её через <code>/models</code>.</blockquote>',
        {
          message_thread_id: message.message_thread_id,
          reply_to_message_id: message.message_id,
          parse_mode: "HTML",
        },
      );
      return;
    }

    const supported = this.getThinkingOptions(model);
    const level = args.trim().toLowerCase();
    if (level) {
      if (!supported.includes(level)) {
        await this.client.sendMessage(
          message.chat.id,
          `<blockquote><b>Effort <code>${escapeHtml(level)}</code> не поддерживается моделью ${escapeHtml(model.name)}.</b>\nДоступно: <code>${supported.join(", ")}</code></blockquote>`,
          {
            message_thread_id: message.message_thread_id,
            reply_to_message_id: message.message_id,
            parse_mode: "HTML",
          },
        );
        return;
      }
      this.agentBridge.setThinkingLevel(message.chat.id, level, message.message_thread_id);
      await this.client.sendMessage(
        message.chat.id,
        `<blockquote><tg-emoji emoji-id="6138837841829957663">⚡️</tg-emoji> <b>Thinking level установлен:</b> <code>${level}</code></blockquote>`,
        {
          message_thread_id: message.message_thread_id,
          reply_to_message_id: message.message_id,
          parse_mode: "HTML",
        },
      );
      return;
    }

    const text = [
      `<blockquote><tg-emoji emoji-id="6138837841829957663">⚡️</tg-emoji> <b>Модель:</b> <code>${escapeHtml(model.selector)}</code>\n<b>Текущий effort:</b> <code>${escapeHtml(session.thinkingLevel)}</code></blockquote>`,
      "",
      '<tg-emoji emoji-id="5348202175875016422">📖</tg-emoji> <i>Выберите глубину цепочки рассуждений (reasoning):</i>',
    ].join("\n");

    const keyboard: TelegramInlineKeyboardMarkup = {
      inline_keyboard: supported.reduce<TelegramInlineKeyboardMarkup["inline_keyboard"]>(
        (rows, option, index) => {
          const button = { text: option.toUpperCase(), callback_data: `thinking:${option}` };
          if (index % 2 === 0) rows.push([button]);
          else rows[rows.length - 1].push(button);
          return rows;
        },
        [],
      ),
    };
    await this.client.sendMessage(message.chat.id, text, {
      message_thread_id: message.message_thread_id,
      reply_to_message_id: message.message_id,
      reply_markup: keyboard,
      parse_mode: "HTML",
    });
  }

  private async handleStatus(message: TelegramMessage): Promise<void> {
    const session = await this.agentBridge.getOrCreateSession(
      message.chat.id,
      message.from?.id || 0,
      message.from?.username,
      message.message_thread_id,
    );

    const uptimeSec = Math.floor((Date.now() - session.createdAt) / 1000);
    const mins = Math.floor(uptimeSec / 60);
    const secs = uptimeSec % 60;

    const status = [
      '<blockquote expandable><tg-emoji emoji-id="6136387648886935976">👑</tg-emoji> <b>Статус сессии OMP Agent:</b>\n' +
        `• <tg-emoji emoji-id="6136441086870033177">🌟</tg-emoji> <b>Модель:</b> <code>${escapeHtml(session.model || "OMP Default")}</code>\n` +
        `• <tg-emoji emoji-id="6136408896090150077">💎</tg-emoji> <b>Режим:</b> <code>${session.approvalMode}</code>\n` +
        `• <tg-emoji emoji-id="6138837841829957663">⚡️</tg-emoji> <b>Thinking:</b> <code>${escapeHtml(session.thinkingLevel)}</code>\n` +
        `• <tg-emoji emoji-id="6138879610386912023">✅</tg-emoji> <b>Активен:</b> <code>${session.isRunning ? "🟢 Выполняется" : "⚪ Ожидание"}</code>\n` +
        `• <tg-emoji emoji-id="5350809706354993830">💸</tg-emoji> <b>Токены:</b> <code>${session.totalTokens.toLocaleString()}</code>\n` +
        `• <tg-emoji emoji-id="5350809706354993830">💸</tg-emoji> <b>Затраты:</b> <code>$${session.totalCost.toFixed(4)}</code>\n` +
        `• <tg-emoji emoji-id="6136155901041578903">✨</tg-emoji> <b>Аптайм:</b> <code>${mins}м ${secs}с</code>\n` +
        `• <tg-emoji emoji-id="5348222744473398688">📁</tg-emoji> <b>Воркспейс:</b> <code>${escapeHtml(session.workspaceDir)}</code></blockquote>`,
    ].join("\n");

    const keyboard: TelegramInlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: "🔄 Обновить", callback_data: "cmd_status" },
          { text: "🛑 Прервать задачу", callback_data: "cmd_cancel" },
        ],
      ],
    };

    await this.client.sendMessage(message.chat.id, status, {
      message_thread_id: message.message_thread_id,
      reply_to_message_id: message.message_id,
      reply_markup: keyboard,
      parse_mode: "HTML",
    });
  }

  private async handleTools(message: TelegramMessage): Promise<void> {
    let availableTools: Array<{ name: string; description: string }>;
    try {
      availableTools = await this.agentBridge.listTools();
    } catch {
      availableTools = [];
    }
    const toolLines = availableTools.length > 0
      ? availableTools.map((tool) => `• <code>${escapeHtml(tool.name)}</code> — ${escapeHtml(tool.description)}`).join("\n")
      : "Не удалось получить список инструментов. Проверьте журнал сервера.";
    const tools = [
      '<b><tg-emoji emoji-id="5348318754172331709">✏️</tg-emoji> Доступные инструменты OMP Agent:</b>',
      "",
      `<blockquote expandable><tg-emoji emoji-id="6138837841829957663">⚡️</tg-emoji> <b>Системные инструменты:</b>\n${toolLines}</blockquote>`,
    ].join("\n");

    await this.client.sendMessage(message.chat.id, tools, {
      message_thread_id: message.message_thread_id,
      reply_to_message_id: message.message_id,
      parse_mode: "HTML",
    });
  }

  private async handleWorkspace(message: TelegramMessage): Promise<void> {
    const session = await this.agentBridge.getOrCreateSession(
      message.chat.id,
      message.from?.id || 0,
      message.from?.username,
      message.message_thread_id,
    );

    let filesList = "(директория пуста)";
    try {
      const entries = await fs.readdir(session.workspaceDir);
      if (entries.length > 0) {
        filesList = entries.slice(0, 20).map((f) => `  • <code>${escapeHtml(f)}</code>`).join("\n");
      }
    } catch {
      // Ignored
    }

    const text = [
      `<blockquote><tg-emoji emoji-id="5348222744473398688">📁</tg-emoji> <b>Рабочая директория (Workspace):</b>\n<code>${escapeHtml(session.workspaceDir)}</code></blockquote>`,
      "",
      `<blockquote expandable><tg-emoji emoji-id="5348202175875016422">📖</tg-emoji> <b>Файлы в воркспейсе:</b>\n${filesList}</blockquote>`,
    ].join("\n");

    await this.client.sendMessage(message.chat.id, text, {
      message_thread_id: message.message_thread_id,
      reply_to_message_id: message.message_id,
      parse_mode: "HTML",
    });
  }

  private async handleCancel(message: TelegramMessage): Promise<void> {
    const cancelled = this.agentBridge.cancelTask(message.chat.id, message.message_thread_id);
    if (cancelled) {
      await this.client.sendMessage(
        message.chat.id,
        '<blockquote><tg-emoji emoji-id="5350400112503845756">🔥</tg-emoji> <b>Задача остановлена:</b>\nАктивный процесс агента был немедленно прерван.</blockquote>',
        {
          message_thread_id: message.message_thread_id,
          reply_to_message_id: message.message_id,
          parse_mode: "HTML",
        },
      );
    } else {
      await this.client.sendMessage(
        message.chat.id,
        '<blockquote><tg-emoji emoji-id="6136155901041578903">✨</tg-emoji> В данный момент нет активных задач для отмены.</blockquote>',
        {
          message_thread_id: message.message_thread_id,
          reply_to_message_id: message.message_id,
          parse_mode: "HTML",
        },
      );
    }
  }
}
