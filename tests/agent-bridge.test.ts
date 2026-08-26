import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig } from "../src/core/config";
import { AgentBridge, makeSessionKey } from "../src/services/agent-bridge";
import type { TelegramStreamConsumer } from "../src/services/streamer";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("AgentBridge session isolation", () => {
  test("uses independent sessions for different Telegram topics", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-tgbot-test-"));
    temporaryRoots.push(root);
    const bridge = new AgentBridge(
      loadConfig({
        telegramToken: "mock-token",
        botOwnerId: 123,
        workspaceRoot: path.join(root, "workspaces"),
        sessionRoot: path.join(root, "sessions"),
      }),
    );

    const first = await bridge.getOrCreateSession(-1001, 123, "owner", 10);
    const second = await bridge.getOrCreateSession(-1001, 123, "owner", 20);
    expect(makeSessionKey(-1001, 10)).not.toBe(makeSessionKey(-1001, 20));
    expect(first.sessionDir).not.toBe(second.sessionDir);
    expect(first.workspaceDir).not.toBe(second.workspaceDir);
  });

  test("cancellation keeps the session locked until the process exits", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-tgbot-test-"));
    temporaryRoots.push(root);
    const bridge = new AgentBridge(
      loadConfig({
        telegramToken: "mock-token",
        botOwnerId: 123,
        workspaceRoot: path.join(root, "workspaces"),
        sessionRoot: path.join(root, "sessions"),
      }),
    );
    const session = await bridge.getOrCreateSession(123, 123);
    const controller = new AbortController();
    session.isRunning = true;
    session.currentProcessAbortController = controller;

    expect(bridge.cancelTask(123)).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(session.isRunning).toBe(true);
    expect(await bridge.resetSession(123)).toBe(false);
  });

  test("passes prompts over stdin and strips Telegram credentials from the OMP child", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-tgbot-test-"));
    temporaryRoots.push(root);
    const executable = path.join(root, "fake-omp.sh");
    const argsFile = path.join(root, "args.txt");
    const promptFile = path.join(root, "prompt.txt");
    const tokenFile = path.join(root, "token.txt");
    const modelsFile = path.join(root, "models.txt");
    await fs.writeFile(
      executable,
      `#!/usr/bin/env bash
set -eu
if [ "\${1:-}" = "models" ]; then
  printf 'loaded\n' >> "\${OMP_TEST_MODELS_FILE}"
  printf '%s\\n' '{"models":[{"provider":"test","id":"model","selector":"test/model","name":"Test Model","reasoning":true,"thinking":["low"],"input":["text"]}]}'
  exit 0
fi
printf '%s|%s' "\${TELEGRAM_BOT_TOKEN-unset}" "\${UNRELATED_TEST_SECRET-unset}" > "\${OMP_TEST_TOKEN_FILE}"
printf '%s\\n' "$@" > "\${OMP_TEST_ARGS_FILE}"
payload="$(cat)"
printf '%s' "\${payload}" > "\${OMP_TEST_PROMPT_FILE}"
printf '%s\\n' '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"ok"}}'
`,
      { mode: 0o700 },
    );

    process.env.OMP_TEST_ARGS_FILE = argsFile;
    process.env.OMP_TEST_PROMPT_FILE = promptFile;
    process.env.OMP_TEST_TOKEN_FILE = tokenFile;
    process.env.OMP_TEST_MODELS_FILE = modelsFile;
    process.env.UNRELATED_TEST_SECRET = "must-not-reach-child";
    try {
      const bridge = new AgentBridge(
        loadConfig({
          telegramToken: "mock-token",
          botOwnerId: 123,
          defaultModel: "test/model",
          defaultThinkingLevel: "low",
          systemPrompt: "",
          ompExecutable: executable,
          workspaceRoot: path.join(root, "workspaces"),
          sessionRoot: path.join(root, "sessions"),
        }),
      );
      const streamer = {
        start: async () => undefined,
        onTurnStart: () => undefined,
        onToolStart: () => undefined,
        onToolEnd: () => undefined,
        onTextDelta: () => undefined,
        finalize: async () => undefined,
      } as unknown as TelegramStreamConsumer;
      const prompt = "private prompt sent through stdin";

      await bridge.initializeModelCatalog();
      await bridge.executePrompt(123, 123, "owner", prompt, streamer);
      expect(await fs.readFile(promptFile, "utf-8")).toBe(prompt);

      const followUp = "second prompt reuses the startup catalog";
      await bridge.executePrompt(123, 123, "owner", followUp, streamer);

      expect(await fs.readFile(modelsFile, "utf-8")).toBe("loaded\n");
      expect(await fs.readFile(promptFile, "utf-8")).toBe(followUp);
      expect(await fs.readFile(tokenFile, "utf-8")).toBe("unset|unset");
      expect(await fs.readFile(argsFile, "utf-8")).not.toContain(prompt);
    } finally {
      delete process.env.OMP_TEST_ARGS_FILE;
      delete process.env.OMP_TEST_PROMPT_FILE;
      delete process.env.OMP_TEST_TOKEN_FILE;
      delete process.env.OMP_TEST_MODELS_FILE;
      delete process.env.UNRELATED_TEST_SECRET;
    }
  });
});
