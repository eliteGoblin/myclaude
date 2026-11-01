<#
.SYNOPSIS
  Manage a dedicated Chrome instance for Chrome DevTools MCP on Windows.

.DESCRIPTION
  Starts/stops/checks Google Chrome bound to 127.0.0.1:<port> with a dedicated
  user data dir so logins persist across sessions. Used by the Windows+WSL
  Chrome MCP setup (see setup_ubuntu/chrome_mcp_setup.md).

  Listening address is hard-pinned to 127.0.0.1 (loopback) — never exposed to LAN.

.PARAMETER Command
  start | stop | status | restart

.PARAMETER Port
  Remote debugging port (default 9222).

.PARAMETER ProfileDir
  User data dir for the dedicated Chrome profile. Default $env:USERPROFILE\chrome-mcp-profile

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File run_chrome_mcp.ps1 start
  powershell -NoProfile -ExecutionPolicy Bypass -File run_chrome_mcp.ps1 status
#>

param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'status', 'restart')]
    [string]$Command = 'status',

    [int]$Port = 9222,

    [string]$ProfileDir = (Join-Path $env:USERPROFILE 'chrome-mcp-profile')
)

$ErrorActionPreference = 'Stop'

function Find-ChromePath {
    $candidates = @(
        (Join-Path $env:ProgramFiles       'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LocalAppData       'Google\Chrome\Application\chrome.exe')
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    return $null
}

function Test-MCPListening {
    try {
        $r = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/json/version" -f $Port) `
            -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        return ($r.StatusCode -eq 200)
    }
    catch {
        return $false
    }
}

function Get-MCPChromeProcess {
    # Match Chrome processes whose command line uses our dedicated profile.
    $needle = "--user-data-dir=$ProfileDir"
    Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$needle*" }
}

function Start-MCPChrome {
    if (Test-MCPListening) {
        Write-Host ("Chrome MCP already running on 127.0.0.1:{0}" -f $Port)
        return
    }

    $chrome = Find-ChromePath
    if (-not $chrome) {
        Write-Error "chrome.exe not found. Install Google Chrome or set its path manually."
        exit 1
    }

    if (-not (Test-Path $ProfileDir)) {
        New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
    }

    $chromeArgs = @(
        "--user-data-dir=$ProfileDir",
        "--remote-debugging-port=$Port",
        "--remote-debugging-address=127.0.0.1",
        "--remote-allow-origins=*",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=ChromeWhatsNewUI"
    )

    Start-Process -FilePath $chrome -ArgumentList $chromeArgs -WindowStyle Minimized | Out-Null

    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-MCPListening) {
            Write-Host ("Started Chrome MCP on 127.0.0.1:{0}" -f $Port)
            Write-Host ("Profile: {0}" -f $ProfileDir)
            return
        }
    }

    Write-Error ("Chrome MCP did not become ready on 127.0.0.1:{0} within 15s" -f $Port)
    exit 1
}

function Stop-MCPChrome {
    $procs = Get-MCPChromeProcess
    if (-not $procs) {
        Write-Host "No Chrome MCP process found (nothing to stop)."
        return
    }
    foreach ($p in $procs) {
        try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {}
    }
    Write-Host "Stopped Chrome MCP processes."
}

function Get-MCPStatus {
    if (Test-MCPListening) {
        Write-Host ("HEALTHY: Chrome MCP listening on 127.0.0.1:{0}" -f $Port)
        Write-Host ("Profile: {0}" -f $ProfileDir)
        exit 0
    }
    else {
        Write-Host ("DOWN: nothing listening on 127.0.0.1:{0}" -f $Port)
        exit 1
    }
}

switch ($Command) {
    'start'   { Start-MCPChrome }
    'stop'    { Stop-MCPChrome }
    'status'  { Get-MCPStatus }
    'restart' { Stop-MCPChrome; Start-Sleep -Seconds 1; Start-MCPChrome }
}
