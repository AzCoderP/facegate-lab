@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo First run setup.ps1. See README.md.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:8000 - Stop with Ctrl+C
".venv\Scripts\python.exe" scripts\admin_key.py
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-proxy-headers
pause
