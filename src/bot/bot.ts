/**
 * Main OMP Telegram Bot Service runner.
 */

import type { BotConfig } from "../core/config";
import { AgentBridge } from "../services/agent-bridge";
import { TopicManager } from "../services/topics";
import { setBotCommands } from "./commands-registry";
import { MessageHandler } from "./handlers";
import { TelegramClient } from "./telegram-client";
export class OmpTelegramBot {
  private readonly client: TelegramClient;
  private readonly agentBridge: AgentBridge;
  private readonly messageHandler: MessageHandler;
  private isRunning = false;
  private abortController: AbortController = new AbortController();

  private readonly topicManager: TopicManager;

  constructor(private readonly config: BotConfig) {
    this.client = new TelegramClient(config.telegramToken);
    this.agentBridge = new AgentBridge(config);
    this.topicManager = new TopicManager();
    this.messageHandler = new MessageHandler(
      this.client,
      this.agentBridge,
      config,
      this.topicManager,
    );
  }
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.abortController = new AbortController();

    const models = await this.agentBridge.initializeModelCatalog().catch((error) => {
      this.isRunning = false;
      throw error;
    });
    const me = await this.client.getMe(this.abortController.signal);
    console.log(`🤖 OMP Telegram Bot started as @${me.username} (ID: ${me.id})`);
    console.log(`🎯 Default Model: ${this.config.defaultModel}`);
    console.log(`📚 OMP Model Catalog: ${models.length} models loaded at startup`);
    console.log(`👑 Bot Owner ID: ${this.config.botOwnerId}`);
    console.log("🛡 Access Mode: OWNER ONLY");
    console.log(`📁 Workspace Root: ${this.config.workspaceRoot}`);
    console.log(`⚡ Streaming Enabled: ${this.config.enableStreaming ? "YES" : "NO"}`);
    // Load active forum topics
    await this.topicManager.load();


    // Set Telegram native "/" command popup menu
    await setBotCommands(this.client, this.config);

    let offset = 0;

    while (this.isRunning) {
      try {
        const updates = await this.client.getUpdates(
          {
            offset,
            limit: 100,
            timeout: 25,
            allowed_updates: ["message", "callback_query"],
          },
          this.abortController.signal,
        );

        for (const update of updates) {
          offset = Math.max(offset, update.update_id + 1);

          if (update.message) {
            void this.messageHandler.handleMessage(update.message).catch((err) => {
              console.error("Message handler error:", err instanceof Error ? err.message : String(err));
            });
          } else if (update.callback_query) {
            void this.messageHandler.handleCallbackQuery(update.callback_query).catch((err) => {
              console.error("Callback handler error:", err instanceof Error ? err.message : String(err));
            });
          }
        }
      } catch (err: unknown) {
        if (this.abortController.signal.aborted) {
          break;
        }
        console.error("Polling error:", err instanceof Error ? err.message : String(err));
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    console.log("🛑 OMP Telegram Bot stopped.");
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.abortController.abort();
  }
}
