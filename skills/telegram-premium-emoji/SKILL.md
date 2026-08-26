---
name: telegram-premium-emoji
description: "Universal Telegram Premium emoji, custom reactions (<tg-react>), stickers (<tg-sticker>), and aesthetic blockquote formatting skill for AI agents."
version: 3.2.0
author: Antigravity / OMP
license: MIT
platforms: [linux, macos, wsl, telegram]
metadata:
  tags: [telegram, premium-emoji, custom-emoji, reactions, formatting, stickers, aura_maogui, tgcolor2Emoji, blockquote]
---

# Universal Telegram Premium Emoji, Reactions & Blockquote Styling Skill

Use this skill when interacting with users on Telegram to produce high-engagement, visually stunning, and structured responses using **Telegram Premium Custom Emojis**, native **HTML Blockquotes**, **Reactions**, and **Stickers**.

---

## 1. Core Telegram Output Rules

1. **ALWAYS USE TELEGRAM PREMIUM CUSTOM EMOJIS BY DEFAULT:**
   In **EVERY** response, naturally include 1–3 Telegram Premium Custom Emojis (`<tg-emoji emoji-id="...">char</tg-emoji>`) from the verified catalog below. Match the emoji visually to the conversational context.
2. **BLOCKQUOTE FORMATTING WITHOUT NEWLINES (`<blockquote>text</blockquote>`):**
   * Blockquote tags MUST NOT contain internal leading/trailing newlines: use `<blockquote>text</blockquote>`, **NEVER** `<blockquote>\ntext\n</blockquote>`.
   * For long summaries, code explanations, or lists (>180 characters or >=4 lines), use `<blockquote expandable>text</blockquote>`.
3. **STRICT REACTION RULES (1 OUT OF 10 MESSAGES):**
   * **Only 4 reactions are allowed:** `❤`, `👍`, `🔥`, `👎`.
   * **Frequency:** Use reactions sparingly (~1 in 10 messages) for high-impact moments.
   * Syntax: `<tg-react emoji="🔥"/>`, `<tg-react emoji="❤"/>`, `<tg-react emoji="👍"/>`, `<tg-react emoji="👎"/>`.

---

## 2. Complete Visual Emoji Catalog & Semantic Guide

### Pack 1: `aura_maogui` (https://t.me/addemoji/aura_maogui)
*Aesthetic pastel & aura glowing custom emojis for warmth, polish, highlights, and moods:*

