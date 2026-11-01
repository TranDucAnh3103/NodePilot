# ==============================================================================
# NodePilot HSCC - Docker Compose Runner (Local Dev)
# ==============================================================================

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " NodePilot HSCC - Local Docker Compose Stack              " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check Docker CLI
try {
    $dockerVersion = docker --version
    Write-Host "[OK] $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Docker CLI not found. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

# 2. Check Docker daemon running
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARNING] Docker Engine is not running!" -ForegroundColor Yellow
    Write-Host "Please start Docker Desktop and run this script again." -ForegroundColor Gray
    exit 1
}

# 3. Ensure local data folder
if (-not (Test-Path "$RootDir\data")) {
    New-Item -ItemType Directory -Path "$RootDir\data" | Out-Null
}

# 4. Stop any local native hscc-api instance
Get-Process -Name "hscc-api" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 5. Start Docker Compose
Write-Host "[...] Building and starting containers (hscc-api + watchtower)..." -ForegroundColor Yellow
docker compose up --build -d

# 6. Bootstrap admin user
Write-Host "[...] Checking admin account inside container..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
docker compose exec hscc-api hscc-cli bootstrap --username admin --password adminpassword123 2>&1 | Out-Null

$targetURL = "http://127.0.0.1:17880"
Write-Host ""
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " DOCKER COMPOSE STACK READY" -ForegroundColor Green
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " * Web Dashboard : " -NoNewline; Write-Host $targetURL -ForegroundColor Yellow
Write-Host " * Credentials   : " -NoNewline; Write-Host "admin / adminpassword123" -ForegroundColor White
Write-Host " * Container API : nodepilot-hscc-api (RAM limit 120M)" -ForegroundColor Gray
Write-Host " * Update Engine : nodepilot-watchtower (Auto-cleanup ON)" -ForegroundColor Gray
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host ""

Start-Process $targetURL
