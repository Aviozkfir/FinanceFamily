@echo off
cd /d "%~dp0.."
if not exist deploy\.toolchain\jdk call npm run apk:setup
call npm run apk
pause
