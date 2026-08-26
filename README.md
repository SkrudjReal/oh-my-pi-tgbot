<p align="center">
  <img src="https://github.com/can1357/oh-my-pi/blob/main/assets/hero.png?raw=true" alt="oh-my-pi-tgbot" width="480">
</p>

<h1 align="center">⚡ oh-my-pi-tgbot</h1>

<p align="center">
  <strong>Universal Telegram Bot & Streaming Bridge for Oh My Pi (omp) AI Coding Agent</strong><br>
  Strict Owner Authentication Middleware · Live Tool Execution Badges · Real-Time Token Streaming · Telegram Premium Custom Emojis & Reactions
</p>

<p align="center">
  <a href="https://omp.sh"><img src="https://img.shields.io/badge/Powered%20by-Oh%20My%20Pi-CB3837?style=flat&colorA=222222" alt="OMP"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Runtime-Bun-f472b6?style=flat&colorA=222222" alt="Bun"></a>
  <a href="https://core.telegram.org/bots/api"><img src="https://img.shields.io/badge/Telegram-Bot%20API-2CA5E0?style=flat&colorA=222222&logo=telegram&logoColor=white" alt="Telegram"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-58A6FF?style=flat&colorA=222222" alt="License"></a>
</p>

---

## 🌟 Overview

