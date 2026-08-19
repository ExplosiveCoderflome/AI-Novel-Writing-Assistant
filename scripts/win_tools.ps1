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
elseif ($Action -eq "muse-download" -or $Action -eq "musedownload") {
    Write-Host "[1/2] Checking HuggingFace CLI environment for Muse-Glimmer-30B..." -ForegroundColor Yellow
    $modelsDir = "C:\models"
    if (-not (Test-Path $modelsDir)) { New-Item -ItemType Directory -Path $modelsDir | Out-Null }

    Write-Host "[2/2] Downloading Muse-Glimmer-30B-GGUF (Q4_K_M) into $modelsDir..." -ForegroundColor Yellow
    Write-Host "      Model repository : bartowski/Muse-Glimmer-30B-GGUF" -ForegroundColor Cyan
    Write-Host "      Target File      : *Q4_K_M.gguf (~18.5 GB)" -ForegroundColor Cyan
    Write-Host "      Target Directory : $modelsDir" -ForegroundColor Cyan
    Write-Host ""

    $hfCmd = Get-Command hf, huggingface-cli -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hfCmd) {
        if ($hfCmd.Name -eq "hf" -or $hfCmd.Name -eq "hf.exe") {
            hf download bartowski/Muse-Glimmer-30B-GGUF --include "*Q4_K_M.gguf" --local-dir $modelsDir
        } else {
            huggingface-cli download bartowski/Muse-Glimmer-30B-GGUF --include "*Q4_K_M.gguf" --local-dir $modelsDir
        }
    } else {
        Write-Host "  [...] Installing huggingface_hub Python package..." -ForegroundColor Yellow
        pip install -U huggingface_hub
        hf download bartowski/Muse-Glimmer-30B-GGUF --include "*Q4_K_M.gguf" --local-dir $modelsDir
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [+] Muse-Glimmer-30B GGUF model download completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "  [!] Download finished with exit code $LASTEXITCODE. Please check internet connection." -ForegroundColor Yellow
    }
}
elseif ($Action -eq "muse-start" -or $Action -eq "musestart") {
    Write-Host "[1/2] Searching for Muse-Glimmer-30B GGUF model and engine..." -ForegroundColor Yellow
    
    $modelFile = Get-ChildItem -Path "C:\models", "$RootDir\models", "$env:USERPROFILE\.cache" -Recurse -Filter "*Muse-Glimmer*.gguf" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $modelFile) {
        Write-Host "  [!] Muse-Glimmer GGUF model file not found in C:\models or local cache." -ForegroundColor Red
        Write-Host "      Please run option [6] in toolbox first to download the model." -ForegroundColor Yellow
        return
    }

    Write-Host "  [+] Found Muse-Glimmer Model File: $($modelFile.FullName)" -ForegroundColor Green

    if (Get-Command ollama -ErrorAction SilentlyContinue) {
        Write-Host "[2/2] Registering & Launching Muse-Glimmer-30B via Ollama GPU Engine..." -ForegroundColor Cyan
        $modelfilePath = "C:\models\Modelfile"
        Set-Content -Path $modelfilePath -Value "FROM $($modelFile.FullName)`nPARAMETER temperature 0.7`nPARAMETER num_ctx 8192"
        ollama create muse-glimmer-30b -f $modelfilePath
        Write-Host "  [+] Muse-Glimmer-30B is online in Ollama!" -ForegroundColor Green
        Write-Host "      OpenAI API Base: http://127.0.0.1:11434/v1" -ForegroundColor Green
        Write-Host "      Ollama API Base: http://127.0.0.1:11434" -ForegroundColor Green
        ollama run muse-glimmer-30b
    } else {
        $llamaServer = "C:\Users\lilin\.unsloth\llama.cpp\build\bin\Release\llama-server.exe"
        if (Test-Path $llamaServer) {
            Write-Host "[2/2] Launching Muse-Glimmer-30B LLM server on port 8080..." -ForegroundColor Cyan
            & $llamaServer -m $modelFile.FullName --host 0.0.0.0 --port 8080 -ngl 99 -c 8192
        } else {
            Write-Host "  [!] Neither Ollama nor llama-server.exe was found." -ForegroundColor Red
        }
    }
}
else {
    Write-Host "Available options:" -ForegroundColor Yellow
    Write-Host "  -Action diagnose       (Run smart environment setup)"
    Write-Host "  -Action clean          (Clean test data and reset workspace from scratch)"
    Write-Host "  -Action backup         (Backup database snapshot)"
    Write-Host "  -Action restore        (Restore pre-test snapshot)"
    Write-Host "  -Action dbpush         (Sync Prisma Database Schema)"
    Write-Host "  -Action muse-download  (Download Muse-Glimmer-30B GGUF model via HF)"
    Write-Host "  -Action muse-start     (Launch Muse-Glimmer-30B via CUDA llama-server on port 8080)"
}

Write-Host ""
Write-Host "========================================================================================" -ForegroundColor Cyan
