@echo off
title Vimeo Downloader Server

echo Checking for dependencies...

REM Check if node_modules directory exists. If not, run npm install.
IF NOT EXIST "node_modules" (
    echo Dependencies not found. Running npm install...
    call npm install
    IF %ERRORLEVEL% NEQ 0 (
        echo.
        echo npm install failed. Please check for errors above.
        pause
        exit /b
    )
)

echo.
echo Starting Node.js server...
echo To stop the server, close this window or press CTRL+C.

node server.js

echo.
echo Server has been stopped.
pause