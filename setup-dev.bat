@echo off
title Universal Video Downloader - Development Setup

echo.
echo ========================================
echo Universal Video Downloader Dev Setup
echo ========================================
echo.

echo Checking if Node.js is installed...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo Node.js is not installed.
    echo Please install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js found: 
node --version

echo.
echo Installing development dependencies...
call npm install

if %errorlevel% neq 0 (
    echo.
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo All dependencies installed successfully!
echo.
echo Development environment ready!
echo.
echo Available commands:
echo   npm run dev        - Start development server with auto-reload
echo   npm run dev:server - Start server only (no CSS watching)
echo   npm start          - Start production server
echo   npm run build      - Build executable
echo.
echo To start developing:
echo   npm run dev
echo.
echo Then open http://localhost:3000 in your browser
echo Any changes to CSS, HTML, or JS files will automatically reload!
echo.
pause