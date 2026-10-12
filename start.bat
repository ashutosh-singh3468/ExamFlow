@echo off
title ExamFlow - Exam ^& Class Slot Management
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Please install the LTS version from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing ExamFlow for the first time. This takes a minute...
  call npm install
  if errorlevel 1 (
    echo Installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

if not exist client\dist\index.html (
  echo Building the web app...
  call npm run build
  if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
  )
)

if "%PORT%"=="" set PORT=4000
start "" cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%"
node server\index.js
pause
