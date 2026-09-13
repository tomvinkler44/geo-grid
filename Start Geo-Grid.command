#!/bin/bash
# Double-click this file on a Mac to start Geo-Grid and open it in your browser.
cd "$(dirname "$0")"
PORT="${PORT:-3000}"

echo "==============================================="
echo "  Geo-Grid Rank Report"
echo "==============================================="

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "Node.js is not installed yet. It is a free, one-click installer."
  echo "Opening the download page... Install the LTS version, then double-click this file again."
  open "https://nodejs.org/en/download"
  echo ""
  read -n 1 -s -r -p "Press any key to close this window."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run: downloading the app's components (takes about a minute)..."
  npm install --no-audit --no-fund || { echo "Install failed. Take a screenshot of this window and send it to whoever set this up."; read -n 1 -s -r; exit 1; }
fi

[ -f .env ] || cp .env.example .env

echo ""
echo "Starting... your browser will open at http://localhost:$PORT"
echo "Keep this window open while you use the app. Close it to stop."
echo ""
( sleep 2 && open "http://localhost:$PORT" ) &
PORT="$PORT" npm start
