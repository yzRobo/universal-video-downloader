@echo off
title Universal Downloader Server

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
echo Starting Node.js server...
echo To stop the server, close this window or press CTRL+C.

node server.js

echo.
echo Server has been stopped.
pause