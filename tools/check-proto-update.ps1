# One-shot Rust+ protocol drift checker.
# Steps:
#   1) Update Rust dedicated server via SteamCMD anonymous (app 258550)
#   2) Extract .proto from server DLLs via Mono.Cecil reflection
#   3) Diff against local lib/rustplus/rustplus.proto
# Usage:
#   .\tools\check-proto-update.ps1
#   .\tools\check-proto-update.ps1 -SkipDownload   # skip steamcmd, use existing server files

[CmdletBinding()]
param(
    [switch]$SkipDownload
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $repoRoot 'tools'
$steamCmd = Join-Path $toolsDir 'steamcmd/steamcmd.exe'
$serverDir = Join-Path $toolsDir 'rust-server'
$managedDir = Join-Path $serverDir 'RustDedicated_Data/Managed'
$cecilDll = Join-Path $toolsDir 'lib/mono-cecil-extracted/lib/net40/Mono.Cecil.dll'
$extractScript = Join-Path $toolsDir 'extract-proto-cecil.ps1'
$diffScript = Join-Path $toolsDir 'diff-proto.mjs'
$reportPath = Join-Path $toolsDir 'PROTO_DIFF.md'

function Assert-Path {
    param($path, $hint)
    if (-not (Test-Path $path)) {
        Write-Error "Missing: $path`n$hint"
    }
}

function Step {
    param([string]$msg)
    Write-Host ""
    Write-Host ("==> " + $msg) -ForegroundColor Cyan
}

# ----- Sanity checks -----
Step "Checking prerequisites"
Assert-Path $cecilDll "Mono.Cecil not found. Re-run setup or extract Mono.Cecil 0.11.5 NuGet to tools/lib/."
Assert-Path $extractScript "Missing extract-proto-cecil.ps1"
Assert-Path $diffScript "Missing diff-proto.mjs"
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { Write-Error "node not found in PATH. Install Node.js or add it to PATH." }
Write-Host "  cecil: ok"
Write-Host "  extract script: ok"
Write-Host "  diff script: ok"
Write-Host ("  node: " + $node.Source)

# ----- Step 1: SteamCMD update -----
if ($SkipDownload) {
    Step "Skipping SteamCMD (using existing server files)"
    Assert-Path $managedDir "Server files missing. Run without -SkipDownload first."
} else {
    Step "Updating Rust dedicated server (app 258550) via SteamCMD"
    Assert-Path $steamCmd "SteamCMD not found at $steamCmd"
    $steamArgs = @('+force_install_dir', $serverDir, '+login', 'anonymous', '+app_update', '258550', 'validate', '+quit')
    $logFile = Join-Path $toolsDir 'steamcmd.log'
    # SteamCMD self-updates on first run and exits with code 7; retry once on that.
    $attempt = 0
    while ($true) {
        $attempt++
        Write-Host ("  steamcmd attempt #" + $attempt + " ...")
        $proc = Start-Process -FilePath $steamCmd -ArgumentList $steamArgs -NoNewWindow -Wait -PassThru -RedirectStandardOutput $logFile
        $code = $proc.ExitCode
        Write-Host ("  exit code: " + $code)
        if ($code -eq 0) { break }
        if ($code -eq 7 -and $attempt -lt 3) {
            Write-Host "  (self-update; retrying)"
            continue
        }
        Write-Error ("SteamCMD failed (exit " + $code + "). See " + $logFile)
    }
    $tail = Get-Content -Path $logFile -Tail 6
    foreach ($line in $tail) { Write-Host ("    " + $line) }
}

# ----- Step 2: extract -----
Step "Extracting protobuf schema from server DLLs"
& powershell.exe -ExecutionPolicy Bypass -NoProfile -File $extractScript

# ----- Step 3: diff -----
Step "Diffing extracted vs local baseline"
Push-Location $repoRoot
try { & node $diffScript } finally { Pop-Location }

# ----- Done -----
Step "Done"
if (Test-Path $reportPath) {
    Write-Host ("Report: " + $reportPath) -ForegroundColor Green
    Write-Host "Open this file in your editor for full details." -ForegroundColor DarkGray
} else {
    Write-Warning "Report not generated"
}
