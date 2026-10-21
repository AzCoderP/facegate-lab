param([string]$Python = "py")
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path .venv\Scripts\python.exe)) {
    & $Python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw "Python 3.12/3.13 ve venv lazimdir. python.org saytindan qurasdir." }
}
& .\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
if ($LASTEXITCODE -ne 0) { throw "Kitabxanalar qurasdirilmadi." }
& .\.venv\Scripts\python.exe scripts\download_models.py
if ($LASTEXITCODE -ne 0) { throw "Modeller yuklenmedi. Internet ve proxy sazlamalarini yoxla." }
Write-Host "Hazirdir. Baslatmaq ucun: .\start.ps1"
