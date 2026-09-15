#!/usr/bin/env bash
# ============================================================
# LinkedIn Job Bot — One-command Mac setup
# Usage: bash setup.sh
# ============================================================
set -e

BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

log()  { echo -e "${CYAN}${BOLD}[setup]${RESET} $*"; }
ok()   { echo -e "${GREEN}${BOLD}[  ok ]${RESET} $*"; }
warn() { echo -e "${YELLOW}${BOLD}[ warn]${RESET} $*"; }
err()  { echo -e "${RED}${BOLD}[error]${RESET} $*"; exit 1; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     LinkedIn Job Bot — Mac Setup                 ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${RESET}"
echo ""

# ── 1. Node.js ─────────────────────────────────────────────
log "Checking Node.js..."
if ! command -v node &>/dev/null; then
  err "Node.js is not installed. Download it from https://nodejs.org (LTS version) and re-run this script."
fi
NODE_VER=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  err "Node.js v18+ required (you have v${NODE_VER}). Upgrade at https://nodejs.org"
fi
ok "Node.js v${NODE_VER}"

# ── 2. npm install ─────────────────────────────────────────
log "Installing npm dependencies..."
npm install --silent
ok "Dependencies installed"

# ── 3. Playwright Chromium ─────────────────────────────────
log "Installing Playwright Chromium browser..."
npx playwright install chromium
ok "Chromium installed"

# ── 4. Output directories ──────────────────────────────────
log "Creating output directories..."
mkdir -p output/resumes output/cover-letters output/logs browser-data
ok "Directories ready"

# ── 5. .env file ───────────────────────────────────────────
if [ -f .env ]; then
  warn ".env already exists — skipping. Edit it manually if needed."
else
  log "Creating .env file..."
  cat > .env << 'ENVEOF'
# ============================================================
# LinkedIn Job Bot — Environment Configuration
# ============================================================

# --- LinkedIn Credentials ---
LINKEDIN_EMAIL=paragkarkhanis@gmail.com
LINKEDIN_PASSWORD=Gurudev@123

# --- Anthropic / Claude AI ---
# Get a fresh key at: https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=PASTE_YOUR_API_KEY_HERE
CLAUDE_MODEL=claude-sonnet-4-6

# --- Bot Behaviour ---
MAX_JOBS_PER_SESSION=5
DELAY_BETWEEN_JOBS_MIN=30
DELAY_BETWEEN_JOBS_MAX=90

# Full mode: apply to jobs AND connect with recruiters
AUTO_APPLY=true
AUTO_CONNECT=true
SEND_RECRUITER_MESSAGE=true
FOLLOW_UP_DELAY_DAYS=0

# --- Browser ---
# Set to false to see the browser window (useful for first login / 2FA)
HEADLESS=true
USER_DATA_DIR=./browser-data

# --- Output ---
OUTPUT_DIR=./output

# --- Excel Tracker ---
TRACKER_PATH=/Users/paragkarkhanis/Desktop/Personal/Parag Resume/Job Applications/Job_Applications_Tracker.xlsx
ENVEOF
  ok ".env created"
fi

# ── 6. Check API key ───────────────────────────────────────
if grep -q "PASTE_YOUR_API_KEY_HERE" .env 2>/dev/null; then
  echo ""
  echo -e "${YELLOW}${BOLD}┌─────────────────────────────────────────────────────────┐${RESET}"
  echo -e "${YELLOW}${BOLD}│  ACTION REQUIRED: Add your Anthropic API key to .env     │${RESET}"
  echo -e "${YELLOW}${BOLD}├─────────────────────────────────────────────────────────┤${RESET}"
  echo -e "${YELLOW}│  1. Go to: https://console.anthropic.com/settings/keys   │${RESET}"
  echo -e "${YELLOW}│  2. Create a new key (the old one was shared in chat)     │${RESET}"
  echo -e "${YELLOW}│  3. Add credits at console.anthropic.com/billing          │${RESET}"
  echo -e "${YELLOW}│  4. Open .env and replace PASTE_YOUR_API_KEY_HERE         │${RESET}"
  echo -e "${YELLOW}│  5. Then run:  npm run start:dry-run                      │${RESET}"
  echo -e "${YELLOW}${BOLD}└─────────────────────────────────────────────────────────┘${RESET}"
  echo ""
else
  # API key is set — offer to run
  echo ""
  echo -e "${GREEN}${BOLD}✓ Setup complete!${RESET}"
  echo ""
  echo "  Test run (no applications submitted):"
  echo -e "  ${BOLD}npm run start:dry-run${RESET}"
  echo ""
  echo "  Full run (live applications):"
  echo -e "  ${BOLD}npm start${RESET}"
  echo ""
  echo "  Tip: if LinkedIn asks for 2FA, set HEADLESS=false in .env,"
  echo "  complete the challenge in the browser window, then set it back."
  echo ""
fi
