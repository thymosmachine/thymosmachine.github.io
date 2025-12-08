@echo off
cd /d "%~dp0"
start "Server" cmd /c "npx serve -l 8080"
timeout /t 2 >nul
start "Ngrok" cmd /c "ngrok http 8080"