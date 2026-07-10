#!/usr/bin/env bash
#
# install-mac.sh — one-shot setup for Aurora Streamer on macOS.
#
# Installs node deps, downloads the correct rclone binary for this Mac
# (Intel vs Apple Silicon), clears its Gatekeeper quarantine, and scaffolds
# the credential files. Safe to re-run.
#
# Usage:  ./install-mac.sh
#
set -euo pipefail

# Move to the directory this script lives in (the project root).
cd "$(dirname "$0")"

info()  { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
warn()  { printf '\033[1;33m[!]\033[0m %s\n' "$1"; }
ok()    { printf '\033[1;32m[✓]\033[0m %s\n' "$1"; }
die()   { printf '\033[1;31m[x]\033[0m %s\n' "$1" >&2; exit 1; }

# --- 0. Sanity: are we on macOS? ---------------------------------------------
if [[ "$(uname -s)" != "Darwin" ]]; then
  die "This script is for macOS only. On Windows use the rclone.exe instructions in the README."
fi

# --- 1. Node.js --------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  die "Node.js not found. Install it first (e.g. 'brew install node') then re-run."
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 18 )); then
  die "Node.js v18+ required, found v$(node -v). Upgrade then re-run."
fi
ok "Node.js $(node -v) detected"

# --- 2. npm install ----------------------------------------------------------
info "Installing npm dependencies..."
npm install
ok "Dependencies installed"

# --- 3. rclone binary --------------------------------------------------------
if [[ -x "./rclone" ]]; then
  ok "rclone binary already present, skipping download"
else
  # Pick the build that matches this Mac's CPU.
  case "$(uname -m)" in
    arm64) RCLONE_ARCH="osx-arm64" ;;
    x86_64) RCLONE_ARCH="osx-amd64" ;;
    *) die "Unknown CPU architecture '$(uname -m)'. Download rclone manually from https://rclone.org/downloads/ and place it as ./rclone" ;;
  esac

  ZIP_URL="https://downloads.rclone.org/rclone-current-${RCLONE_ARCH}.zip"
  info "Downloading rclone for ${RCLONE_ARCH}..."

  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  curl -fsSL "$ZIP_URL" -o "$TMP_DIR/rclone.zip" || die "Failed to download rclone from $ZIP_URL"
  unzip -q "$TMP_DIR/rclone.zip" -d "$TMP_DIR"

  # The zip extracts to a versioned folder like rclone-v1.6x.x-osx-arm64/rclone.
  EXTRACTED="$(find "$TMP_DIR" -type f -name rclone | head -n 1)"
  [[ -n "$EXTRACTED" ]] || die "Could not locate rclone binary inside the downloaded archive"

  cp "$EXTRACTED" ./rclone
  chmod +x ./rclone
  ok "rclone binary installed at ./rclone"
fi

# Clear the Gatekeeper quarantine flag so macOS doesn't block the binary.
xattr -d com.apple.quarantine ./rclone 2>/dev/null || true
ok "Cleared Gatekeeper quarantine on ./rclone"

# --- 4. Credential scaffolding ----------------------------------------------
if [[ ! -f ./sa.json ]]; then
  cp sa.json.example sa.json
  warn "Created sa.json from example — edit it with your Google service account key."
else
  ok "sa.json already exists"
fi

if [[ ! -f ./rclone.conf ]]; then
  cp rclone.conf.example rclone.conf
  warn "Created rclone.conf from example — set your Drive root_folder_id in it."
else
  ok "rclone.conf already exists"
fi

# --- 5. Done -----------------------------------------------------------------
echo
ok "Setup complete!"
echo
echo "Next steps:"
echo "  1. Edit sa.json with your Google service account credentials."
echo "  2. Edit rclone.conf with your Google Drive folder ID."
echo "  3. Run the app:  npm run electron:dev"
echo
