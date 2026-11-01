# ==============================================================================
# NodePilot HSCC — Khởi chạy Chế độ Lập trình Dev (Hot-Reload)
# ==============================================================================

param(
    [int]$BackendPort = 17880
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " NodePilot HSCC — Chế độ Lập trình Live (Hot Reload)      " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Đảm bảo dữ liệu và tài khoản
if (-not (Test-Path "$RootDir\data")) {
    New-Item -ItemType Directory -Path "$RootDir\data" | Out-Null
}

if (-not (Test-Path "$RootDir\bin\hscc-cli.exe")) {
    Write-Host "[...] Đang biên dịch hscc-cli..." -ForegroundColor Yellow
    go build -o "$RootDir\bin\hscc-cli.exe" ./cmd/hscc-cli
}

& "$RootDir\bin\hscc-cli.exe" bootstrap --username admin --password adminpassword123 2>&1 | Out-Null

# 2. Cài đặt dependencies cho web nếu chưa có
if (-not (Test-Path "$RootDir\web\node_modules")) {
    Write-Host "[...] Đang cài đặt thư viện frontend (npm install)..." -ForegroundColor Yellow
    Push-Location "$RootDir\web"
    npm install
    Pop-Location
}

# 3. Khởi động Backend API ở Background
$env:HSCC_HOST = "127.0.0.1"
$env:HSCC_PORT = "$BackendPort"
$env:HSCC_DB_PATH = "$RootDir\data\hscc.db"
$env:HSCC_LOG_LEVEL = "DEBUG"

Write-Host "[...] Khởi động Backend API tại http://127.0.0.1:$BackendPort ..." -ForegroundColor Yellow
$backendProcess = Start-Process -FilePath "go" -ArgumentList "run", "./cmd/hscc-api" -PassThru -NoNewWindow

Start-Sleep -Seconds 2

# 4. Mở Frontend Vite Dev Server
$frontendURL = "http://localhost:5173"
Write-Host ""
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " DEV ENVIRONMENT SẴN SÀNG" -ForegroundColor Green
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " • Frontend UI (Vite) : " -NoNewline; Write-Host $frontendURL -ForegroundColor Yellow
Write-Host " • Backend REST/WS   : http://127.0.0.1:$BackendPort" -ForegroundColor Gray
Write-Host " • Đăng nhập với     : admin / adminpassword123" -ForegroundColor White
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " Đang tự động mở trình duyệt web... Nhấn Ctrl+C để dừng." -ForegroundColor DarkYellow
Write-Host ""

Start-Process $frontendURL

try {
    Push-Location "$RootDir\web"
    npm run dev
} finally {
    Pop-Location
    if ($backendProcess -and (-not $backendProcess.HasExited)) {
        Write-Host "Đang dừng tiến trình backend..." -ForegroundColor Yellow
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
