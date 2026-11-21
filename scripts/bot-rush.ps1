param([int]$N=100,[ValidateSet('hot','spread')][string]$Mode='spread',[ValidateSet('v1','v2')][string]$Version='v2',[string]$Read)
$projectRoot=Split-Path $PSScriptRoot -Parent
$arguments=@('-X','utf8',(Join-Path $PSScriptRoot 'bot-rush.py'),'--n',$N,'--mode',$Mode,'--version',$Version)
if($Read){$arguments+=@('--read',$Read)}
& (Join-Path $projectRoot '.venv\Scripts\python.exe') @arguments
exit $LASTEXITCODE
