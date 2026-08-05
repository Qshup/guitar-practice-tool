#!/bin/bash
# Double-click this file in Finder to start the practice tool properly.
#
# Why this exists: opening index.html directly gives a file:// page, where the
# browser blocks the module and asset loading the camera needs. Serving over
# http://localhost makes it a real origin and everything works.
#
# macOS may refuse to run this the first time ("cannot be opened because it is
# from an unidentified developer"). If so: right-click it -> Open -> Open.

cd "$(dirname "$0")" || exit 1

echo "Guitar Practice Tool"
echo "===================="
echo

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed, so the local server can't start."
  echo "Install Node.js from https://nodejs.org and then run this again."
  echo
  read -r -p "Press Return to close..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run — installing dependencies (this happens once)..."
  npm install || { echo "Install failed."; read -r -p "Press Return to close..."; exit 1; }
  echo
fi

# If something is already serving on 8080, just open it rather than failing.
if lsof -ti:8080 >/dev/null 2>&1; then
  echo "Already running on port 8080 — opening it."
  open "http://localhost:8080/index.html"
  echo
  echo "Leave the window that is already running open."
  read -r -p "Press Return to close this one..."
  exit 0
fi

echo "Starting the server and opening your browser..."
echo
echo "  KEEP THIS WINDOW OPEN while you practise."
echo "  Closing it stops the server."
echo
echo "  Allow the microphone and camera when the browser asks."
echo

npm start
