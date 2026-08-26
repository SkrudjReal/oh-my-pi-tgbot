/**
 * Agent Bridge: Spawns and manages OMP subprocess instances with JSON streaming,
 * per-chat session directories, workspace management, stderr capture, and concurrency locking.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { BotConfig } from "../core/config";
import type { ChatSessionState, OmpModelInfo, OmpStreamEvent } from "../core/types";
import type { TelegramStreamConsumer } from "./streamer";

export function makeSessionKey(chatId: number, threadId?: number): string {
  return `${chatId}:${threadId ?? 0}`;
}

function redactSensitive(text: string): string {
  return text
    .replace(/bot\d{6,12}:[A-Za-z0-9_-]{20,}/g, "bot[REDACTED]")
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_KEY]")
    .replace(/((?:api[_-]?key|token|secret|authorization)\s*[:=]\s*)\S+/gi, "$1[REDACTED]");
}

const OMP_ENV_EXACT = new Set([
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "PATH",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "NO_COLOR",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
]);

const OMP_ENV_PREFIXES = [
  "OMP_",
  "PI_",
  "XDG_",
  "ANTHROPIC_",
  "CLAUDE_",
  "OPENAI_",
  "AZURE_OPENAI_",
  "GEMINI_",
  "GOOGLE_",
  "GROQ_",
  "CEREBRAS_",
  "XAI_",
  "OPENROUTER_",
  "DEEPSEEK_",
  "KILO_",
  "MISTRAL_",
  "ZAI_",
  "UMANS_",
  "MINIMAX_",
  "OPENCODE_",
  "CURSOR_",
  "AI_GATEWAY_",
  "WAFER_",
  "YOLO_AUTO_",
  "COPILOT_",
  "AWS_",
  "EXA_",
  "BRAVE_",
  "PERPLEXITY_",
  "TAVILY_",
  "TINYFISH_",
  "FIRECRAWL_",
  "FOUNDRY_",
];

export class AgentBridge {
  private readonly sessions = new Map<string, ChatSessionState>();
  private readonly sessionInitializations = new Map<string, Promise<ChatSessionState>>();
  private readonly config: BotConfig;
  private modelCatalog: OmpModelInfo[] | undefined;

  constructor(config: BotConfig) {
    this.config = config;
  }

  private getOmpEnvironment(): Record<string, string | undefined> {
    const env: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (OMP_ENV_EXACT.has(key) || OMP_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        env[key] = value;
      }
    }
    return env;
  }

  private getThinkingOptions(model: OmpModelInfo): string[] {
    if (!model.reasoning || !model.thinking) return ["off"];
    return [...new Set(["off", ...model.thinking, "auto"])];
  }

  /**
   * Resolves the OMP executable path reliably across environments.
   */
  private async resolveOmpExecutable(): Promise<string> {
    const home = os.homedir();
    const candidates = [
      this.config.ompExecutable,
      process.env.OMP_BIN,
      path.join(home, ".bun", "bin", "omp"),
      "/usr/local/bin/omp",
      "/usr/bin/omp",
      "omp",
    ].filter((p): p is string => Boolean(p));

    for (const candidate of candidates) {
      try {
        if (candidate.includes(path.sep)) {
          await fs.access(candidate);
          return candidate;
        }
        // Test binary lookup via which
        const testProc = Bun.spawn(["which", candidate], { stdout: "pipe", stderr: "pipe" });
        const text = (await new Response(testProc.stdout).text()).trim();
        if (text) return text;
      } catch {
        // Continue search
      }
    }

    return "omp";
  }

  private async runOmpCommand(args: string[], timeoutMs = 20_000): Promise<string> {
    const ompBin = await this.resolveOmpExecutable();
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);
    try {
      const proc = Bun.spawn([ompBin, ...args], {
        env: this.getOmpEnvironment(),
        stdout: "pipe",
        stderr: "pipe",
        signal: abortController.signal,
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      if (exitCode !== 0) {
        console.error(`OMP command failed (${exitCode}): ${redactSensitive(stderr).slice(0, 2000)}`);
        throw new Error("OMP command failed. Check the server logs and OMP authentication.");
      }
      return stdout;
    } catch (err) {
      if (abortController.signal.aborted) {
        throw new Error("OMP command timed out.");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async loadModelCatalog(): Promise<OmpModelInfo[]> {
    const raw = await this.runOmpCommand(["models", "--json"]);
    const parsed = JSON.parse(raw) as { models?: unknown[] };
    if (!Array.isArray(parsed.models)) {
      throw new Error("OMP returned an invalid model list.");
    }

    const models = parsed.models.filter((value): value is OmpModelInfo => {
      if (!value || typeof value !== "object") return false;
      const model = value as Partial<OmpModelInfo>;
      return (
        typeof model.provider === "string" &&
        typeof model.id === "string" &&
        typeof model.selector === "string" &&
        typeof model.name === "string" &&
        typeof model.reasoning === "boolean" &&
        (model.thinking === null ||
          (Array.isArray(model.thinking) && model.thinking.every((item) => typeof item === "string"))) &&
        Array.isArray(model.input)
      );
    });
    if (models.length === 0) {
      throw new Error("No models are available in the active OMP profile.");
    }

    this.modelCatalog = models;
    return models;
  }

  async initializeModelCatalog(): Promise<OmpModelInfo[]> {
    const models = await this.loadModelCatalog();
    if (
      this.config.defaultModel &&
      !models.some((model) => model.selector === this.config.defaultModel)
    ) {
      throw new Error(
        `Default model ${this.config.defaultModel} is not available in the active OMP profile.`,
      );
    }
    return models;
  }

  async listModels(): Promise<OmpModelInfo[]> {
    if (!this.modelCatalog) {
      throw new Error("OMP model catalog has not been loaded at startup.");
    }
    return this.modelCatalog;
  }

  async listTools(): Promise<Array<{ name: string; description: string }>> {
    const help = await this.runOmpCommand(["--help"]);
    const block = help.split("Available Tools (default-enabled unless noted):")[1]?.split("Plugin Options:")[0] ?? "";
    return block
      .split("\n")
      .map((line) => line.trim().match(/^([a-z][a-z0-9_-]+)\s+-\s+(.+)$/i))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => ({ name: match[1], description: match[2] }));
  }

  async getOrCreateSession(
    chatId: number,
    userId: number,
    username?: string,
    threadId?: number,
  ): Promise<ChatSessionState> {
    const sessionKey = makeSessionKey(chatId, threadId);
    let session = this.sessions.get(sessionKey);
    if (!session) {
      let initialization = this.sessionInitializations.get(sessionKey);
      if (!initialization) {
        initialization = (async () => {
          const directoryKey = threadId ? `${chatId}_topic_${threadId}` : String(chatId);
          const sessionDir = path.join(this.config.sessionRoot, directoryKey);
          const workspaceDir = path.join(this.config.workspaceRoot, directoryKey);

          await fs.mkdir(sessionDir, { recursive: true, mode: 0o700 });
          await fs.mkdir(workspaceDir, { recursive: true, mode: 0o700 });
          await Promise.all([fs.chmod(sessionDir, 0o700), fs.chmod(workspaceDir, 0o700)]);

          const created: ChatSessionState = {
            sessionKey,
            chatId,
            threadId,
            userId,
            username,
            model: this.config.defaultModel,
            approvalMode: this.config.defaultApprovalMode,
            thinkingLevel: this.config.defaultThinkingLevel,
            sessionDir,
            workspaceDir,
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
            totalTokens: 0,
            totalCost: 0,
            isRunning: false,
          };
          this.sessions.set(sessionKey, created);
          return created;
        })();
        this.sessionInitializations.set(sessionKey, initialization);
      }
      try {
        session = await initialization;
      } finally {
        if (this.sessionInitializations.get(sessionKey) === initialization) {
          this.sessionInitializations.delete(sessionKey);
        }
      }
    }
    session.lastActiveAt = Date.now();
    return session;
  }

  getSession(chatId: number, threadId?: number): ChatSessionState | undefined {
    return this.sessions.get(makeSessionKey(chatId, threadId));
  }

  async resetSession(chatId: number, threadId?: number): Promise<boolean> {
    const session = this.getSession(chatId, threadId);
    if (session) {
      if (session.isRunning) {
        return false;
      }
      await fs.rm(session.sessionDir, { recursive: true, force: true });
      await fs.mkdir(session.sessionDir, { recursive: true, mode: 0o700 });
      session.totalTokens = 0;
      session.totalCost = 0;
      return true;
    }
    return true;
  }

  cancelTask(chatId: number, threadId?: number): boolean {
    const session = this.getSession(chatId, threadId);
    if (session?.isRunning && session.currentProcessAbortController) {
      session.currentProcessAbortController.abort();
      return true;
    }
    return false;
  }

  setModel(chatId: number, model: string, threadId?: number): void {
    const session = this.getSession(chatId, threadId);
    if (session) {
      session.model = model;
    }
  }

  setApprovalMode(
    chatId: number,
    mode: "yolo" | "write" | "always-ask",
    threadId?: number,
  ): void {
    const session = this.getSession(chatId, threadId);
    if (session) {
      session.approvalMode = mode;
    }
  }

  setThinkingLevel(chatId: number, level: string, threadId?: number): void {
    const session = this.getSession(chatId, threadId);
    if (session) {
      session.thinkingLevel = level;
    }
  }

  async executePrompt(
    chatId: number,
    userId: number,
    username: string | undefined,
    prompt: string,
    streamer: TelegramStreamConsumer,
    threadId?: number,
  ): Promise<void> {
    if (prompt.length > this.config.maxInputChars) {
      throw new Error(`Message exceeds the ${this.config.maxInputChars}-character limit.`);
    }
    if (!this.modelCatalog) {
      throw new Error("OMP model catalog has not been loaded at startup.");
    }
    const session = await this.getOrCreateSession(chatId, userId, username, threadId);

    if (session.isRunning) {
      throw new Error("Another agent task is already running in this chat. Send /cancel to stop it.");
    }

    session.isRunning = true;
    const abortController = new AbortController();
    session.currentProcessAbortController = abortController;

    if (session.model) {
      const model = this.modelCatalog.find((item) => item.selector === session.model);
      if (!model) {
        session.isRunning = false;
        session.currentProcessAbortController = undefined;
        throw new Error("The configured model is not available in the active OMP profile. Use /models.");
      }
      const supported = this.getThinkingOptions(model);
      if (!supported.includes(session.thinkingLevel)) {
        session.thinkingLevel = model.reasoning ? "auto" : "off";
      }
    }

    const ompBin = await this.resolveOmpExecutable();

    const args = [
      "--mode",
      "json",
      "-p",
      "--session-dir",
      session.sessionDir,
      "--cwd",
      session.workspaceDir,
      "--approval-mode",
      session.approvalMode,
      "--thinking",
      session.thinkingLevel,
    ];

    if (session.model) {
      args.push("--model", session.model);
    }
    if (this.config.smolModel) {
      args.push("--smol", this.config.smolModel);
    }
    if (this.config.slowModel) {
      args.push("--slow", this.config.slowModel);
    }
    if (this.config.systemPrompt) {
      args.push("--append-system-prompt", this.config.systemPrompt);
    }

    args.push("--continue");

    let hasStreamedText = false;
    let stderrOutput = "";
    let nonJsonStdout = "";

    try {
      await streamer.start();
      const home = os.homedir();
      const customPath = [
        path.join(home, ".bun", "bin"),
        path.join(home, ".local", "bin"),
        "/usr/local/bin",
        "/usr/bin",
        process.env.PATH || "",
      ].join(":");

      const proc = Bun.spawn([ompBin, ...args], {
        cwd: session.workspaceDir,
        env: {
          ...this.getOmpEnvironment(),
          PATH: customPath,
        },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        signal: abortController.signal,
      });
      proc.stdin.write(prompt);
      proc.stdin.end();

      const stdoutDecoder = new TextDecoder();
      const stderrDecoder = new TextDecoder();

      // Read stderr in background
      const stderrPromise = (async () => {
        try {
          const stderrReader = proc.stderr.getReader();
          while (true) {
            const { done, value } = await stderrReader.read();
            if (done) break;
            stderrOutput = (stderrOutput + stderrDecoder.decode(value, { stream: true })).slice(-64_000);
          }
          stderrOutput += stderrDecoder.decode();
        } catch {
          // Ignored
        }
      })();

      // Read stdout JSON stream
      const stdoutReader = proc.stdout.getReader();
      let buffer = "";

      while (true) {
        const { done, value } = await stdoutReader.read();
        if (done) break;

        buffer += stdoutDecoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith("{")) {
            try {
              const event = JSON.parse(trimmed) as OmpStreamEvent;
              if (this.handleStreamEvent(event, streamer, session)) {
                hasStreamedText = true;
              }
            } catch {
              nonJsonStdout = (nonJsonStdout + `${trimmed}\n`).slice(-64_000);
            }
          } else {
            nonJsonStdout = (nonJsonStdout + `${trimmed}\n`).slice(-64_000);
          }
        }
      }
      buffer += stdoutDecoder.decode();

      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("{")) {
          try {
            const event = JSON.parse(trimmed) as OmpStreamEvent;
            if (this.handleStreamEvent(event, streamer, session)) {
              hasStreamedText = true;
            }
          } catch {
            nonJsonStdout = (nonJsonStdout + `${trimmed}\n`).slice(-64_000);
          }
        } else {
          nonJsonStdout = (nonJsonStdout + `${trimmed}\n`).slice(-64_000);
        }
      }

      await Promise.all([proc.exited, stderrPromise]);

      const exitCode = proc.exitCode;
      if (exitCode !== 0 || !hasStreamedText) {
        const fullError = (stderrOutput + "\n" + nonJsonStdout).trim();
        if (fullError && !abortController.signal.aborted) {
          console.error(`[OMP Process Exit ${exitCode}]:`, redactSensitive(fullError).slice(0, 4000));
          let userHint = '<tg-emoji emoji-id="5305423313764363203">🤫</tg-emoji> <i>Проверьте авторизацию в OMP или укажите API-ключ в .env.</i>';
          if (fullError.includes("403") || fullError.includes("Cloud Code Assist")) {
            userHint = '<tg-emoji emoji-id="5305423313764363203">🤫</tg-emoji> <b>Google Cloud Code Assist (403):</b> <i>Исчерпан дневной лимит запросов Google Antigravity (Quota Limit) или IP сервера временно заблокирован Google. Смените модель через /model или укажите API-ключ в .env.</i>';
          }
          streamer.onTextDelta(
            `\n\n<blockquote><tg-emoji emoji-id="5350400112503845756">🔥</tg-emoji> <b>Ошибка провайдера OMP.</b> Подробности записаны в журнал сервера.</blockquote>\n\n${userHint}`,
          );
        } else if (!hasStreamedText && !abortController.signal.aborted) {
          streamer.onTextDelta(
            '\n\n<blockquote><tg-emoji emoji-id="5350400112503845756">🔥</tg-emoji> <b>Агент завершил работу без ответа.</b>\nВозможно, исчерпан лимит запросов текущей модели. Попробуйте сменить модель через /model.</blockquote>',
          );
        }
      }
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        streamer.onTextDelta("\n\n<i>⛔ Задача прервана пользователем.</i>");
      } else {
        console.error("OMP execution error:", err instanceof Error ? err.message : String(err));
        streamer.onTextDelta(
          '\n\n<blockquote><tg-emoji emoji-id="5350400112503845756">🔥</tg-emoji> <b>Системная ошибка агента.</b> Подробности записаны в журнал сервера.</blockquote>',
        );
      }
    } finally {
      if (session.currentProcessAbortController === abortController) {
        session.isRunning = false;
        session.currentProcessAbortController = undefined;
      }
      await streamer.finalize();
    }
  }

  private handleStreamEvent(
    event: OmpStreamEvent,
    streamer: TelegramStreamConsumer,
    session: ChatSessionState,
  ): boolean {
    let producedText = false;
    switch (event.type) {
      case "turn_start":
        streamer.onTurnStart();
        break;

      case "tool_execution_start":
        streamer.onToolStart(
          String(event.toolName),
          (event.args as Record<string, unknown>) || {},
          event.intent ? String(event.intent) : undefined,
        );
        break;

      case "tool_execution_end":
        streamer.onToolEnd(
          String(event.toolName),
          event.result,
          Boolean(event.isError),
        );
        break;

      case "message_update": {
        const update = event.assistantMessageEvent as
          | { type: string; delta?: string; content?: string }
          | undefined;
        if (update && update.type === "text_delta" && update.delta) {
          streamer.onTextDelta(update.delta);
          producedText = true;
        }
        break;
      }

      case "turn_end": {
        const msg = event.message as
          | { usage?: { totalTokens?: number; cost?: { total?: number } } }
          | undefined;
        if (msg?.usage?.totalTokens) {
          session.totalTokens += msg.usage.totalTokens;
        }
        if (msg?.usage?.cost?.total) {
          session.totalCost += msg.usage.cost.total;
        }
        break;
      }

      default:
        break;
    }
    return producedText;
  }
}
