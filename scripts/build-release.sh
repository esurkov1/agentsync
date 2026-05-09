#!/usr/bin/env bash
set -euo pipefail

OS=$(uname -s)
ARCH=$(uname -m)
VERSION=$(bun -e "console.log(require('./package.json').version)" 2>/dev/null || echo "0.1.0")

echo "▶ Building AgentSync v$VERSION for $OS-$ARCH..."

echo "  Building frontend..."
bun run build:client

echo "  Compiling server binary..."
bun build src/server/index.ts --compile --outfile dist/agentsync --target bun

echo "  Packaging..."
mkdir -p dist/release
cd dist
cp -r client public
TARBALL="agentsync-${OS}-${ARCH}.tar.gz"
tar czf "release/$TARBALL" agentsync public
rm -rf public

echo ""
echo "✓ Release ready: dist/release/$TARBALL"
echo ""
echo "Upload dist/release/$TARBALL to GitHub Releases, then users can install with:"
echo "  curl -fsSL https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/install.sh | sh"
