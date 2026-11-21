param([int]$Port=3000)
$repoRoot = Split-Path $PSScriptRoot -Parent
$parentDir = Split-Path $repoRoot -Parent
foreach($line in Get-Content -LiteralPath (Join-Path $parentDir '.env')) {
  if($line -match '^\s*(MONAD_RPC_URL|DEPLOYER_PRIVATE_KEY)\s*=\s*(.*?)\s*$') {
    [Environment]::SetEnvironmentVariable($Matches[1],$Matches[2].Trim().Trim('"').Trim("'"),'Process')
  }
}
$env:DEMO_CODE = (Get-Content -LiteralPath (Join-Path $parentDir '.demo-local-code') -Raw).Trim()
$env:NEXT_TELEMETRY_DISABLED='1'
Push-Location (Join-Path $repoRoot 'packages/nextjs')
try { & node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port $Port } finally { Pop-Location }
