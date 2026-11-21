param([int]$Port = 3000)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$envFile = if ($env:NIUMA_ENV_FILE) { $env:NIUMA_ENV_FILE } else { Join-Path (Split-Path $projectRoot -Parent) '.env' }
# Only the credentials needed by the read/queue API are loaded into Next.js.
foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^\s*(MONAD_RPC_URL|BLOB_READ_WRITE_TOKEN|BLOB_ACCESS|DEPLOYER_PRIVATE_KEY)\s*=\s*(.*?)\s*$') {
        $name = if ($Matches[1] -eq 'DEPLOYER_PRIVATE_KEY') { 'FAUCET_PRIVATE_KEY' } else { $Matches[1] }
        $value = $Matches[2].Trim().Trim('"').Trim("'")
        if ($value) { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
    }
}
$env:GENERATION_ENABLED = 'true'
$env:FAUCET_ENABLED = 'true'
$env:NEXT_TELEMETRY_DISABLED = '1'
Push-Location (Join-Path $projectRoot 'packages/nextjs')
try { & node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port $Port } finally { Pop-Location }