| Visual Appearance | Custom Emoji Tag | Semantic Context & When to Use |
|---|---|---|
| 💖 **Pink Sparkle Heart** | `<tg-emoji emoji-id="6136716054971291812">💖</tg-emoji>` | Warm gratitude, affectionate greeting, sincere appreciation, friendship. |
| 💙 **Cyan/Blue Aura Heart** | `<tg-emoji emoji-id="6136173424508146905">💙</tg-emoji>` | Calm confidence, technical harmony, deep intellectual trust, reassurance. |
| 🤍 **Pure White Heart** | `<tg-emoji emoji-id="6136594580411258751">🤍</tg-emoji>` | Clean start, simplicity, honest feedback, pure logic, minimalism. |
| 💜 **Neon Violet Heart** | `<tg-emoji emoji-id="6136436598629209942">💜</tg-emoji>` | Creative inspiration, UI aesthetics, modern design ideas, mystery. |
| 💛 **Golden Sun Heart** | `<tg-emoji emoji-id="6136400971875490032">💛</tg-emoji>` | Daytime energy, bright encouragement, cheerful support, friendliness. |
| 💓 **Beating Pulse Heart** | `<tg-emoji emoji-id="6136619529876280416">💓</tg-emoji>` | Live agent progress, heartbeat, excited anticipation of results. |
| ✨ **Gold Shimmer Sparkle** | `<tg-emoji emoji-id="6136155901041578903">✨</tg-emoji>` | Polish, elegance, successful setup, new release, fresh feature. |
| 🌟 **Soft Glowing Star** | `<tg-emoji emoji-id="6136441086870033177">🌟</tg-emoji>` | Key takeaway, standout achievement, best practice recommendation. |
| 💫 **Dizzy Star Swirl** | `<tg-emoji emoji-id="6138688273888842147">💫</tg-emoji>` | Dynamic transformation, refactoring in progress, creative flow. |
| ⚡️ **Cyan Lightning Bolt** | `<tg-emoji emoji-id="6138837841829957663">⚡️</tg-emoji>` | Lightning speed, instant benchmarks, performance optimizations, quick tasks. |
| 👑 **Royal Gold Crown** | `<tg-emoji emoji-id="6136387648886935976">👑</tg-emoji>` | Master-level solution, top tier architecture, leader status, perfection. |
| 💎 **Sparkling Diamond** | `<tg-emoji emoji-id="6136408896090150077">💎</tg-emoji>` | High code quality, robust type safety, luxury finish, solid security. |
| ✅ **Glowing Green Check** | `<tg-emoji emoji-id="6138879610386912023">✅</tg-emoji>` | Tests passed, build succeeded, criteria verified, task completed. |
| ✍️ **Golden Writing Pen** | `<tg-emoji emoji-id="6136251919330449174">✍️</tg-emoji>` | Code drafting, writing documentation, crafting reports, script authoring. |
| 🦋 **Cyan Aura Butterfly** | `<tg-emoji emoji-id="6136257464133228971">🦋</tg-emoji>` | Frontend grace, lightweight design, smooth animations, visual charm. |
| 🦋 **Pastel Pink Butterfly** | `<tg-emoji emoji-id="6138489610176567084">🦋</tg-emoji>` | Soft aesthetic touches, warm UI components, gentle notifications. |
| 🥂 **Champagne Toast** | `<tg-emoji emoji-id="6136585685533986833">🥂</tg-emoji>` | Production deploy celebration, milestone completion, partnership cheer. |
| 🎈 **Party Balloon** | `<tg-emoji emoji-id="6138564196578629134">🎈</tg-emoji>` | New repository created, launch day, birthday/anniversary event. |
| 💌 **Sealed Love Letter** | `<tg-emoji emoji-id="6136431745316164849">💌</tg-emoji>` | Summary delivered to user, personal note, private configuration. |
| 🗝️ **Golden Key** | `<tg-emoji emoji-id="6136433510547722946">🗝️</tg-emoji>` | API keys, credentials, authentication middleware, unlocking features. |
| 💭 **Dream Thought Bubble** | `<tg-emoji emoji-id="6138891760849395517">💭</tg-emoji>` | Agent reasoning phase, architectural planning, conceptual brainstorming. |
| 💐 **Pastel Flower Bouquet** | `<tg-emoji emoji-id="6136264903016584020">💐</tg-emoji>` | Warm welcoming, sincere congratulations, team appreciation. |
| 🫙 **Glowing Memory Jar** | `<tg-emoji emoji-id="6136355458107052770">🫙</tg-emoji>` | Long-term memory preservation, session saving, persistent caching. |
| 🤫 **Shh / Secret Finger** | `<tg-emoji emoji-id="5305423313764363203">🤫</tg-emoji>` | Pro tips, secret shortcuts, internal mechanics, confidential notes. |

---

### Pack 2: `tgcolor2Emoji` (https://t.me/addemoji/tgcolor2Emoji)
*Vibrant color-coordinated UI elements, code tools, folders, and status markers:*

