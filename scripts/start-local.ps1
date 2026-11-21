param([int]$Port=3000,[switch]$Production)
$projectRoot=Split-Path $PSScriptRoot -Parent
$envFile=if($env:NIUMA_ENV_FILE){$env:NIUMA_ENV_FILE}else{Join-Path (Split-Path $projectRoot -Parent) '.env'}
foreach($line in Get-Content -LiteralPath $envFile){if($line -match '^\s*(MONAD_RPC_URL)\s*=\s*(.*?)\s*$'){[Environment]::SetEnvironmentVariable($Matches[1],$Matches[2].Trim().Trim('"').Trim("'"),'Process')}}
$env:NEXT_TELEMETRY_DISABLED='1'
$mode=if($Production){'start'}else{'dev'}
Push-Location (Join-Path $projectRoot 'packages/nextjs')
try{& node node_modules/next/dist/bin/next $mode --hostname 127.0.0.1 --port $Port}finally{Pop-Location}
