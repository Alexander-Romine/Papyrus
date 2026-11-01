# Installs Desktop + Start Menu shortcuts for Papyrus and a browser launcher,
# removing any old "Blank Slate" shortcuts. Runs from the repo's tools folder,
# so the app directory is the parent of this script.
$appDir = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $appDir "icon.ico"
$shortcutIcon = Join-Path $appDir "icon-shortcut.ico"
$electron = Join-Path $appDir "node_modules\electron\dist\electron.exe"
$browserLauncher = Join-Path $appDir "tools\open-in-browser.ps1"
$ws = New-Object -ComObject WScript.Shell

$desktop = [Environment]::GetFolderPath('Desktop')
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"

# remove old brand links
foreach ($old in @((Join-Path $desktop "Blank Slate.lnk"), (Join-Path $startMenu "Blank Slate.lnk"), (Join-Path $desktop "Blank Slate in Browser.lnk"))) {
    if (Test-Path $old) { Remove-Item $old -Force; Write-Output "removed: $old" }
}

# copy icon to a dedicated shortcut path to ensure Explorer bypasses stale caches
Copy-Item $iconPath $shortcutIcon -Force

# recreate desktop shortcut so the new icon displays immediately
$desktopLink = Join-Path $desktop "Papyrus.lnk"
if (Test-Path $desktopLink) { Remove-Item $desktopLink -Force }

$links = @($desktopLink, (Join-Path $startMenu "Papyrus.lnk"))
foreach ($link in $links) {
    $sc = $ws.CreateShortcut($link)
    $sc.TargetPath = $electron
    $sc.Arguments = "`"$appDir`""
    $sc.WorkingDirectory = $appDir
    $sc.IconLocation = "$shortcutIcon,0"
    $sc.Description = "Papyrus - a fresh page every time, every note kept"
    $sc.WindowStyle = 1
    $sc.Save()
}

# second shortcut: opens Papyrus in the default browser (starts the app quietly if needed)
$browserLink = Join-Path $desktop "Papyrus in Browser.lnk"
if (Test-Path $browserLink) { Remove-Item $browserLink -Force }
$ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$sc = $ws.CreateShortcut($browserLink)
$sc.TargetPath = $ps
$sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$browserLauncher`""
$sc.WorkingDirectory = $appDir
$sc.IconLocation = "$shortcutIcon,0"
$sc.Description = "Open Papyrus in the default browser"
$sc.WindowStyle = 7
$sc.Save()

foreach ($link in ($links + $browserLink)) { Write-Output "link: $link = $(Test-Path $link)" }
Write-Output "icon-shortcut: $shortcutIcon"
