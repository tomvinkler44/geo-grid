@echo off
REM =====================================================================
REM   Double-click this file to start Geo-Grid.
REM   A window like this one opens, the app starts, and your web browser
REM   opens automatically. Keep this window open while you use the app.
REM =====================================================================
cd /d "%~dp0"
if "%PORT%"=="" set PORT=3000
title Geo-Grid Rank Report

echo.
echo   ===============================================
echo      GEO-GRID RANK REPORT
echo   ===============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed on this PC yet.
  echo.
  echo   Node.js is free and safe. It is the engine this app runs on.
  echo   I am opening the download page in your browser now.
  echo.
  echo   1. Click the big green button that says "LTS".
  echo   2. Open the file that downloads and click Next until it finishes.
  echo   3. Come back here and double-click "Start Geo-Grid" again.
  start "" "https://nodejs.org/en/download"
  echo.
  echo   -----------------------------------------------
  echo   Install Node.js first, then try again.
  echo   -----------------------------------------------
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo   First time setup. Downloading the app's components.
  echo   This takes about a minute. Please wait...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   -----------------------------------------------
    echo   Setup failed. Take a photo of this window and send it over.
    echo   -----------------------------------------------
    echo.
    pause
    exit /b 1
  )
  echo.
  echo   Setup finished.
)

if not exist .env copy .env.example .env >nul 2>nul

echo.
echo   Starting the app...
echo   Your browser will open at:  http://localhost:%PORT%
echo.
echo   KEEP THIS WINDOW OPEN while you use the app.
echo   To stop the app, just close this window.
echo.

start "" "http://localhost:%PORT%"
call npm start

echo.
echo   The app has stopped.
pause
