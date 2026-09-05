@echo off
chcp 65001 >nul
cd /d "%~dp0"
title WorkBuddy 每日自动签到 - 一键开启

echo.
echo ============================================
echo   WorkBuddy 每日自动签到  一键开启
echo ============================================
echo.
echo 正在检查运行环境...

set "NODE_BIN="
set "SCRIPT=%~dp0scripts\checkin.js"

if not exist "%SCRIPT%" (
  echo [出错] 没找到 scripts\checkin.js
  echo        请确认这个文件是从完整的 skill 文件夹里打开的。
  echo.
  pause
  exit /b 1
)

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
  echo [缺少运行环境] 这台电脑上没找到 Node.js。
  echo.
  echo 签到脚本需要它才能运行。现在帮你打开下载页面，
  echo 装好后重新双击本文件就可以了（安装全程点"下一步"即可）。
  echo.
  start "" https://nodejs.org/zh-cn/download
  pause
  exit /b 1
)

echo 运行环境正常。
echo.
echo 正在设置每天 5 个时间点的自动签到...
echo （电脑在任一时间点开着就会签到，领过会自动跳过）
echo.

schtasks /Create /TN "WorkBuddyCheckin_0900" /TR "\"%NODE_BIN%\" \"%SCRIPT%\"" /SC DAILY /ST 09:00 /F >nul 2>&1
schtasks /Create /TN "WorkBuddyCheckin_1200" /TR "\"%NODE_BIN%\" \"%SCRIPT%\"" /SC DAILY /ST 12:00 /F >nul 2>&1
schtasks /Create /TN "WorkBuddyCheckin_1500" /TR "\"%NODE_BIN%\" \"%SCRIPT%\"" /SC DAILY /ST 15:00 /F >nul 2>&1
schtasks /Create /TN "WorkBuddyCheckin_1800" /TR "\"%NODE_BIN%\" \"%SCRIPT%\"" /SC DAILY /ST 18:00 /F >nul 2>&1
schtasks /Create /TN "WorkBuddyCheckin_2100" /TR "\"%NODE_BIN%\" \"%SCRIPT%\"" /SC DAILY /ST 21:00 /F >nul 2>&1

echo 设置完成。现在立刻试运行一次，看看能不能正常领到：
echo.
"%NODE_BIN%" "%SCRIPT%"
echo.
echo ============================================
echo   从明天起就全自动了，不用再管。
echo   想关掉的话，双击"一键关闭自动签到.bat"。
echo ============================================
echo.
pause
