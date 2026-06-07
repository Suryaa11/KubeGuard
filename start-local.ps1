$ErrorActionPreference = 'Stop'

function Write-Info {
  param([string]$Message)
  Write-Host "[kubeguard] $Message" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)
  Write-Host "[  ok  ] $Message" -ForegroundColor Green
}

function Write-Fail {
  param([string]$Message)
  Write-Host "[ fail ] $Message" -ForegroundColor Red
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $root 'frontend'
$gatewayDir = Join-Path $root 'gateway'
$projectDir = Join-Path $root 'project-service'
$watcherDir = Join-Path $root 'watcher-service'
$analysisDir = Join-Path $root 'analysis-service'
$functionsDir = Join-Path $root 'functions'
$envPath = Join-Path $root '.env'

if (-not (Test-Path $envPath)) {
  $examplePath = Join-Path $root '.env.example'
  if (Test-Path $examplePath) {
    Copy-Item $examplePath $envPath
    Write-Info '.env was missing, so it was created from .env.example.'
    Write-Info 'Fill in the Azure values in .env before signing in.'
  } else {
    Write-Fail '.env file not found, and .env.example is missing too.'
    exit 1
  }
}

Get-Content $envPath | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $name, $value = $_ -split '=', 2
  if ($name) { Set-Item -Path "Env:$name" -Value $value }
}

function Ensure-Dependencies {
  param([string]$Dir)
  if (-not (Test-Path (Join-Path $Dir 'node_modules'))) {
    Write-Info "Installing dependencies in $(Split-Path $Dir -Leaf)..."
    Push-Location $Dir
    try {
      npm install
    } finally {
      Pop-Location
    }
  }
}

Ensure-Dependencies -Dir $frontendDir
Ensure-Dependencies -Dir $gatewayDir
Ensure-Dependencies -Dir $projectDir
Ensure-Dependencies -Dir $watcherDir
Ensure-Dependencies -Dir $analysisDir

Write-Info 'Starting Frontend on http://localhost:5173 ...'
$frontendProcess = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run dev -- --host 0.0.0.0' -WorkingDirectory $frontendDir -PassThru -WindowStyle Hidden
Write-Ok "Frontend started (PID $($frontendProcess.Id))"

Write-Info 'Starting API Gateway on http://localhost:3000 ...'
$gatewayProcess = Start-Process -FilePath 'npm.cmd' -ArgumentList 'start' -WorkingDirectory $gatewayDir -PassThru -WindowStyle Hidden
Write-Ok "Gateway started (PID $($gatewayProcess.Id))"

Write-Info 'Starting Project Service on http://localhost:3001 ...'
$projectProcess = Start-Process -FilePath 'npm.cmd' -ArgumentList 'start' -WorkingDirectory $projectDir -PassThru -WindowStyle Hidden
Write-Ok "Project Service started (PID $($projectProcess.Id))"

Write-Info 'Starting Watcher Service on http://localhost:3002 ...'
$watcherProcess = Start-Process -FilePath 'npm.cmd' -ArgumentList 'start' -WorkingDirectory $watcherDir -PassThru -WindowStyle Hidden
Write-Ok "Watcher Service started (PID $($watcherProcess.Id))"

Write-Info 'Starting Analysis Service on http://localhost:3003 ...'
$analysisProcess = Start-Process -FilePath 'npm.cmd' -ArgumentList 'start' -WorkingDirectory $analysisDir -PassThru -WindowStyle Hidden
Write-Ok "Analysis Service started (PID $($analysisProcess.Id))"

$functionsProcess = $null
if (Get-Command func -ErrorAction SilentlyContinue) {
  Ensure-Dependencies -Dir $functionsDir
  Write-Info 'Starting Azure Functions on http://localhost:7071 ...'
  $functionsProcess = Start-Process -FilePath 'func.exe' -ArgumentList 'start' -WorkingDirectory $functionsDir -PassThru -WindowStyle Hidden
  Write-Ok "Azure Functions started (PID $($functionsProcess.Id))"
} else {
  Write-Info 'Azure Functions Core Tools not found. Skipping optional Functions app.'
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Yellow
Write-Host '  KubeGuard AI - running locally' -ForegroundColor Yellow
Write-Host '============================================================' -ForegroundColor Yellow
Write-Host "  Frontend   -> http://localhost:5173" -ForegroundColor Green
Write-Host "  Gateway    -> http://localhost:3000" -ForegroundColor Green
Write-Host "  Project Svc -> http://localhost:3001" -ForegroundColor Green
Write-Host "  Watcher Svc -> http://localhost:3002" -ForegroundColor Green
Write-Host "  Analysis Svc -> http://localhost:3003" -ForegroundColor Green
Write-Host "  Health     -> http://localhost:3000/health" -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Yellow
Write-Host ''
Write-Info 'Press Ctrl+C to stop the script.'

try {
  while ($true) {
    Start-Sleep -Seconds 2
    if ($frontendProcess.HasExited -or $gatewayProcess.HasExited) {
      break
    }
  }
} catch {
  Write-Info 'Stopping services...'
} finally {
  foreach ($process in @($frontendProcess, $gatewayProcess, $projectProcess, $watcherProcess, $analysisProcess, $functionsProcess)) {
    if ($null -ne $process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
