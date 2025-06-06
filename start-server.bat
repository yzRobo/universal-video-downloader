@echo off
title Universal Video Downloader Server

echo.
echo ====================================
echo Universal Video Downloader
echo ====================================
echo.
echo Supports: YouTube, Vimeo, Twitter, Instagram, TikTok, Threads, and 1000+ sites
echo.

echo Installing/Verifying dependencies...
call npm install
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo npm install failed. Please check for errors above.
    pause
    exit /b
)

echo.
echo Dependencies installed successfully!
echo.
echo Starting Node.js server...
echo To stop the server, close this window or press CTRL+C.
echo.

node server.js

echo.
echo Server has been stopped.
pause