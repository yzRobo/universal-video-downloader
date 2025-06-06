#!/bin/bash
# A script to install dependencies and start the Vimeo Downloader server.

echo "Checking for dependencies..."

# Check if node_modules directory exists. If not, run npm install.
if [ ! -d "node_modules" ]; then
  echo "Dependencies not found. Running npm install..."
  npm install
  if [ $? -ne 0 ]; then
    echo "npm install failed. Please check for errors."
    exit 1
  fi
fi

echo ""
echo "Starting Node.js server..."
echo "To stop the server, press CTRL+C in this terminal."

node server.js