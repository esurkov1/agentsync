# AgentSync

**A unified web UI to manage AI coding agents across your machine.**

AgentSync gives you one place to control rules, skills, sub-agents, MCP servers, hooks, and plugins for every major AI coding framework — without editing config files by hand.

---

## Why AgentSync

Modern developers run multiple AI agents (Claude Code, Codex, Cursor, Windsurf, and others). Each has its own config format, its own folder for skills/agents, and its own rules file. Keeping them in sync is tedious and error-prone.

AgentSync solves this by:

- **Centralizing rules** — write master rules once, sync to every agent with one click
- **Visualizing state** — see at a glance which skills, sub-agents, and MCP servers are active per framework
- **Syncing across tools** — changes propagate to the right config files automatically
- **Browsing and installing** — search skills.sh and GitHub repos directly from the UI

---

## Features

| Feature | Description |
|---|---|
| **Rules** | Master `AGENTS.md` synced to all frameworks; per-agent local overrides |
| **Skills** | Enable/disable skills per agent; create, edit, delete; bulk actions |
| **Agents** | Manage custom sub-agent definitions across all frameworks |
| **MCP Servers** | Enable/disable per framework; test connectivity; rename |
| **Hooks** | Edit global, system, and per-agent hooks with live preview |
| **Plugins** | Manage OMC-style plugins and their manifests |
| **Installer** | Scan GitHub repos and browse skills.sh to install in one click |

---

## Supported Frameworks

AgentSync supports **24 AI coding tools** out of the box:

Claude Code · Codex · OpenCode · Gemini CLI · Cursor Agent · Windsurf · GitHub Copilot · Cline · Roo Code · Goose · AMP · Devin for Terminal · Kimi CLI · Qwen Code · Qodo Gen · Sourcegraph Cody · Kilo Code · OpenClaw · Qoder CLI · Pi · Hermes · Replit Agent · Warp Agent · Shared (`.agents`)

---

## Quick Start

### Install (macOS / Linux)

```sh
curl -fsSL https://raw.githubusercontent.com/esurkov1/agentsync/main/install.sh | sh
```

That's it. The installer will:
1. Download the pre-built binary for your platform
2. Extract it to `~/.agentsync/`
3. Register a background service (launchd on macOS, systemd on Linux) that starts on login
4. Open `http://localhost:3141` in your browser

### Uninstall

**macOS:**
```sh
launchctl unload ~/Library/LaunchAgents/com.agentsync.app.plist
rm -rf ~/.agentsync ~/Library/LaunchAgents/com.agentsync.app.plist
```

**Linux:**
```sh
systemctl --user disable --now agentsync.service
rm -rf ~/.agentsync ~/.config/systemd/user/agentsync.service
```

---

## Logs & Service Management

**macOS:**
```sh
tail -f ~/.agentsync/logs/agentsync.log     # stdout
tail -f ~/.agentsync/logs/agentsync.error.log  # stderr
launchctl stop com.agentsync.app            # stop
launchctl start com.agentsync.app           # start
```

**Linux:**
```sh
journalctl --user -u agentsync -f          # live logs
systemctl --user stop agentsync            # stop
systemctl --user start agentsync           # start
```

**Custom port:**
```sh
AGENTSYNC_PORT=8080 curl -fsSL .../install.sh | sh
```

---

## Development

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.2

### Setup

```sh
git clone https://github.com/esurkov1/agentsync.git
cd agentsync
bun install
bun run dev        # starts server on :3000 and Vite on :5173
```

Open `http://localhost:5173`.

### Build & Release

```sh
# Build frontend + server binary
bun run build:release

# Create platform tarball in dist/release/
bun run package
```

Upload `dist/release/agentsync-Darwin-arm64.tar.gz` (or the Linux equivalent) to a GitHub Release. The install script pulls from GitHub Releases automatically.

---

## Tech Stack

- **Runtime** — [Bun](https://bun.sh)
- **Server** — [Hono](https://hono.dev) (lightweight, fast)
- **Frontend** — React 19 + Vite
- **Editor** — CodeMirror 6 (Markdown, JSON, HTML)
- **Distribution** — single `bun build --compile` binary, no runtime dependencies

---

## License

MIT
