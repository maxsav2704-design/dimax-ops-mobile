@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-expo-e2e.ps1"
exit /b %ERRORLEVEL%
