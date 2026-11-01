# ==============================================================================
# NodePilot HSCC - Stop & Clean Lingering Processes
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " NodePilot HSCC - Clean Shutdown & Process Terminator     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Kill all HSCC binaries
$hsccProcs = Get-Process -Name "hscc-api", "hscc-helper", "hscc-cli" -ErrorAction SilentlyContinue
if ($hsccProcs) {
    foreach ($p in $hsccProcs) {
        Write-Host "[*] Terminating $($p.ProcessName) (PID: $($p.Id))..." -ForegroundColor Yellow
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "[OK] No hscc-api or helper processes running." -ForegroundColor Green
}

# 2. Free Port 17880 if held by any process
$port17880 = Get-NetTCPConnection -LocalPort 17880 -ErrorAction SilentlyContinue
if ($port17880) {
    foreach ($conn in $port17880) {
        if ($conn.OwningProcess -gt 0) {
            Write-Host "[*] Freeing Port 17880 (PID: $($conn.OwningProcess))..." -ForegroundColor Yellow
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}

# 3. Free Port 5173 (Vite dev server) if held by any process
$port5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($port5173) {
    foreach ($conn in $port5173) {
        if ($conn.OwningProcess -gt 0) {
            Write-Host "[*] Freeing Port 5173 (PID: $($conn.OwningProcess))..." -ForegroundColor Yellow
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host ""
Write-Host "[OK] All NodePilot HSCC processes and ports cleanly released." -ForegroundColor Green
Write-Host ""
