@echo off
title THE EPOCH - SWExPRESIDENCY UNIVERSITY EVENT
color 0b
echo ================================================================
echo   THE EPOCH -- SWExPRESIDENCY UNIVERSITY EVENT
echo   EVENT USE ONLY
echo   Starting local station server...
echo ================================================================
cd /d "%~dp0"

if not defined GM_PASSWORD (
  echo ERROR: Set the GM_PASSWORD environment variable before launching.
  pause
  exit /b 1
)

echo Starting Node.js server...
start "THE EPOCH Server" /min cmd /c "node server.js"

echo Opening browser at http://localhost:3000 ...
timeout /t 2 /nobreak >nul
start "" http://localhost:3000

echo Game server started in a separate window.
echo Other team stations on this network can connect using this
echo machine's LAN IP instead of localhost, e.g. http://192.168.x.x:3000/?team=TEAM01
echo Close that window to stop the server.
pause
