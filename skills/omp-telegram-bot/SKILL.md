---
name: omp-telegram-bot
description: "Deploy, configure, and operate a universal Telegram Bot for Oh My Pi (omp) AI coding agent with real-time streaming, session isolation, rich HTML/custom emoji formatting, and full tool execution."
version: 1.0.0
author: Antigravity / OMP
license: MIT
platforms: [linux, macos, wsl, telegram]
metadata:
  tags: [telegram, bot, omp, streaming, agent, deployment, automation]
---

# OMP Telegram Bot Deployment & Operation Skill

Use this skill when you need to deploy, configure, customize, or maintain a Telegram Bot interface for the **Oh My Pi (`omp`)** AI coding agent.

---

## 1. Architecture Overview

The OMP Telegram Bot bridges Telegram users and groups directly to the `omp` agent runtime with:
- **Real-Time Streaming:** Progressive token streaming & live tool execution badges (`⚙️ bash`, `📖 read`, `✏️ edit`, `📝 write`, `🔍 search`).
- **Session & Workspace Isolation:** Each chat ID gets its own dedicated session context (`~/.omp/telegram-sessions/<chat_id>`) and isolated workspace directory (`~/.omp/telegram-workspaces/<chat_id>`).
- **Strict Owner & ACL Middleware:** Magic filters restrict access strictly to `BOT_OWNER_ID` or whitelisted users.
- **Rich Telegram Formatting:** GFM Markdown converted to Telegram HTML, code blocks, spoilers, blockquotes, mobile-friendly table cards, and Telegram Premium custom emojis.
- **Interactive Control Tags:**
  - Reactions: `<tg-react emoji="🔥"/>`, `<tg-react emoji="❤"/>`
  - Stickers: `<tg-sticker tag="heart"/>`
  - Custom Emojis: `<tg-emoji emoji-id="...">✨</tg-emoji>`
  - Reasoning suppression: `<think>...</think>` stripped from user output.
- **Multi-Modal Attachments:** Inbound photos and documents are automatically downloaded into the workspace and referenced in agent prompts (`@downloads/photo.jpg`).

---

## 2. Quick Start

```bash
git clone https://github.com/SkrudjReal/oh-my-pi-tgbot.git
cd oh-my-pi-tgbot
cp .env.example .env
# Set TELEGRAM_BOT_TOKEN and BOT_OWNER_ID in .env
bun run start
```
