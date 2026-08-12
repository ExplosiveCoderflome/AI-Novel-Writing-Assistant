# win_start.ps1 - Daydream Engine Smart Startup & Service Daemon (PowerShell)
$ErrorActionPreference = "Continue"

Write-Host "========================================================================================" -ForegroundColor Cyan
Write-Host "  Daydream Engine - Service Orchestrator & Daemon Launcher" -ForegroundColor Cyan
Write-Host "========================================================================================" -ForegroundColor Cyan
Write-Host ""

# 配置 Ollama GPU 多并发并行推理环境变量
$env:OLLAMA_NUM_PARALLEL = "4"
$env:OLLAMA_MAX_LOADED_MODELS = "2"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
Set-Location $RootDir

# 1. 运行智能探测与环境配置
Write-Host "[1/5] Running Smart Environment Setup & DB Verification..." -ForegroundColor Yellow
node "$ScriptDir\smart-environment-setup.cjs"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Smart environment probe returned notice, proceeding with launch..." -ForegroundColor Red
}

# 2. 检查 Qdrant 向量数据库 (6333)
Write-Host "[2/5] Checking Qdrant Vector Database (port 6333)..." -ForegroundColor Yellow
$qdrantProbe = Try { Invoke-RestMethod -Uri "http://127.0.0.1:6333/healthz" -TimeoutSec 2 -ErrorAction Stop } Catch { $null }
if ($qdrantProbe) {
    Write-Host "  [+] Qdrant Vector Database is online (port 6333)" -ForegroundColor Green
} else {
    $localAppData = $env:LOCALAPPDATA
    if (-not $localAppData) { $localAppData = "C:\Users\lilin\AppData\Local" }
    $qdrantExe = Join-Path $localAppData "Qdrant\qdrant.exe"
    if (Test-Path $qdrantExe) {
        Write-Host "  [...] Launching Qdrant daemon..." -ForegroundColor Cyan
        Start-Process -FilePath $qdrantExe -WindowStyle Hidden
    } else {
        Write-Host "  [!] Qdrant executable not found locally, RAG feature will use fallback" -ForegroundColor Yellow
    }
}

# 3. 检查 Python 离线 TTS 配音服务 (8000)
Write-Host "[3/5] Checking Python TTS Service (port 8000)..." -ForegroundColor Yellow
$ttsProbe = Try { Invoke-RestMethod -Uri "http://127.0.0.1:8000/docs" -TimeoutSec 2 -ErrorAction Stop } Catch { $null }
if ($ttsProbe) {
    Write-Host "  [+] Python Kokoro TTS Service is online (port 8000)" -ForegroundColor Green
} else {
    Write-Host "  [...] Launching Python Kokoro TTS daemon in background..." -ForegroundColor Cyan
    Start-Process -FilePath "python" -ArgumentList "scripts/start-local-tts.py" -WindowStyle Hidden
}

# 4. 检查 ComfyUI 生图服务 (8188)
Write-Host "[4/5] Checking ComfyUI Generation Service (port 8188)..." -ForegroundColor Yellow
$comfyProbe = Try { Invoke-RestMethod -Uri "http://127.0.0.1:8188/system_stats" -TimeoutSec 2 -ErrorAction Stop } Catch { $null }
if ($comfyProbe) {
    Write-Host "  [+] ComfyUI Service is online (port 8188)" -ForegroundColor Green
} else {
    Write-Host "  [i] ComfyUI is not currently listening on 8188. It will be auto-triggered on demand." -ForegroundColor Gray
}

# 5. 启动主服务并打开浏览器 (3000 & 5173)
Write-Host "[5/5] Launching Daydream Engine Services (Express API:3000 + React Web UI:5173)..." -ForegroundColor Yellow
Write-Host ""
Write-Host "----------------------------------------------------------------------------------------" -ForegroundColor Green
Write-Host "  🚀 Application services launching! Keep this console window open." -ForegroundColor Green
Write-Host "  Web UI Portal:  http://localhost:5173" -ForegroundColor Green
Write-Host "  Backend API:    http://localhost:3000" -ForegroundColor Green
Write-Host "----------------------------------------------------------------------------------------" -ForegroundColor Green
Write-Host ""

# 启动底层 pnpm dev 进程
$job = Start-Job -ScriptBlock {
    param($root)
    Set-Location $root
    pnpm dev
} -ArgumentList $RootDir

# 轮询探测 5173 端口连通性
$opened = $false
for ($i = 1; $i -le 25; $i++) {
    Start-Sleep -Seconds 1
    $clientProbe = Try { Invoke-RestMethod -Uri "http://localhost:5173" -TimeoutSec 1 -ErrorAction Stop } Catch { $null }
    if ($clientProbe) {
        Write-Host "[+] Web UI detected! Opening default system browser..." -ForegroundColor Green
        Start-Process "http://localhost:5173"
        $opened = $true
        break
    }
}

if (-not $opened) {
    Write-Host "[i] If browser does not open automatically, visit: http://localhost:5173" -ForegroundColor Cyan
}

Receive-Job -Job $job -Wait
