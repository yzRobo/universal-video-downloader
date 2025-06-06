#!/bin/bash
# A script to install dependencies and start the Universal Video Downloader server.

echo ""
echo "===================================="
echo "Universal Video Downloader"
echo "===================================="
echo ""
echo "Supports: YouTube, Vimeo, Twitter, Instagram, TikTok, Threads, and 1000+ sites"
echo ""

echo "Installing/Verifying dependencies..."
npm install
if [ $? -ne 0 ]; then
  echo "npm install failed. Please check for errors."
  exit 1
fi

echo ""
echo "Dependencies installed successfully!"
echo ""
echo "Starting Node.js server..."
echo "To stop the server, press CTRL+C in this terminal."
echo ""

node server.js