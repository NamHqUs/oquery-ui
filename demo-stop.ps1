$ErrorActionPreference = "Stop"

$ports = @(21210, 5173)

function Write-Step {
    param(
        [string]$Message,
        [string]$Status = "INFO"
    )

    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] [$Status] $Message" `
        -ForegroundColor DarkGray
}

function Stop-PortProcess {
    param([int]$Port)

    Write-Step "Checking port $Port..."

    $processIds = @(
        Get-NetTCPConnection -LocalPort $Port -State Listen `
            -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )

    if ($processIds.Count -eq 0) {
        Write-Step "No process is listening on port $Port." "OK"
        return
    }

    foreach ($processId in $processIds) {
        Write-Step "Stopping process tree for PID $processId on port $Port..."

        & taskkill.exe /PID $processId /T /F

        if ($LASTEXITCODE -ne 0) {
            Write-Step "Process $processId may already have exited." "WARN"
        }
    }

    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        $remaining = @(
            Get-NetTCPConnection -LocalPort $Port -State Listen `
                -ErrorAction SilentlyContinue
        )

        if ($remaining.Count -eq 0) {
            Write-Step "Port $Port is released." "OK"
            return
        }

        Start-Sleep -Milliseconds 200
    }

    throw "Port $Port is still occupied."
}

Write-Step "Stopping Dynamic SQL Demo..."

foreach ($port in $ports) {
    Stop-PortProcess -Port $port
}

Write-Host ""
Write-Step "Dynamic SQL Demo stopped." "OK"