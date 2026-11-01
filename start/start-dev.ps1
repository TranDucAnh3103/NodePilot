# ==============================================================================
# NodePilot HSCC - Live Dev Mode (Hot-Reload)
# ==============================================================================

param(
    [int]$BackendPort = 17880
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " NodePilot HSCC - Live Development Mode (Hot Reload)      " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Ensure local data directory
if (-not (Test-Path "$RootDir\data")) {
    New-Item -ItemType Directory -Path "$RootDir\data" | Out-Null
}

if (-not (Test-Path "$RootDir\bin")) {
    New-Item -ItemType Directory -Path "$RootDir\bin" | Out-Null
}

# 2. Compile binaries if needed
if ((-not (Test-Path "$RootDir\bin\hscc-cli.exe")) -or (-not (Test-Path "$RootDir\bin\hscc-api.exe"))) {
    Write-Host "[...] Compiling Go backend binaries..." -ForegroundColor Yellow
    go build -o "$RootDir\bin\hscc-cli.exe" ./cmd/hscc-cli
    go build -o "$RootDir\bin\hscc-api.exe" ./cmd/hscc-api
    Write-Host "[OK] Backend binaries compiled." -ForegroundColor Green
}

# 3. Bootstrap default admin user
Write-Host "[...] Verifying admin account..." -ForegroundColor Yellow
$null = & "$RootDir\bin\hscc-cli.exe" bootstrap --username admin --password adminpassword123 2>&1
Write-Host "[OK] Admin account verified (admin / adminpassword123)" -ForegroundColor Green

# 4. Check web dependencies
if (-not (Test-Path "$RootDir\web\node_modules")) {
    Write-Host "[...] Installing frontend dependencies (npm install)..." -ForegroundColor Yellow
    Push-Location "$RootDir\web"
    npm install
    Pop-Location
    Write-Host "[OK] Frontend dependencies installed." -ForegroundColor Green
}

# 5. Stop any existing backend process
Get-Process -Name "hscc-api" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 6. Start Backend API in background
$env:HSCC_HOST = "127.0.0.1"
$env:HSCC_PORT = "$BackendPort"
$env:HSCC_DB_PATH = "$RootDir\data\hscc.db"
$env:HSCC_LOG_LEVEL = "DEBUG"

Write-Host "[...] Starting Backend API on http://127.0.0.1:$BackendPort ..." -ForegroundColor Yellow
$backendProcess = Start-Process -FilePath "$RootDir\bin\hscc-api.exe" -PassThru

Start-Sleep -Seconds 2

# 7. Open Vite Dev Server
$frontendURL = "http://localhost:5173"
Write-Host ""
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " DEV ENVIRONMENT READY (HOT-RELOAD)" -ForegroundColor Green
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " * Frontend UI (Vite) : " -NoNewline; Write-Host $frontendURL -ForegroundColor Yellow
Write-Host " * Backend REST/WS   : http://127.0.0.1:$BackendPort" -ForegroundColor Gray
Write-Host " * Login Credentials : admin / adminpassword123" -ForegroundColor White
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " Opening browser... Press Ctrl+C in this console to stop." -ForegroundColor DarkYellow
Write-Host ""

Start-Process $frontendURL

try {
    Push-Location "$RootDir\web"
    npm run dev
} finally {
    Pop-Location
    if ($backendProcess -and (-not $backendProcess.HasExited)) {
        Write-Host "Stopping backend process..." -ForegroundColor Yellow
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
