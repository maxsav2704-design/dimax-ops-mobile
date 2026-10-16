param([switch]$ValidateOnly)

$ErrorActionPreference = "Stop"

$mobile = $PSScriptRoot
$workspace = Split-Path -Parent $mobile
$metroScript = Join-Path $workspace "scripts\mobile-metro.ps1"
$metroPort = 8081

if ($env:NODE_ENV -eq 'production') {
    throw "The device E2E launcher is development-only."
}
$requiredVariables = @(
    'EXPO_PUBLIC_API_BASE_URL',
    'EXPO_PUBLIC_E2E_COMPANY_ID',
    'EXPO_PUBLIC_E2E_EMAIL',
    'EXPO_PUBLIC_E2E_PASSWORD'
)
foreach ($name in $requiredVariables) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
        throw "$name is required. Use an isolated test API and synthetic installer credentials."
    }
}
$apiUri = $null
if (-not [Uri]::TryCreate($env:EXPO_PUBLIC_API_BASE_URL.Trim(), [UriKind]::Absolute, [ref]$apiUri) -or
    $apiUri.Scheme -notin @('http', 'https') -or -not $apiUri.IsLoopback -or
    $apiUri.UserInfo -or $apiUri.Query -or $apiUri.Fragment) {
    throw "Device E2E requires an explicit loopback HTTP(S) API URL for ADB reverse, without credentials, query or fragment."
}
$companyId = [guid]::Empty
if (-not [guid]::TryParse($env:EXPO_PUBLIC_E2E_COMPANY_ID.Trim(), [ref]$companyId)) {
    throw "EXPO_PUBLIC_E2E_COMPANY_ID must be a test company UUID."
}
$apiPort = $apiUri.Port
if ($apiPort -eq $metroPort) {
    throw "The test API and Metro must use different ports."
}

if ($ValidateOnly) {
    [pscustomobject]@{
        ApiBaseUrl = $apiUri.AbsoluteUri.TrimEnd('/')
        ApiPort = $apiPort
        MetroPort = $metroPort
    } | ConvertTo-Json
    return
}
$env:EXPO_PUBLIC_API_BASE_URL = $apiUri.AbsoluteUri.TrimEnd('/')
$env:EXPO_PUBLIC_E2E_AUTO_LOGIN = '1'

function Resolve-AdbPath {
    $candidates = @()
    $adbCommand = Get-Command adb -ErrorAction SilentlyContinue
    if ($adbCommand) {
        $candidates += $adbCommand.Source
    }
    if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_HOME)) {
        $candidates += Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
    }
    if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_SDK_ROOT)) {
        $candidates += Join-Path $env:ANDROID_SDK_ROOT "platform-tools\adb.exe"
    }
    $candidates += Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }
    throw "Android platform-tools were not found. Install adb before starting device E2E."
}

function Resolve-AndroidSerial {
    param([Parameter(Mandatory = $true)][string]$AdbPath)

    $connected = @(
        & $AdbPath devices |
            Select-Object -Skip 1 |
            Where-Object { $_ -match "\sdevice\s*$" } |
            ForEach-Object { ($_ -split "\s+")[0] } |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
    if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_SERIAL)) {
        if ($env:ANDROID_SERIAL -notin $connected) {
            throw "ANDROID_SERIAL '$($env:ANDROID_SERIAL)' is not connected or authorized."
        }
        return $env:ANDROID_SERIAL
    }
    if ($connected.Count -ne 1) {
        throw "Connect exactly one authorized Android device or set ANDROID_SERIAL. Found: $($connected.Count)."
    }
    return $connected[0]
}

function Enable-AdbReverse {
    param(
        [Parameter(Mandatory = $true)][string]$AdbPath,
        [Parameter(Mandatory = $true)][string]$Serial,
        [Parameter(Mandatory = $true)][int[]]$Ports
    )

    foreach ($port in $Ports) {
        & $AdbPath -s $Serial reverse "tcp:$port" "tcp:$port" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to configure adb reverse for tcp:$port on $Serial."
        }
    }

    $reverseList = (& $AdbPath -s $Serial reverse --list | Out-String)
    foreach ($port in $Ports) {
        if ($reverseList -notmatch "tcp:$port\s+tcp:$port") {
            throw "adb reverse verification failed for tcp:$port on $Serial."
        }
    }
}

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

$adbPath = Resolve-AdbPath
$androidSerial = Resolve-AndroidSerial -AdbPath $adbPath
Enable-AdbReverse `
    -AdbPath $adbPath `
    -Serial $androidSerial `
    -Ports @($apiPort, $metroPort)
Write-Host "Android connection ready: $androidSerial (API $apiPort, Metro $metroPort)"

$metroParams = @{
    Action = "start"
    ApiBaseUrl = $env:EXPO_PUBLIC_API_BASE_URL
    Port = $metroPort
    HostMode = "localhost"
    MaxWorkers = $maxWorkers
}
if ($env:DIMAX_METRO_CLEAR_CACHE -eq '1') {
    $metroParams["ClearCache"] = $true
}

& $metroScript @metroParams
