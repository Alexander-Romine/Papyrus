# Opens Papyrus in the default browser, starting the app quietly in the tray
# if its localhost server is not already running. Runs from the repo's tools
# folder, so the app directory is the parent of this script.
$appDir = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $appDir "node_modules\electron\dist\electron.exe"
$ping = 'http://localhost:7331/api/ping'
$baseUrl = 'http://localhost:7331'

function Test-Server {
  try {
    $null = Invoke-RestMethod $ping -TimeoutSec 1
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-Server)) {
  Start-Process $electron -ArgumentList "`"$appDir`" --open-to-browser" -WindowStyle Minimized
  $deadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 400
    if (Test-Server) { break }
  }
}

Start-Process $baseUrl
