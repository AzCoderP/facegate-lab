@echo off
cd /d "%~dp0"
.venv\Scripts\python.exe scripts\secure_control.py %*
pause
