param(
    [Parameter(Mandatory = $true)][string]$DatabaseName,
    [Parameter(Mandatory = $true)][string]$DatabaseUser,
    [Parameter(Mandatory = $true)][string]$DatabasePassword,
    [string]$DatabaseHost = "localhost",
    [string]$Domain = "irbitdp.ru"
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
[IO.File]::WriteAllText((Join-Path $appRoot ".env"), $envText, [Text.UTF8Encoding]::new($false))

Copy-Item -LiteralPath $appRoot -Destination $payloadRoot -Recurse -Force
Copy-Item -LiteralPath $publicRoot -Destination $payloadRoot -Recurse -Force
$payloadEnvironment = Join-Path $payloadRoot "routeguard_app\.env"
if (Test-Path -LiteralPath $payloadEnvironment) { Remove-Item -LiteralPath $payloadEnvironment -Force }
$payloadZip = Join-Path $releaseRoot "payload.zip"
if (Test-Path -LiteralPath $payloadZip) { Remove-Item -LiteralPath $payloadZip -Force }
Compress-Archive -Path (Join-Path $payloadRoot "*") -DestinationPath $payloadZip -CompressionLevel Optimal
$payloadBytes = [IO.File]::ReadAllBytes($payloadZip)
$payloadBase64 = [Convert]::ToBase64String($payloadBytes)
$payloadHash = (Get-FileHash -LiteralPath $payloadZip -Algorithm SHA256).Hash.ToLowerInvariant()
$template = [IO.File]::ReadAllText((Join-Path $projectRoot "deploy\sprinthost\fix.template.php"), [Text.Encoding]::UTF8)
$fixer = $template.Replace("__FIX_TOKEN__", $fixToken).Replace("__PAYLOAD_SHA256__", $payloadHash).Replace("__PAYLOAD_BASE64__", $payloadBase64)
$fixDirectory = Join-Path $publicRoot "FIX"
New-Item -ItemType Directory -Path $fixDirectory -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $fixDirectory "fix.php"), $fixer, [Text.UTF8Encoding]::new($false))

if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $archivePath -CompressionLevel Optimal
[IO.File]::WriteAllText((Join-Path $releaseRoot "FIX-TOKEN.txt"), "RouteGuard FIX token: $fixToken`r`n", [Text.UTF8Encoding]::new($false))

$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "Archive: $archivePath"
Write-Host "SHA256: $archiveHash"
Write-Host "FIX token: $fixToken"
