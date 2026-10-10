param(
    [string]$DatabaseName,
    [string]$DatabaseUser,
    [string]$DatabasePassword,
    [string]$DatabaseHost = "localhost",
    [string]$Domain = "irbitdp.ru",
    [switch]$ReuseExistingEnvironment
)

$ErrorActionPreference = "Stop"
function New-RouteGuardRandomBytes([int]$Count) {
    $bytes = New-Object byte[] $Count
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return $bytes
}
function ConvertTo-RouteGuardHex([byte[]]$Bytes) {
    return -join ($Bytes | ForEach-Object { $_.ToString("x2") })
}
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$releaseRoot = Join-Path $projectRoot "release"
$stageRoot = Join-Path $releaseRoot "staging"
$payloadRoot = Join-Path $releaseRoot "payload"
$archivePath = Join-Path $projectRoot "routeguard-v2-sprinthost.zip"
$previousEnvironmentPath = Join-Path $stageRoot "routeguard_app\.env"
$reusedEnvironment = $null

if ($ReuseExistingEnvironment) {
    if (-not (Test-Path -LiteralPath $previousEnvironmentPath -PathType Leaf)) {
        throw "Cannot reuse database settings: previous release environment was not found."
    }
    $reusedEnvironment = [IO.File]::ReadAllText($previousEnvironmentPath, [Text.Encoding]::UTF8)
    if (-not $reusedEnvironment.Contains("DATABASE_URL=")) {
        throw "Cannot reuse database settings: previous environment is invalid."
    }
} elseif ([string]::IsNullOrWhiteSpace($DatabaseName) -or [string]::IsNullOrWhiteSpace($DatabaseUser) -or [string]::IsNullOrWhiteSpace($DatabasePassword)) {
    throw "DatabaseName, DatabaseUser and DatabasePassword are required unless ReuseExistingEnvironment is specified."
}

foreach ($candidate in @($stageRoot, $payloadRoot)) {
    $absolute = [IO.Path]::GetFullPath($candidate)
    if (-not $absolute.StartsWith([IO.Path]::GetFullPath($releaseRoot), [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe release path: $absolute"
    }
    if (Test-Path -LiteralPath $absolute) { Remove-Item -LiteralPath $absolute -Recurse -Force }
}
New-Item -ItemType Directory -Path $stageRoot, $payloadRoot -Force | Out-Null

$appRoot = Join-Path $stageRoot "routeguard_app"
$publicRoot = Join-Path $stageRoot "public_html"
New-Item -ItemType Directory -Path $appRoot, $publicRoot -Force | Out-Null

foreach ($directory in @("core", "routeguard", "backend_static")) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination $appRoot -Recurse -Force
}
$releaseScreenshots = Join-Path $appRoot "screenshots"
New-Item -ItemType Directory -Path $releaseScreenshots -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $projectRoot "screenshots") -Filter "graphite-sage-*.png" -File | Copy-Item -Destination $releaseScreenshots -Force
foreach ($file in @("manage.py", "requirements.txt", "requirements-dev.txt", "README.md", "THIRD_PARTY_NOTICES.md")) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $appRoot -Force
}
Copy-Item -LiteralPath (Join-Path $projectRoot "docs") -Destination $appRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "deploy\sprinthost\public_html\.htaccess") -Destination $publicRoot -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "deploy\sprinthost\public_html\site.wsgi") -Destination $publicRoot -Force
New-Item -ItemType Directory -Path (Join-Path $publicRoot "static") -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot "backend_static\app") -Destination (Join-Path $publicRoot "static") -Recurse -Force

Get-ChildItem -LiteralPath $appRoot -Directory -Recurse -Force | Where-Object Name -eq "__pycache__" | ForEach-Object {
    if ($_.FullName.StartsWith($appRoot, [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
}

$random = New-RouteGuardRandomBytes 48
$secretKey = [Convert]::ToBase64String($random).Replace("+", "-").Replace("/", "_").TrimEnd("=")
$fixToken = ConvertTo-RouteGuardHex (New-RouteGuardRandomBytes 24)
$envText = $reusedEnvironment
if ($null -eq $envText) {
    $encodedPassword = [Uri]::EscapeDataString($DatabasePassword)
    $envText = @"
DJANGO_SECRET_KEY=$secretKey
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=$Domain,www.$Domain
DJANGO_CSRF_TRUSTED_ORIGINS=https://$Domain,https://www.$Domain
DATABASE_URL=postgresql://${DatabaseUser}:${encodedPassword}@${DatabaseHost}:5432/${DatabaseName}
ROUTEGUARD_TIME_ZONE=Asia/Yekaterinburg
ROUTEGUARD_DEMO_TTL_HOURS=168
DJANGO_STATIC_ROOT=../public_html/static
"@
}
[IO.File]::WriteAllText((Join-Path $appRoot ".env"), $envText, [Text.UTF8Encoding]::new($false))

Copy-Item -LiteralPath $appRoot -Destination $payloadRoot -Recurse -Force
Copy-Item -LiteralPath $publicRoot -Destination $payloadRoot -Recurse -Force
$payloadZip = Join-Path $releaseRoot "payload.zip"
if (Test-Path -LiteralPath $payloadZip) { Remove-Item -LiteralPath $payloadZip -Force }
Compress-Archive -Path (Join-Path $payloadRoot "*") -DestinationPath $payloadZip -CompressionLevel Optimal
$payloadBytes = [IO.File]::ReadAllBytes($payloadZip)
$payloadBase64 = [Convert]::ToBase64String($payloadBytes)
$payloadHash = (Get-FileHash -LiteralPath $payloadZip -Algorithm SHA256).Hash.ToLowerInvariant()
$template = [IO.File]::ReadAllText((Join-Path $projectRoot "deploy\sprinthost\fix.template.php"), [Text.Encoding]::UTF8)
$environmentBase64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($envText))
$fixer = $template.Replace("__FIX_TOKEN__", $fixToken).Replace("__PAYLOAD_SHA256__", $payloadHash).Replace("__PAYLOAD_BASE64__", $payloadBase64).Replace("__ENV_BASE64__", $environmentBase64)
$fixDirectory = Join-Path $publicRoot "FIX"
New-Item -ItemType Directory -Path $fixDirectory -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $fixDirectory "fix.php"), $fixer, [Text.UTF8Encoding]::new($false))
$localFixDirectory = Join-Path $projectRoot "FIX"
New-Item -ItemType Directory -Path $localFixDirectory -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $localFixDirectory "fix.php"), $fixer, [Text.UTF8Encoding]::new($false))

if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $archivePath -CompressionLevel Optimal
[IO.File]::WriteAllText((Join-Path $releaseRoot "FIX-TOKEN.txt"), "RouteGuard FIX token: $fixToken`r`n", [Text.UTF8Encoding]::new($false))

$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "Archive: $archivePath"
Write-Host "One-file installer: $(Join-Path $projectRoot 'FIX\fix.php')"
Write-Host "SHA256: $archiveHash"
Write-Host "FIX token: $fixToken"
