@echo off
chcp 65001 >nul
cd /d "%~dp0"
title WorkBuddy 签到

set "NODE_BIN="
set "SCRIPT=%~dp0scripts\checkin.js"

for /f "delims=" %%i in ('where node 2^>nul') do (
  if not defined NODE_BIN set "NODE_BIN=%%i"
)
if not defined NODE_BIN (
  for /d %%d in ("%USERPROFILE%\.workbuddy\binaries\node\versions\*") do (
    if exist "%%d\node.exe" set "NODE_BIN=%%d\node.exe"
  )
)

if not defined NODE_BIN (
  echo.
  echo 没找到 Node.js，签到需要它才能运行。
  echo 正在打开下载页面，装好后重新双击本文件即可。
  echo.
  start "" https://nodejs.org/zh-cn/download
  pause
  exit /b 1
)

echo.
"%NODE_BIN%" "%SCRIPT%"
echo.

if exist "logs\checkin.log" (
  echo --- 最近 10 次记录 ---
  powershell -NoProfile -Command "Get-Content 'logs\checkin.log' -Tail 10"
)

echo.
pause
