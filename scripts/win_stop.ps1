# win_stop.ps1 - Daydream Engine Service Shutdown & Port Cleanup (PowerShell)
$ErrorActionPreference = "Continue"

Write-Host "========================================================================================" -ForegroundColor Yellow
Write-Host "  Daydream Engine - Service Shutdown & Port Cleanup" -ForegroundColor Yellow
Write-Host "========================================================================================" -ForegroundColor Yellow
Write-Host ""

$PortsToClean = @(3000, 5173, 6333, 8000)

foreach ($port in $PortsToClean) {
    Write-Host "Checking port $port for active processes..." -ForegroundColor Cyan
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $pidToKill = $conn.OwningProcess
            if ($pidToKill -and $pidToKill -ne 0 -and $pidToKill -ne 4) {
                Write-Host "  [...] Terminating PID $pidToKill on port $port..." -ForegroundColor Red
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            }
        }
    } else {
        Write-Host "  [+] Port $port is clean" -ForegroundColor Green
    }
}

# Stop SearXNG Docker container if running
Try {
    $dockerCheck = docker ps --filter "name=searxng" --format "{{.ID}}" 2>$null
    if ($dockerCheck) {
        Write-Host "Stopping SearXNG Docker container..." -ForegroundColor Cyan
        docker stop searxng | Out-Null
        Write-Host "  [+] SearXNG container stopped" -ForegroundColor Green
    }
} Catch {}

Write-Host ""
Write-Host "[+] All Daydream Engine background services cleaned up successfully!" -ForegroundColor Green
Write-Host "========================================================================================" -ForegroundColor Yellow
