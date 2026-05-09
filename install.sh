#!/usr/bin/env bash
set -euo pipefail

# ── config ────────────────────────────────────────────────────────────────────
REPO="esurkov1/agentsync"          # ← замени на свой repo
INSTALL_DIR="$HOME/.agentsync"
BIN="$INSTALL_DIR/bin/agentsync"
PUBLIC_DIR="$INSTALL_DIR/public"
LOG_DIR="$INSTALL_DIR/logs"
PORT="${AGENTSYNC_PORT:-3141}"
# ─────────────────────────────────────────────────────────────────────────────

OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Darwin|Linux) ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

echo "▶ Installing AgentSync..."

# ── detect latest version ────────────────────────────────────────────────────
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep '"tag_name"' | sed 's/.*"tag_name": *"\(.*\)".*/\1/')
echo "  Version: $LATEST"

# ── download & extract ───────────────────────────────────────────────────────
TARBALL="agentsync-${OS}-${ARCH}.tar.gz"
URL="https://github.com/$REPO/releases/download/$LATEST/$TARBALL"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "  Downloading $TARBALL..."
curl -fsSL "$URL" -o "$TMP/$TARBALL"
tar -xzf "$TMP/$TARBALL" -C "$TMP"

# ── install files ─────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR/bin" "$PUBLIC_DIR" "$LOG_DIR"
cp "$TMP/agentsync" "$BIN"
chmod +x "$BIN"
rsync -a --delete "$TMP/public/" "$PUBLIC_DIR/"

# ── setup background service ─────────────────────────────────────────────────
if [ "$OS" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/com.agentsync.app.plist"
  cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.agentsync.app</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BIN</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>$HOME</string>
    <key>PORT</key>
    <string>$PORT</string>
    <key>AGENTSYNC_PUBLIC_DIR</key>
    <string>$PUBLIC_DIR</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/agentsync.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/agentsync.error.log</string>
</dict>
</plist>
PLIST_EOF

  # stop old instance if running
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load -w "$PLIST"
  echo "  Service registered with launchd (auto-starts on login)"

elif [ "$OS" = "Linux" ]; then
  UNIT_DIR="$HOME/.config/systemd/user"
  mkdir -p "$UNIT_DIR"
  cat > "$UNIT_DIR/agentsync.service" <<UNIT_EOF
[Unit]
Description=AgentSync
After=network.target

[Service]
ExecStart=$BIN
Environment=HOME=$HOME
Environment=PORT=$PORT
Environment=AGENTSYNC_PUBLIC_DIR=$PUBLIC_DIR
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT_EOF

  systemctl --user daemon-reload
  systemctl --user enable --now agentsync.service
  echo "  Service registered with systemd (auto-starts on login)"
  echo "  Logs: journalctl --user -u agentsync -f"
fi

# ── symlink to PATH ───────────────────────────────────────────────────────────
for dir in /usr/local/bin "$HOME/.local/bin"; do
  if echo "$PATH" | grep -q "$dir" && [ -w "$dir" ] 2>/dev/null || [ -w "$(dirname $dir)" ] 2>/dev/null; then
    ln -sf "$BIN" "$dir/agentsync" 2>/dev/null && break
  fi
done

# ── open browser ──────────────────────────────────────────────────────────────
sleep 1
URL="http://localhost:$PORT"
echo ""
echo "✓ AgentSync installed and running at $URL"
echo ""
if [ "$OS" = "Darwin" ]; then
  open "$URL" 2>/dev/null || true
elif command -v xdg-open &>/dev/null; then
  xdg-open "$URL" 2>/dev/null || true
fi

echo "To uninstall:"
if [ "$OS" = "Darwin" ]; then
  echo "  launchctl unload ~/Library/LaunchAgents/com.agentsync.app.plist"
else
  echo "  systemctl --user disable --now agentsync.service"
fi
echo "  rm -rf $INSTALL_DIR"
