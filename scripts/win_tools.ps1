# win_tools.ps1 - Daydream Engine Maintenance & Diagnostics (PowerShell)
param (
    [string]$Action = "diagnose"
)

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
Set-Location $RootDir

Write-Host "========================================================================================" -ForegroundColor Cyan
Write-Host "  Daydream Engine - Tool Center & Snapshot Diagnostics" -ForegroundColor Cyan
Write-Host "========================================================================================" -ForegroundColor Cyan
Write-Host ""

if ($Action -eq "diagnose") {
    Write-Host "[1/3] Running Smart Environment Setup & Adaptation..." -ForegroundColor Yellow
    node "$ScriptDir\smart-environment-setup.cjs"
}
elseif ($Action -eq "clean") {
    Write-Host "[1/2] Executing Full Workspace Clean & Reset from Scratch..." -ForegroundColor Yellow
    node "$ScriptDir\clean-workspace.cjs"
}
elseif ($Action -eq "backup") {
    Write-Host "[1/2] Creating full project backup (database & config)..." -ForegroundColor Yellow
    $backupsDir = Join-Path $RootDir "backups"
    if (-not (Test-Path $backupsDir)) { New-Item -ItemType Directory -Path $backupsDir | Out-Null }
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $targetDb = Join-Path $RootDir "server\dev.db"
    if (Test-Path $targetDb) {
        $dest = Join-Path $backupsDir "dev_db_backup_$timestamp.db"
        Copy-Item -Path $targetDb -Destination $dest
        Write-Host "  [+] Database snapshot backed up to: $dest" -ForegroundColor Green
    } else {
        Write-Host "  [!] server\dev.db not found" -ForegroundColor Yellow
    }
}
elseif ($Action -eq "restore") {
    Write-Host "[1/2] Searching for pre-test backup snapshot..." -ForegroundColor Yellow
    $backupsDir = Join-Path $RootDir "backups"
    if (Test-Path $backupsDir) {
        $latestBak = Get-ChildItem -Path $backupsDir -Filter "dev_db_pre_setup_*.bak" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latestBak) {
            $targetDb = Join-Path $RootDir "server\dev.db"
            Copy-Item -Path $latestBak.FullName -Destination $targetDb -Force
            Write-Host "  [+] Restored database from pre-test snapshot: $($latestBak.Name)" -ForegroundColor Green
        } else {
            Write-Host "  [!] Pre-test snapshot file not found in backups directory" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [!] backups directory does not exist" -ForegroundColor Yellow
    }
}
elseif ($Action -eq "dbpush") {
    Write-Host "[1/2] Syncing Prisma Database Schema..." -ForegroundColor Yellow
    Set-Location "$RootDir\server"
    node "scripts/ensure-dev-prisma.cjs"
    Set-Location $RootDir
}
else {
    Write-Host "Available options:" -ForegroundColor Yellow
    Write-Host "  -Action diagnose  (Run smart environment setup)"
    Write-Host "  -Action clean     (Clean test data and reset workspace from scratch)"
    Write-Host "  -Action backup    (Backup database snapshot)"
    Write-Host "  -Action restore   (Restore pre-test snapshot)"
    Write-Host "  -Action dbpush    (Sync Prisma Database Schema)"
}

Write-Host ""
Write-Host "========================================================================================" -ForegroundColor Cyan
