# ==============================================================================
# NodePilot HSCC — Khởi chạy thử qua Docker Compose (Local Dev)
# ==============================================================================

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " NodePilot HSCC — Khởi chạy thử nghiệm Docker Compose     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Kiểm tra Docker CLI
try {
    $dockerVersion = docker --version
    Write-Host "[OK] $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Không tìm thấy Docker CLI trên máy tính!" -ForegroundColor Red
    Write-Host "Vui lòng cài đặt Docker Desktop và thử lại." -ForegroundColor Yellow
    exit 1
}

# 2. Kiểm tra Docker Daemon đang chạy
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[CẢNH BÁO] Docker Engine chưa được bật!" -ForegroundColor Yellow
    Write-Host "Vui lòng mở ứng dụng Docker Desktop trên máy và thử lại sau ít giây." -ForegroundColor Gray
    exit 1
}

# 3. Tạo thư mục dữ liệu nếu chưa có
if (-not (Test-Path "$RootDir\data")) {
    New-Item -ItemType Directory -Path "$RootDir\data" | Out-Null
}

# 4. Khởi chạy Docker Compose (Build cục bộ)
Write-Host "[...] Đang khởi chạy các container (hscc-api + watchtower)..." -ForegroundColor Yellow
docker compose up --build -d

# 5. Bootstrap admin
Write-Host "[...] Đang kiểm tra tài khoản quản trị trong container..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
docker compose exec hscc-api hscc-cli bootstrap --username admin --password adminpassword123 2>&1 | Out-Null

$targetURL = "http://127.0.0.1:17880"
Write-Host ""
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " DOCKER STACK ĐÃ SẴN SÀNG" -ForegroundColor Green
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " • Truy cập giao diện : " -NoNewline; Write-Host $targetURL -ForegroundColor Yellow
Write-Host " • Tài khoản mặc định : " -NoNewline; Write-Host "admin" -ForegroundColor White
Write-Host " • Mật khẩu mặc định  : " -NoNewline; Write-Host "adminpassword123" -ForegroundColor White
Write-Host " • Container API      : nodepilot-hscc-api (RAM <= 120M)" -ForegroundColor Gray
Write-Host " • Container Update   : nodepilot-watchtower (Auto-cleanup ON)" -ForegroundColor Gray
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host ""

Start-Process $targetURL