**`oh-my-pi-tgbot`** is a standalone, universal, and production-grade Telegram Bot bridge for **[Oh My Pi (`omp`)](https://github.com/can1357/oh-my-pi)** — the leading open coding agent harness.

Combining the emotional responsiveness and live streaming patterns of **Geminka Agent** with the production resilience, rate limiting, and attachment management of **Hermes Agent**, this bot provides a secure interface for executing code, managing servers, and interacting with LLMs directly from Telegram.

---

## ✨ Key Features

- 🔒 **Strict Owner Middleware & Magic Filters:**
  - Configurable via `BOT_OWNER_ID` in `.env`.
  - Automatically drops or rejects any unauthorized interactions before reaching the agent.
  - Access is always restricted to the numeric `BOT_OWNER_ID`; there is no public or whitelist mode.

- ⚡ **Real-Time Live Token Streaming:**
  - Progressive message updates with intelligent debouncing (~1.2s) to prevent Telegram API `429 Too Many Requests`.
  - Live tool status badges during execution:
    - `⚙️ bash: [command]`
    - `📖 read: [path]`
    - `✏️ edit: [file]`
    - `📝 write: [path]`
    - `🔍 search: [query]`
    - `🌐 web_search: [query]`
    - `🤖 subagent: [task]`

- 📁 **Per-Chat Session & Workspace Isolation:**
  - Every user / group / topic gets an isolated session directory (`~/.omp/telegram-sessions/<chat_id>`) and independent working directory (`~/.omp/telegram-workspaces/<chat_id>`).

- 🎨 **Rich Formatting & Mobile Cards:**
  - GitHub Flavored Markdown automatically converted to clean Telegram HTML.
  - GFM pipe tables are transformed into sleek mobile card views.
  - Automatic suppression of internal reasoning scratchpads (`<think>...</think>`).

- 💎 **Telegram Premium & Interactive Markup:**
  - Native rendering of Telegram Premium Custom Emojis: `<tg-emoji emoji-id="...">✨</tg-emoji>`.
  - Message reactions: `<tg-react emoji="🔥"/>`, `<tg-react emoji="❤"/>` (automatically added to user's message).
  - Sticker dispatching: `<tg-sticker tag="celebration"/>`.

- 📎 **Multi-Modal Attachment Ingestion:**
  - Inbound photos, code files, archives, documents, and voice notes are automatically downloaded into the workspace and referenced for agent analysis (`@downloads/file.ext`).

- 🛑 **Instant Task Cancellation:**
  - `/cancel` stops any active subagent or terminal process immediately.

---

## 🚀 Quick Start

### 1. Prerequisites
* [Bun](https://bun.sh/docs/installation) (version 1.3.14+), installed using the verified platform-specific instructions.
* [Oh My Pi (`omp`)](https://omp.sh):
  ```bash
  bun add -g @oh-my-pi/pi-coding-agent
  ```

### 2. Clone and Setup `.env`
```bash
git clone https://github.com/SkrudjReal/oh-my-pi-tgbot.git
cd oh-my-pi-tgbot
cp .env.example .env
```

Edit `.env`:
```ini
# Bot token from @BotFather
TELEGRAM_BOT_TOKEN=YOUR_NEW_BOTFATHER_TOKEN

# Your Telegram numeric ID from @userinfobot (e.g. 123456789)
BOT_OWNER_ID=123456789

# AI Model
OMP_MODEL=google-antigravity/gemini-3.7-flash
OMP_AUTO_APPROVE=yolo
```

> If a real bot token was ever committed, remove it from the current files **and revoke it with
> @BotFather**. Deleting it from `HEAD` does not invalidate the token or erase it from Git history.

### 3. Launch the Bot
```bash
bun run start
```
Or run the all-in-one deploy script:
```bash
./deploy.sh
```

---

## ⚙️ Configuration Reference

| Variable | Type | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | string | *required* | Telegram Bot API Token from @BotFather |
| `BOT_OWNER_ID` | number | *required* | The only Telegram user ID allowed to use the bot |
| `OMP_MODEL` | string | `gemini-3.7-flash` | Default model for conversations |
| `OMP_AUTO_APPROVE` | string | `yolo` | Tool approval mode: `yolo`, `write`, `always-ask` |
| `OMP_THINKING_LEVEL` | string | `low` | Initial effort; `/thinking` later limits choices to the selected model's capabilities |
| `MAX_INPUT_CHARS` | number | `16384` | Maximum prompt/context length |
| `MAX_ATTACHMENT_BYTES` | number | `20971520` | Maximum bytes downloaded per attachment |
| `ENABLE_STREAMING` | boolean | `true` | Enable live progressive message editing |
| `STREAM_DEBOUNCE_MS` | number | `1200` | Minimum throttle delay between Telegram edits (ms) |
| `ENABLE_REACTIONS` | boolean | `true` | Enable native Telegram message reactions |
| `ENABLE_STICKERS` | boolean | `true` | Enable sticker responses |
| `ENABLE_PREMIUM_EMOJI` | boolean | `true` | Enable Telegram Premium custom emojis |
| `BOT_SYSTEM_PROMPT` | string | *empty* | Custom system prompt or persona instructions |

---

## 📱 Bot Commands

- `/start` — Greeting, overview, and current agent configuration.
- `/help` — Complete command reference and markup guide.
- `/new`, `/clear`, `/reset` — Clear conversation history and reset context.
- `/model`, `/models` — Read available models from the active `omp models --json` profile and switch safely.
- `/thinking`, `/effort` — Select only effort levels advertised by the current model.
- `/mode <yolo|write|always-ask>` — Set tool approval level.
- `/status` — View uptime, token consumption, cost estimates, and workspace.
- `/cancel` — Terminate currently running task immediately.

`omp -p` is headless: `yolo` permits read/write/exec, `write` permits read/write and blocks exec,
while `always-ask` permits read-only operations and blocks write/exec because Telegram approval prompts are not implemented.

---

## 🐳 Docker Deployment

```bash
docker compose up -d
```

---

## 🛠 Systemd Service Deployment

```bash
sudo cp omp-telegram.service /etc/systemd/system/
sudo useradd --system --home /var/lib/omp-telegram --shell /usr/sbin/nologin omp-telegram
sudo chown omp-telegram:omp-telegram /opt/oh-my-pi-tgbot/.env
sudo chmod 600 /opt/oh-my-pi-tgbot/.env
sudo systemctl daemon-reload
sudo systemctl enable --now omp-telegram
```

---

## 🧪 Testing

Run the automated test suite with Bun:
```bash
bun test
```

---

## 📄 License

Licensed under the [MIT License](LICENSE).
