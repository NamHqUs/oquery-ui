$ErrorActionPreference = "Stop"

# ============================================================
# Configuration
# ============================================================

$repoRoot = $PSScriptRoot

$apiDirectory = Join-Path $repoRoot "src\OQuery.UI"
$frontendDirectory = Join-Path $repoRoot "src\Demo.Frontend"

$apiPort = 21210
$frontendPort = 4173

$stateDirectory = Join-Path $env:TEMP "DynamicSqlDemo"

$apiLog = Join-Path $stateDirectory "api.log"
$apiErrorLog = Join-Path $stateDirectory "api-error.log"

$frontendLog = Join-Path $stateDirectory "frontend.log"
$frontendErrorLog = Join-Path $stateDirectory "frontend-error.log"

$browserRunnerLog = Join-Path $stateDirectory "browser-runner.log"
$browserRunnerErrorLog = Join-Path $stateDirectory "browser-runner-error.log"

$browserScript = Join-Path $stateDirectory "open-browser.ps1"

$apiUrl = "http://localhost:$apiPort/swagger"
$frontendUrl = "http://localhost:$frontendPort"

# ============================================================
# Helpers
# ============================================================

function Write-Step {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )

    Write-Host "[$Level] $Message" -ForegroundColor DarkGray
}

function Get-PortProcessIds {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    $connections = @(
        Get-NetTCPConnection `
            -LocalPort $Port `
            -State Listen `
            -ErrorAction SilentlyContinue
    )

    return @(
        $connections |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
}

function Stop-PortProcess {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    $processIds = @(Get-PortProcessIds -Port $Port)

    if ($processIds.Count -eq 0) {
        Write-Step "Port $Port is not in use."
        return
    }

    foreach ($processId in $processIds) {
        Write-Step "Stopping process tree for PID $processId on port $Port..."

        & taskkill.exe /PID $processId /T /F 2>&1 | Out-Null

        if ($LASTEXITCODE -eq 0) {
            Write-Step "Stopped process $processId."
        }
        else {
            Write-Step "Could not stop process $processId."
        }
    }

    for ($attempt = 1; $attempt -le 20; $attempt++) {
        if (@(Get-PortProcessIds -Port $Port).Count -eq 0) {
            Write-Step "Port $Port is released."
            return
        }

        Start-Sleep -Milliseconds 500
    }

    throw "Port $Port is still occupied after stopping its process."
}

function Start-DetachedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,

        [Parameter(Mandatory = $true)]
        [string]$Command,

        [Parameter(Mandatory = $true)]
        [string]$OutputLog,

        [Parameter(Mandatory = $true)]
        [string]$ErrorLog
    )

    $commandFile = Join-Path $stateDirectory "$Name.cmd"

    @(
        "@echo off"
        "cd /d `"$WorkingDirectory`""
        "if errorlevel 1 exit /b 1"
        "$Command 1>`"$OutputLog`" 2>`"$ErrorLog`" < NUL"
    ) | Set-Content -LiteralPath $commandFile -Encoding ASCII

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $env:ComSpec
    $startInfo.Arguments = "/d /c `"$commandFile`""
    $startInfo.WorkingDirectory = $stateDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $process = [System.Diagnostics.Process]::Start($startInfo)

    $process.StandardInput.Close()
    $null = $process.StandardOutput.ReadToEndAsync()
    $null = $process.StandardError.ReadToEndAsync()

    Write-Step "$Name launched (PID $($process.Id))."
}

# ============================================================
# Initialize
# ============================================================

if (-not (Test-Path -LiteralPath $stateDirectory)) {
    New-Item -ItemType Directory -Path $stateDirectory -Force |
        Out-Null
}

# Capture the frontend state BEFORE stopping any processes.
# This flag is used ONLY to determine whether to open the browser.
$frontendWasRunning = @(
    Get-PortProcessIds -Port $frontendPort
).Count -gt 0

if ($frontendWasRunning) {
    Write-Step "Frontend port $frontendPort was occupied before startup."
}
else {
    Write-Step "Frontend port $frontendPort was free before startup."
}

# ============================================================
# Validate environment
# ============================================================

if (-not (Test-Path -LiteralPath $apiDirectory)) {
    throw "API directory not found: $apiDirectory"
}

if (-not (Test-Path -LiteralPath $frontendDirectory)) {
    throw "Frontend directory not found: $frontendDirectory"
}

if (-not (Get-Command dotnet.exe -ErrorAction SilentlyContinue)) {
    throw "dotnet.exe was not found. Install the .NET SDK or update PATH."
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "npm.cmd was not found. Install Node.js or update PATH."
}

# ============================================================
# Stop existing services
# ============================================================

Write-Step "Stopping existing API and frontend processes..."

Stop-PortProcess -Port $apiPort
Stop-PortProcess -Port $frontendPort

# ============================================================
# Install frontend dependencies if needed
# ============================================================

$nodeModulesDirectory = Join-Path $frontendDirectory "node_modules"

if (-not (Test-Path -LiteralPath $nodeModulesDirectory)) {
    Write-Step "Installing frontend dependencies with npm ci..."

    Push-Location $frontendDirectory

    try {
        & npm.cmd ci

        if ($LASTEXITCODE -ne 0) {
            throw "npm ci failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    Write-Step "Frontend dependencies installed."
}

# ============================================================
# Start API
# ============================================================

Write-Step "Starting API..."

Start-DetachedCommand `
    -Name "api" `
    -WorkingDirectory $apiDirectory `
    -Command "dotnet.exe run" `
    -OutputLog $apiLog `
    -ErrorLog $apiErrorLog

# ============================================================
# Start frontend
# ============================================================

Write-Step "Starting frontend..."

Start-DetachedCommand `
    -Name "frontend" `
    -WorkingDirectory $frontendDirectory `
    -Command "call npm.cmd run dev" `
    -OutputLog $frontendLog `
    -ErrorLog $frontendErrorLog

# ============================================================
# Create browser checker
# ============================================================

@'
$ErrorActionPreference = "Stop"

$hostName = "127.0.0.1"
$port = 5173
$uri = "http://localhost:4173"
$log = Join-Path $env:TEMP "DynamicSqlDemo\browser.log"

function Write-BrowserLog {
    param([string]$Message)

    Add-Content -LiteralPath $log `
        -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
}

