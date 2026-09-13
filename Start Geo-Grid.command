#!/bin/bash
# =====================================================================
#  Double-click this file to start Geo-Grid.
#  A window like this one opens, the app starts, and your web browser
#  opens automatically. Keep this window open while you use the app.
# =====================================================================
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-3000}"

banner() {
  echo ""
  echo "  ==============================================="
  echo "     GEO-GRID RANK REPORT"
  echo "  ==============================================="
  echo ""
}

stop_here() {
  echo ""
  echo "  -----------------------------------------------"
  echo "  $1"
  echo "  -----------------------------------------------"
  echo ""
  echo "  Press any key to close this window."
  read -n 1 -s -r
  exit 1
}

banner

# --- Find Node.js, even if it isn't on the default PATH ---------------
if ! command -v node >/dev/null 2>&1; then
  for candidate in /usr/local/bin /opt/homebrew/bin /usr/bin; do
    [ -x "$candidate/node" ] && PATH="$candidate:$PATH" && break
  done
fi
# nvm installs live in a versioned folder; pick the newest one
if ! command -v node >/dev/null 2>&1 && [ -d "$HOME/.nvm/versions/node" ]; then
  newest=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)
  [ -n "$newest" ] && PATH="$HOME/.nvm/versions/node/$newest/bin:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js is not installed on this Mac yet."
  echo ""
  echo "  Node.js is free and safe. It is the engine this app runs on."
  echo "  I am opening the download page in your browser now."
  echo ""
  echo "  1. Click the big green button that says 'LTS'."
  echo "  2. Open the file that downloads and click Continue / Install."
  echo "  3. Come back here and double-click 'Start Geo-Grid' again."
  open "https://nodejs.org/en/download" 2>/dev/null
  stop_here "Install Node.js first, then try again."
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null)
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 18 ]; then
  echo "  Your Node.js is version $(node -v 2>/dev/null), which is too old."
  echo "  Please install the current 'LTS' version from nodejs.org."
  open "https://nodejs.org/en/download" 2>/dev/null
  stop_here "Update Node.js, then try again."
fi

# --- First run: download the app's components ------------------------
if [ ! -d node_modules ]; then
  echo "  First time setup. Downloading the app's components."
  echo "  This takes about a minute. Please wait..."
  echo ""
  if ! npm install --no-audit --no-fund; then
    stop_here "Setup failed. Take a photo of this window and send it over."
  fi
  echo ""
  echo "  Setup finished."
fi

[ -f .env ] || cp .env.example .env 2>/dev/null

echo ""
echo "  Starting the app..."
echo "  Your browser will open at:  http://localhost:$PORT"
echo ""
echo "  KEEP THIS WINDOW OPEN while you use the app."
echo "  To stop the app, just close this window."
echo ""

( sleep 3 && open "http://localhost:$PORT" >/dev/null 2>&1 ) &
PORT="$PORT" npm start

stop_here "The app has stopped."
