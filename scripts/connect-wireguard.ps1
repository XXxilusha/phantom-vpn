# ============================================
# Phantom VPN — WireGuard Connect Script (Windows)
# ============================================
# Usage: Right-click > Run with PowerShell
# Requires: WireGuard installed from wireguard.com/install
# ============================================

param(
    [string]$ConfigPath = "$PSScriptRoot\..\wireguard-client.conf",
    [switch]$Disconnect
)

$ErrorActionPreference = "Stop"

function Write-Status($msg, $color = "Cyan") {
    Write-Host "[Phantom VPN] " -ForegroundColor Magenta -NoNewline
    Write-Host $msg -ForegroundColor $color
}

# Check WireGuard installation
$wgPath = "C:\Program Files\WireGuard\wireguard.exe"
if (-not (Test-Path $wgPath)) {
    Write-Status "WireGuard not found. Install from https://wireguard.com/install" "Red"
    Start-Process "https://wireguard.com/install"
    exit 1
}

$tunnelName = "PhantomVPN"

if ($Disconnect) {
    Write-Status "Disconnecting..."
    & $wgPath /uninstalltunnelservice $tunnelName 2>$null
    Write-Status "Disconnected!" "Green"
    exit 0
}

# Check config
if (-not (Test-Path $ConfigPath)) {
    Write-Status "Config not found at: $ConfigPath" "Red"
    Write-Status "Run the deploy script first, or place your .conf file there" "Yellow"
    exit 1
}

Write-Status "Starting WireGuard tunnel..."
Write-Status "Config: $ConfigPath" "Gray"

# Copy config with tunnel name
$wgConfigDir = "$env:LOCALAPPDATA\WireGuard\Configurations"
if (-not (Test-Path $wgConfigDir)) {
    New-Item -ItemType Directory -Path $wgConfigDir -Force | Out-Null
}

Copy-Item $ConfigPath "$wgConfigDir\$tunnelName.conf" -Force

# Install and start tunnel
& $wgPath /installtunnelservice "$wgConfigDir\$tunnelName.conf"

Start-Sleep -Seconds 2

# Verify
$status = & "C:\Program Files\WireGuard\wg.exe" show 2>$null
if ($status) {
    Write-Status "Connected!" "Green"
    Write-Host ""
    Write-Host $status
    Write-Host ""

    # Show public IP
    try {
        $ip = (Invoke-WebRequest -Uri "https://ifconfig.me" -UseBasicParsing -TimeoutSec 5).Content.Trim()
        Write-Status "Your public IP: $ip" "Cyan"
    } catch {
        Write-Status "Could not fetch public IP" "Yellow"
    }
} else {
    Write-Status "Tunnel may still be starting. Check WireGuard app." "Yellow"
}

Write-Host ""
Write-Status "To disconnect: .\connect-wireguard.ps1 -Disconnect" "Gray"
