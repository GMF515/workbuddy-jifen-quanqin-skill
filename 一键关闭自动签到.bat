@echo off
chcp 65001 >nul
cd /d "%~dp0"
title WorkBuddy 每日自动签到 - 一键关闭

echo.
echo ============================================
echo   WorkBuddy 每日自动签到  一键关闭
echo ============================================
echo.
echo 正在取消所有自动签到任务...

schtasks /Delete /TN "WorkBuddyCheckin_0900" /F >nul 2>&1
schtasks /Delete /TN "WorkBuddyCheckin_1200" /F >nul 2>&1
schtasks /Delete /TN "WorkBuddyCheckin_1500" /F >nul 2>&1
schtasks /Delete /TN "WorkBuddyCheckin_1800" /F >nul 2>&1
schtasks /Delete /TN "WorkBuddyCheckin_2100" /F >nul 2>&1

echo 已关闭，以后不会再自动签到了。
echo.
echo 说明：只是取消自动执行，skill 本身没有删除，
echo       随时可以双击"一键开启自动签到.bat"重新打开，
echo       或者手动双击"立刻签到一次.bat"临时领一次。
echo.
pause