Write-BrowserLog "Waiting for frontend TCP port $port..."

for ($attempt = 1; $attempt -le 90; $attempt++) {
    $client = New-Object System.Net.Sockets.TcpClient
    $connect = $null

    try {
        $connect = $client.BeginConnect(
            $hostName,
            $port,
            $null,
            $null
        )

        $connected = $connect.AsyncWaitHandle.WaitOne(1000, $false)

        if ($connected -and $client.Connected) {
            $client.EndConnect($connect)
            $client.Close()

            Write-BrowserLog "Frontend port is accepting connections."

            Start-Process -FilePath $uri

            Write-BrowserLog "Browser launch requested."
            exit 0
        }
    }
    catch {
        Write-BrowserLog "Attempt $attempt failed: $($_.Exception.Message)"
    }
    finally {
        if ($null -ne $connect) {
            $connect.AsyncWaitHandle.Close()
        }

        $client.Close()
    }

    Start-Sleep -Seconds 1
}

Write-BrowserLog "ERROR: Frontend port $port did not become available."
exit 1
'@ | Set-Content -LiteralPath $browserScript -Encoding UTF8

# ============================================================
# Browser launch decision
# The flag affects ONLY browser launch.
# ============================================================

if (-not $frontendWasRunning) {
    Write-Step "Frontend was initially stopped. Scheduling browser launch..."

    Start-DetachedCommand `
        -Name "browser-checker" `
        -WorkingDirectory $stateDirectory `
        -Command "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$browserScript`"" `
        -OutputLog $browserRunnerLog `
        -ErrorLog $browserRunnerErrorLog
}
else {
    Write-Step "Frontend was already running initially. Browser launch skipped."
}

# ============================================================
# Summary
# ============================================================

Write-Host ""
Write-Host "Frontend: $frontendUrl" -ForegroundColor Green
Write-Host "Swagger:  $apiUrl" -ForegroundColor Green
Write-Host "Logs:     $stateDirectory" -ForegroundColor DarkGray
Write-Host ""
Write-Step "Services launched in the background. Terminal remains available."