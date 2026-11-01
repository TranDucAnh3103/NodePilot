# ==============================================================================
# NodePilot HSCC — Khởi chạy Single Binary Thử nghiệm Cục bộ (Windows Dev)
# ==============================================================================

param(
    [switch]$Rebuild = $false,
    [switch]$RebuildFrontend = $false,
    [int]$Port = 17880
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " NodePilot Home Server Control Center (HSCC) — Dev Runner " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Đảm bảo thư mục lưu trữ dữ liệu
if (-not (Test-Path "$RootDir\data")) {
    New-Item -ItemType Directory -Path "$RootDir\data" | Out-Null
    Write-Host "[OK] Đã tạo thư mục dữ liệu cục bộ: .\data" -ForegroundColor Green
}

# 2. Kiểm tra và biên dịch Frontend nếu cần
$distIndex = "$RootDir\web\dist\index.html"
if ($RebuildFrontend -or (-not (Test-Path $distIndex))) {
    Write-Host "[...] Đang đóng gói giao diện Web SPA (React 19 + Vite)..." -ForegroundColor Yellow
    Push-Location "$RootDir\web"
    try {
        if (-not (Test-Path "node_modules")) {
            npm install
        }
        npm run build
        Write-Host "[OK] Giao diện Web SPA đã biên dịch xong." -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

# 3. Biên dịch CLI và API Binary nếu cần
$apiBin = "$RootDir\bin\hscc-api.exe"
$cliBin = "$RootDir\bin\hscc-cli.exe"

if ($Rebuild -or (-not (Test-Path $apiBin)) -or (-not (Test-Path $cliBin))) {
    Write-Host "[...] Đang biên dịch file nhị phân Go (Single Binary)..." -ForegroundColor Yellow
    if (-not (Test-Path "$RootDir\bin")) {
        New-Item -ItemType Directory -Path "$RootDir\bin" | Out-Null
    }
    go build -o "$RootDir\bin\hscc-cli.exe" ./cmd/hscc-cli
    go build -o "$RootDir\bin\hscc-api.exe" ./cmd/hscc-api
    Write-Host "[OK] Đã biên dịch xong: bin/hscc-cli.exe và bin/hscc-api.exe" -ForegroundColor Green
}

# 4. Tự động kiểm tra và khởi tạo tài khoản Admin mặc định cho Dev
Write-Host "[...] Kiểm tra tài khoản Quản trị viên khởi tạo..." -ForegroundColor Yellow
$bootstrapOutput = & "$RootDir\bin\hscc-cli.exe" bootstrap --username admin --password adminpassword123 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Đã tạo tài khoản quản trị viên thử nghiệm thành công!" -ForegroundColor Green
} else {
    Write-Host "[INFO] Tài khoản Quản trị viên đã sẵn sàng trong cơ sở dữ liệu." -ForegroundColor Gray
}

# 5. Cấu hình biến môi trường cục bộ
$env:HSCC_HOST = "127.0.0.1"
$env:HSCC_PORT = "$Port"
$env:HSCC_DB_PATH = "$RootDir\data\hscc.db"
$env:HSCC_LOG_LEVEL = "INFO"

# 6. Hiển thị thông tin đăng nhập và mở trình duyệt
$targetURL = "http://127.0.0.1:$Port"

Write-Host ""
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " TRẠNG THÁI MÁY CHỦ THỬ NGHIỆM ĐÃ SẴN SÀNG" -ForegroundColor Green
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " • Địa chỉ truy cập : " -NoNewline; Write-Host $targetURL -ForegroundColor Yellow
Write-Host " • Tài khoản mặc định: " -NoNewline; Write-Host "admin" -ForegroundColor White
Write-Host " • Mật khẩu mặc định : " -NoNewline; Write-Host "adminpassword123" -ForegroundColor White
Write-Host " • Dữ liệu SQLite    : .\data\hscc.db (Chế độ WAL)" -ForegroundColor Gray
Write-Host "----------------------------------------------------------" -ForegroundColor DarkCyan
Write-Host " Đang tự động mở trình duyệt web... Nhấn Ctrl+C để dừng." -ForegroundColor DarkYellow
Write-Host ""

Start-Process $targetURL

# 7. Khởi chạy máy chủ API
& "$RootDir\bin\hscc-api.exe"
