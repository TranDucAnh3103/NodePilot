# ==============================================================================
# NodePilot HSCC - Single Binary Runner (Windows Dev)
# ==============================================================================

param(
    [switch]$Rebuild = $false,
    [switch]$RebuildFrontend = $false,
    [int]$Port = 17880
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " NodePilot Home Server Control Center (HSCC) - Dev Runner " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Ensure data directory
if (-not (Test-Path "$RootDir\data")) {
    New-Item -ItemType Directory -Path "$RootDir\data" | Out-Null
    Write-Host "[OK] Created local data directory: .\data" -ForegroundColor Green
}

# 2. Build Frontend if needed
$distIndex = "$RootDir\web\dist\index.html"
if ($RebuildFrontend -or (-not (Test-Path $distIndex))) {
    Write-Host "[...] Building Web SPA (React 19 + Vite)..." -ForegroundColor Yellow
    Push-Location "$RootDir\web"
    if (-not (Test-Path "node_modules")) {
        npm install
    }
    npm run build
    Pop-Location
    Write-Host "[OK] Web SPA built successfully." -ForegroundColor Green
}

# 3. Build Go Binaries if needed
$apiBin = "$RootDir\bin\hscc-api.exe"
$cliBin = "$RootDir\bin\hscc-cli.exe"

if (-not (Test-Path "$RootDir\bin")) {
    New-Item -ItemType Directory -Path "$RootDir\bin" | Out-Null
}

if ($Rebuild -or (-not (Test-Path $apiBin)) -or (-not (Test-Path $cliBin))) {
    Write-Host "[...] Compiling Go binaries (Single Binary mode)..." -ForegroundColor Yellow
    go build -o "$RootDir\bin\hscc-cli.exe" ./cmd/hscc-cli
    go build -o "$RootDir\bin\hscc-api.exe" ./cmd/hscc-api
    Write-Host "[OK] Compiled: bin\hscc-cli.exe and bin\hscc-api.exe" -ForegroundColor Green
}

# 4. Bootstrap or verify default admin user
Write-Host "[...] Verifying admin account..." -ForegroundColor Yellow
$null = & "$RootDir\bin\hscc-cli.exe" reset-password --username admin --password adminpassword123 2>&1
if ($LASTEXITCODE -ne 0) {
    $null = & "$RootDir\bin\hscc-cli.exe" bootstrap --username admin --password adminpassword123 2>&1
}
Write-Host "[OK] Admin account verified (admin / adminpassword123)" -ForegroundColor Green

# 5. Stop any existing hscc-api instance
Get-Process -Name "hscc-api" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 6. Configure environment
$env:HSCC_HOST = "127.0.0.1"
$env:HSCC_PORT = "$Port"
$env:HSCC_DB_PATH = "$RootDir\data\hscc.db"
$env:HSCC_LOG_LEVEL = "INFO"

# 7. Launch browser & API server
$targetURL = "http://127.0.0.1:$Port"

Write-Host ""
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " SERVER IS READY (DEV STANDALONE)" -ForegroundColor Green
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " * URL      : " -NoNewline; Write-Host $targetURL -ForegroundColor Yellow
Write-Host " * Username : " -NoNewline; Write-Host "admin" -ForegroundColor White
Write-Host " * Password : " -NoNewline; Write-Host "adminpassword123" -ForegroundColor White
Write-Host " * Database : .\data\hscc.db (SQLite WAL mode)" -ForegroundColor Gray
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " Opening browser... Press Ctrl+C to terminate." -ForegroundColor DarkYellow
Write-Host ""

Start-Process $targetURL

& "$RootDir\bin\hscc-api.exe"
