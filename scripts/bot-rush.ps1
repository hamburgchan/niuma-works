param([int]$N = 30, [string]$Url = 'http://127.0.0.1:3000', [string]$Read)
$projectRoot = Split-Path $PSScriptRoot -Parent
$env:PYTHONUTF8 = '1'
$arguments = @((Join-Path $PSScriptRoot 'bot-rush.py'), '--n', $N, '--url', $Url)
if ($Read) { $arguments += @('--read', $Read) }
& (Join-Path $projectRoot '.venv\Scripts\python.exe') @arguments
exit $LASTEXITCODE
