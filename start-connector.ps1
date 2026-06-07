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

$mainPort = [Environment]::GetEnvironmentVariable('PORT', 'Process')
if (-not $mainPort) { $mainPort = '3000' }

$controlApi = [Environment]::GetEnvironmentVariable('CONTROL_API_URL', 'Process')
if (-not $controlApi) {
  $controlApi = "http://127.0.0.1:$mainPort/api/internal"
  [Environment]::SetEnvironmentVariable('CONTROL_API_URL', $controlApi, 'Process')
}

# 节点身份来自 NODE_TOKEN（由 backend/scripts/issue-node-token.js 签发），nodeId 内嵌于令牌
$nodeToken = [Environment]::GetEnvironmentVariable('NODE_TOKEN', 'Process')
if (-not $nodeToken) {
  throw 'Missing NODE_TOKEN in .env (issue with: node backend/scripts/issue-node-token.js <nodeId>)'
}

$nodePublicIp = [Environment]::GetEnvironmentVariable('NODE_PUBLIC_IP', 'Process')
if (-not $nodePublicIp) {
  $nodePublicIp = '127.0.0.1'
  [Environment]::SetEnvironmentVariable('NODE_PUBLIC_IP', $nodePublicIp, 'Process')
  Write-Host '[connector] NODE_PUBLIC_IP is not set, fallback to 127.0.0.1'
}

$nodeRegion = [Environment]::GetEnvironmentVariable('NODE_REGION', 'Process')
if (-not $nodeRegion) {
  $nodeRegion = 'local'
  [Environment]::SetEnvironmentVariable('NODE_REGION', $nodeRegion, 'Process')
}

if (-not (Test-Path (Join-Path $backendDir 'node_modules'))) {
  Write-Host '[connector] Installing backend dependencies...'
  Push-Location $backendDir
  npm install
  Pop-Location
}

Write-Host "[connector] CONTROL_API_URL=$controlApi"
Write-Host "[connector] NODE_PUBLIC_IP=$nodePublicIp"
Write-Host '[connector] Starting connector-node...'

Push-Location $backendDir
npm run connector-node
Pop-Location
