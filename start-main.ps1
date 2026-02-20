$ErrorActionPreference = 'Stop'

function Test-Command {
  param([Parameter(Mandatory = $true)][string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Import-DotEnvFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path $Path)) {
    throw ".env file not found: $Path"
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }

    $firstEq = $line.IndexOf('=')
    if ($firstEq -lt 1) { return }

    $key = $line.Substring(0, $firstEq).Trim()
    $value = $line.Substring($firstEq + 1).Trim()

    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Substring(1, $value.Length - 2)
    } elseif ($value.StartsWith("'") -and $value.EndsWith("'")) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    [Environment]::SetEnvironmentVariable($key, $value, 'Process')
  }
}

if (-not (Test-Command 'node')) {
  throw 'Node.js is required. Please install Node.js 20+ first.'
}

if (-not (Test-Command 'npm')) {
  throw 'npm is required. Please install Node.js (with npm) first.'
}

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectRoot 'backend'
$envFile = Join-Path $projectRoot '.env'

Import-DotEnvFile -Path $envFile

$requiredEnv = @('DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET', 'INTERNAL_API_TOKEN')
foreach ($key in $requiredEnv) {
  if (-not [Environment]::GetEnvironmentVariable($key, 'Process')) {
    throw "Missing required env var in .env: $key"
  }
}

if (-not (Test-Path (Join-Path $backendDir 'node_modules'))) {
  Write-Host '[main] Installing backend dependencies...'
  Push-Location $backendDir
  npm install
  Pop-Location
}

Write-Host '[main] Starting api-core...'
Push-Location $backendDir
npm start
Pop-Location
