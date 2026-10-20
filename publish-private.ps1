param([string]$Name = "facegate-lab")
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if ($Name -notmatch '^[A-Za-z0-9_.-]+$') { throw "Invalid repository name." }
& gh auth status
if ($LASTEXITCODE -ne 0) { throw "First complete gh auth login -h github.com -p https -w . Never share the token." }
$taskLogin = (& gh api user --jq .login).Trim()
if ($LASTEXITCODE -ne 0 -or -not $taskLogin) { throw "Cannot identify authenticated GitHub account." }
& git rev-parse --git-dir | Out-Null
if ($LASTEXITCODE -ne 0) { throw "A local Git repository with a reviewed commit is required." }
$taskDirty = & git status --porcelain
if ($taskDirty) { throw "Working tree is not clean. Review and commit changes before publishing." }
$taskTracked = & git ls-files
if ($taskTracked -match '(^|/)(data|\.venv|models/.*\.onnx)(/|$)|\.key$') { throw "Sensitive or runtime files are tracked. Stop and inspect git ls-files." }
& .\.venv\Scripts\python.exe scripts\check_release.py
if ($LASTEXITCODE -ne 0) { throw "Release privacy check failed. No upload performed." }
$taskRepo = "$taskLogin/$Name"
$taskPrivate = & gh repo view $taskRepo --json isPrivate --jq .isPrivate 2>$null
if ($LASTEXITCODE -eq 0) {
    if ($taskPrivate -ne 'true') { throw "Existing repository is public. No push performed." }
    $taskOrigin = & git remote get-url origin 2>$null
    $taskExpected = "https://github.com/$taskRepo.git"
    if ($taskOrigin -ne $taskExpected) { throw "Existing repository/remote must be reviewed before pushing. No remote was changed." }
    & git push -u origin main
} else {
    $taskRemotes = & git remote
    if ($taskRemotes -contains 'origin') { throw "An origin already exists. Review it before creating another repository." }
    & gh repo create $taskRepo --private --source . --remote origin --push --description "Local facial verification, access policy and security troubleshooting lab"
}
if ($LASTEXITCODE -ne 0) { throw "Publish failed; inspect the output." }
$taskVerified = & gh repo view $taskRepo --json isPrivate,url --jq 'select(.isPrivate == true) | .url'
if ($LASTEXITCODE -ne 0 -or -not $taskVerified) { throw "Private visibility could not be verified." }
Write-Host "Verified private repository: $taskVerified"
