param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$envFile = if ($env:NIUMA_ENV_FILE) { $env:NIUMA_ENV_FILE } elseif (Test-Path -LiteralPath (Join-Path $projectRoot '.env')) { Join-Path $projectRoot '.env' } else { Join-Path (Split-Path $projectRoot -Parent) '.env' }
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Configure DEPLOYER_PRIVATE_KEY in the local .env first.' }
$secrets = @()
foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
        $name = $Matches[1]; $value = $Matches[2].Trim().Trim('"').Trim("'")
        if ($value) { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
        if ($value -and $name -match 'PRIVATE_KEY|TOKEN|SECRET') { $secrets += $value }
    }
}
function Redact([string]$text) {
    foreach ($secret in $secrets) { $text = $text.Replace($secret, '[REDACTED]') }
    return $text
}
$rpc = if ($env:MONAD_RPC_URL) { $env:MONAD_RPC_URL } else { 'https://testnet-rpc.monad.xyz' }
function Rpc([string]$method, [object[]]$params) {
    $body = @{ jsonrpc='2.0'; id=1; method=$method; params=$params } | ConvertTo-Json -Compress -Depth 8
    $answer = Invoke-RestMethod -Uri $rpc -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 30
    if ($answer.error) { throw (Redact ($answer.error | ConvertTo-Json -Compress)) }
    return $answer.result
}
if ((Rpc 'eth_chainId' @()) -ne '0x279f') { throw 'Refusing deployment: target is not Monad testnet 10143.' }
$foundryRoot = Join-Path $projectRoot 'packages/foundry'
$evidenceRoot = Join-Path $projectRoot 'evidence'
$runtimeRoot = Join-Path $projectRoot '.runtime'
New-Item -ItemType Directory -Path $evidenceRoot,$runtimeRoot -Force | Out-Null
$deploymentPath = Join-Path $evidenceRoot 'deployment.json'
Push-Location $foundryRoot
try {
    if (-not $VerifyOnly) {
        if (Test-Path -LiteralPath $deploymentPath) { throw 'Deployment evidence exists; refusing another deployment.' }
        $pendingPath = Join-Path $runtimeRoot 'deployment-attempt.json'
        if (Test-Path -LiteralPath $pendingPath) { throw 'Prior deployment attempt exists. Reconcile original nonce/transaction before retrying.' }
        if ($env:DEPLOYER_PRIVATE_KEY -notmatch '^(0x)?[a-fA-F0-9]{64}$') { throw 'DEPLOYER_PRIVATE_KEY must be a valid 32-byte hex value.' }
        $deployer = (& cast wallet address --private-key $env:DEPLOYER_PRIVATE_KEY).Trim()
        if ($LASTEXITCODE -ne 0) { throw 'Cannot derive deployer address.' }
        if ($env:OPERATOR_PRIVATE_KEY) {
            if ($env:OPERATOR_PRIVATE_KEY -notmatch '^(0x)?[a-fA-F0-9]{64}$') { throw 'OPERATOR_PRIVATE_KEY format invalid.' }
            $env:OPERATOR_ADDRESS = (& cast wallet address --private-key $env:OPERATOR_PRIVATE_KEY).Trim()
        }
        $operator = if ($env:OPERATOR_ADDRESS) { $env:OPERATOR_ADDRESS } else { $deployer }
        $treasury = if ($env:TREASURY_ADDRESS) { $env:TREASURY_ADDRESS } else { $deployer }
        $payouts = @('DONKEY_PAYOUT','HORSE_PAYOUT','COW_PAYOUT') | ForEach-Object { $v=[Environment]::GetEnvironmentVariable($_,'Process'); if ($v) { $v } else { $deployer } }
        $nonce = Rpc 'eth_getTransactionCount' @($deployer,'pending')
        $balance = Rpc 'eth_getBalance' @($deployer,'latest')
        @{ state='PRE_BROADCAST'; chainId=10143; sender=$deployer; nonce=$nonce; balanceBeforeHex=$balance; startedAt=[DateTimeOffset]::Now.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $pendingPath -Encoding utf8
        $output = & forge script script/DeployNiumaWorks.s.sol:DeployNiumaWorks --rpc-url $rpc --broadcast --slow --gas-estimate-multiplier 110 2>&1
        $forgeExit = $LASTEXITCODE
        $safeOutput = Redact ($output -join "`n")
        Set-Content -LiteralPath (Join-Path $evidenceRoot 'deployment-output.txt') -Value $safeOutput -Encoding utf8
        Write-Output $safeOutput
        if ($forgeExit -ne 0) { throw 'Deployment command failed; original attempt retained, do not automatically rebroadcast.' }
        $broadcast = Get-Content -Raw -LiteralPath 'broadcast/DeployNiumaWorks.s.sol/10143/run-latest.json' | ConvertFrom-Json
        $receipt = $broadcast.receipts[0]
        $address = $receipt.contractAddress
        $hash = $receipt.transactionHash
        if (-not $address -or $receipt.status -notin @('0x1',1)) { throw 'No successful deployment receipt.' }
        $code = Rpc 'eth_getCode' @($address,'latest')
        if (-not $code -or $code -eq '0x') { throw 'Deployment receipt has no runtime bytecode.' }
        $constructorArgs = (& cast abi-encode 'constructor(address,address,address,address[3])' $deployer $operator $treasury ('['+($payouts -join ',')+']')).Trim()
        $deployment = [ordered]@{chainId=10143;contract='contracts/NiumaWorks.sol:NiumaWorks';address=$address;transactionHash=$hash;sender=$deployer;nonceHex=$nonce;blockNumberHex=$receipt.blockNumber;gasUsedHex=$receipt.gasUsed;effectiveGasPriceHex=$receipt.effectiveGasPrice;operator=$operator;treasury=$treasury;payouts=$payouts;constructorArgs=$constructorArgs.Substring(2);explorer=('https://testnet.monadexplorer.com/address/'+$address);verification='PENDING';createdAt=[DateTimeOffset]::Now.ToString('o')}
        $deployment | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $deploymentPath -Encoding utf8
    }
    $deployment = Get-Content -Raw -LiteralPath $deploymentPath | ConvertFrom-Json
    $standardText = (& forge verify-contract $deployment.address 'contracts/NiumaWorks.sol:NiumaWorks' --chain 10143 --show-standard-json-input) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw 'Standard JSON generation failed.' }
    $artifact = Get-Content -Raw -LiteralPath 'out/NiumaWorks.sol/NiumaWorks.json' | ConvertFrom-Json
    $metadata = $artifact.metadata
    if ($metadata -is [string]) { $metadata = $metadata | ConvertFrom-Json }
    $payload = @{chainId=10143;contractAddress=$deployment.address;contractName='contracts/NiumaWorks.sol:NiumaWorks';compilerVersion=('v'+$metadata.compiler.version);standardJsonInput=($standardText | ConvertFrom-Json);foundryMetadata=$metadata;constructorArgs=$deployment.constructorArgs} | ConvertTo-Json -Depth 80 -Compress
    $verification = Invoke-WebRequest -Uri 'https://agents.devnads.com/v1/verify' -Method Post -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($payload)) -TimeoutSec 120 -SkipHttpErrorCheck
    Set-Content -LiteralPath (Join-Path $evidenceRoot 'verification-response.json') -Value $verification.Content -Encoding utf8
    Write-Output "Verification HTTP $($verification.StatusCode)"
    Write-Output $verification.Content
    $verificationResult = $verification.Content | ConvertFrom-Json
    if ($verification.StatusCode -eq 200 -and $verificationResult.success) {
        $deployment.verification = 'VERIFIED'
        $deployment | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $deploymentPath -Encoding utf8
    } else { throw 'Deployment succeeded, but source verification did not succeed. Use -VerifyOnly after investigating.' }
    Write-Output ($deployment | ConvertTo-Json -Depth 5)
} finally { Pop-Location }
