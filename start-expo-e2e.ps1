$ErrorActionPreference = "Stop"

$mobile = $PSScriptRoot
$workspace = Split-Path -Parent $mobile
$metroScript = Join-Path $workspace "scripts\mobile-metro.ps1"
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8000'
$env:EXPO_PUBLIC_E2E_AUTO_LOGIN = '1'
$env:EXPO_PUBLIC_E2E_COMPANY_ID = '1f16d537-5617-4c4b-a944-dafba2bcead9'
$env:EXPO_PUBLIC_E2E_EMAIL = 'installer1@dimax.dev'
$env:EXPO_PUBLIC_E2E_PASSWORD = 'installer12345'

$maxWorkers = 1
if (-not [string]::IsNullOrWhiteSpace($env:DIMAX_METRO_MAX_WORKERS)) {
    $parsedMaxWorkers = 0
    if (-not [int]::TryParse($env:DIMAX_METRO_MAX_WORKERS, [ref]$parsedMaxWorkers) -or $parsedMaxWorkers -lt 1) {
        throw "DIMAX_METRO_MAX_WORKERS must be a positive integer"
    }
    $maxWorkers = $parsedMaxWorkers
}

if (-not (Test-Path -LiteralPath $metroScript -PathType Leaf)) {
    throw "Shared Metro launcher not found at $metroScript"
}

$metroParams = @{
    Action = "start"
    ApiBaseUrl = $env:EXPO_PUBLIC_API_BASE_URL
    Port = 8081
    HostMode = "localhost"
    MaxWorkers = $maxWorkers
}
if ($env:DIMAX_METRO_CLEAR_CACHE -eq '1') {
    $metroParams["ClearCache"] = $true
}

& $metroScript @metroParams
