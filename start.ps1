$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path .venv\Scripts\python.exe)) { throw "Evvel .\setup.ps1 islet." }
Write-Host "FaceGate Lab: http://127.0.0.1:8000 | Dayandirmaq: Ctrl+C"
& .\.venv\Scripts\python.exe scripts\admin_key.py
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-proxy-headers
