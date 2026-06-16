# Downloads latest sing-box release for windows-amd64 into electron/bin/sing-box.exe
# Usage: npm run download-singbox

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$binDir = Join-Path $root 'bin'
$target = Join-Path $binDir 'sing-box.exe'

if (-not (Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir -Force | Out-Null }

Write-Host '[*] Querying GitHub for latest sing-box release...'
$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/SagerNet/sing-box/releases/latest' `
  -Headers @{ 'User-Agent' = 'phantom-vpn' }

$asset = $release.assets | Where-Object { $_.name -match 'sing-box-.*-windows-amd64\.zip$' } | Select-Object -First 1
if (-not $asset) { throw 'No windows-amd64 asset found in release' }

$tempZip = Join-Path $binDir 'sing-box-download.zip'
$extract = Join-Path $binDir 'extract'

$sizeMb = [math]::Round($asset.size / 1MB, 1)
Write-Host "[*] Downloading $($asset.name) ($sizeMb MB)..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tempZip -UserAgent 'phantom-vpn'

if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -LiteralPath $tempZip -DestinationPath $extract -Force

$exe = Get-ChildItem -Path $extract -Filter 'sing-box.exe' -Recurse | Select-Object -First 1
if (-not $exe) { throw 'sing-box.exe not found in archive' }

Copy-Item -Path $exe.FullName -Destination $target -Force
Remove-Item $extract -Recurse -Force
Remove-Item $tempZip -Force

Write-Host "[OK] sing-box $($release.tag_name) installed at $target"