| Visual Appearance | Custom Emoji Tag | Semantic Context & When to Use |
|---|---|---|
| 📖 **Cyan Tech Book** | `<tg-emoji emoji-id="5348202175875016422">📖</tg-emoji>` | Technical documentation, API reference, user guides, specifications. |
| 📖 **Purple Deep Book** | `<tg-emoji emoji-id="5350727663889708002">📖</tg-emoji>` | Deep architectural papers, research, complex logic manuals. |
| 📁 **Neon Cyan Folder** | `<tg-emoji emoji-id="5348222744473398688">📁</tg-emoji>` | Workspace paths, directory listings, project roots, file structures. |
| 📁 **Royal Purple Folder** | `<tg-emoji emoji-id="5350726860730821119">📁</tg-emoji>` | Archived builds, bundled artifacts, output packages, submodules. |
| ✏️ **Cyan Code Pencil** | `<tg-emoji emoji-id="5348318754172331709">✏️</tg-emoji>` | File editing, surgical code changes, AST modifications, renaming. |
| ✏️ **Purple Refactor Pencil** | `<tg-emoji emoji-id="5350448452360758866">✏️</tg-emoji>` | Major refactoring, codebase modernization, architectural redesign. |
| 🔥 **Violet Cyber Flame** | `<tg-emoji emoji-id="5350400112503845756">🔥</tg-emoji>` | Blazing fast execution, high priority tasks, critical optimizations. |
| 🔥 **Orange Warm Flame** | `<tg-emoji emoji-id="5348495427652053799">🔥</tg-emoji>` | Live terminal streaming, hot reload active, active background job. |
| 💎 **Neon Cyan Crystal** | `<tg-emoji emoji-id="5348405014295506484">💎</tg-emoji>` | Premium features, high performance, crystal clear code flow. |
| 💎 **Violet Amethyst Gem** | `<tg-emoji emoji-id="5348576727088000746">💎</tg-emoji>` | Advanced AI model selection, deep reasoning insights. |
| 💸 **Flying Dollar Wings** | `<tg-emoji emoji-id="5350809706354993830">💸</tg-emoji>` | Token usage tracking, cost calculations, billing limits, pricing metrics. |
| 🕯 **Golden Candle** | `<tg-emoji emoji-id="5348248802039984892">🕯</tg-emoji>` | Late-night coding sessions, focused debug runs, quiet concentration. |
| 🎀 **Pink Silk Ribbon** | `<tg-emoji emoji-id="5350586578508997678">🎀</tg-emoji>` | Decorative accent for release notes, cute greetings, visual separation. |
| 🍰 **Berry Slice Cake** | `<tg-emoji emoji-id="5348184944466230619">🍰</tg-emoji>` | Achievement unlocked, successful test suite pass, rewarding progress. |
| 🦄 **Magical Unicorn** | `<tg-emoji emoji-id="5348422915719197183">🦄</tg-emoji>` | Innovative ideas, rare bug discoveries, unique solutions. |
| 🦝 **Cute Enot / Raccoon** | `<tg-emoji emoji-id="5350685010569488950">🦝</tg-emoji>` | Friendly bot persona mascot, playful helper, clever problem solver. |
| 🕶 **Cool Hacker Glasses** | `<tg-emoji emoji-id="5348147750049445535">🕶</tg-emoji>` | YOLO mode activated, terminal power user, DevOps automation. |
| 🔘 **Cyan Radio Button** | `<tg-emoji emoji-id="5348143833039271673">🔘</tg-emoji>` | Configuration toggles, menu options, state indicators. |
| ⬅️ **Cyan Left Arrow** | `<tg-emoji emoji-id="5350287743274477436">⬅️</tg-emoji>` | Back navigation, previous step, reverting changes. |
| ➡️ **Cyan Right Arrow** | `<tg-emoji emoji-id="5348142926801170568">➡️</tg-emoji>` | Forward workflow, next step in checklist, proceeding. |

---

## 3. Example Response Templates

### Example 1: Code Fix & Verification
```html
<tg-react emoji="🔥"/>
<b>🚀 Исправление успешно применено!</b> <tg-emoji emoji-id="6136155901041578903">✨</tg-emoji>

<blockquote><tg-emoji emoji-id="6138879610386912023">✅</tg-emoji> Все 19 автоматических тестов пройдены без единой ошибки.
<tg-emoji emoji-id="5348222744473398688">📁</tg-emoji> Изменения зафиксированы в репозитории.</blockquote>

<tg-emoji emoji-id="5348202175875016422">📖</tg-emoji> <b>Что было изменено:</b>
• Устранен лишний перенос строки в блоках <code>&lt;blockquote&gt;</code>
• Внедрен автоматический переход на <code>&lt;blockquote expandable&gt;</code> при объемном выводе
• Ограничены реакции до 4 строгих эмодзи с частотой 1/10

<blockquote><tg-emoji emoji-id="5305423313764363203">🤫</tg-emoji> <i>Совет: Для сброса контекста используйте /new или inline-кнопку.</i></blockquote>
```

### Example 2: Expandable Summary
```html
<blockquote expandable><tg-emoji emoji-id="5348222744473398688">📁</tg-emoji> <b>Подробный журнал изменений:</b>
• Добавлены визуальные описания всех 380+ кастомных эмодзи
• Настроен авто-промпт Telegram System Prompt
• Защищены нативные HTML-теги от экранирования</blockquote>
```
