@echo off
REM Double-click this file on Windows to start Geo-Grid and open it in your browser.
cd /d "%~dp0"
if "%PORT%"=="" set PORT=3000
title Geo-Grid Rank Report

echo ===============================================
echo   Geo-Grid Rank Report
echo ===============================================

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed yet. It is a free, one-click installer.
  echo Opening the download page... Install the LTS version, then double-click this file again.
  start "" "https://nodejs.org/en/download"
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: downloading the app's components ^(takes about a minute^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Install failed. Take a screenshot of this window and send it to whoever set this up.
    pause
    exit /b 1
  )
)

if not exist .env copy .env.example .env >nul

echo.
echo Starting... your browser will open at http://localhost:%PORT%
echo Keep this window open while you use the app. Close it to stop.
echo.
start "" "http://localhost:%PORT%"
call npm start
pause
