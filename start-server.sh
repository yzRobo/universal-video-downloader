#!/bin/bash
# A script to install dependencies and start the Vimeo Downloader server.

echo "Installing/Verifying dependencies..."
npm install
if [ $? -ne 0 ]; then
  echo "npm install failed. Please check for errors."
  exit 1
fi

echo ""
echo "Starting Node.js server..."
echo "To stop the server, press CTRL+C in this terminal."

node server.js