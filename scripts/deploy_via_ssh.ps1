[CmdletBinding()]
param(
    [string]$SshUser = "a1239227",
    [string]$SshHost = "irbitdp.ru",
    [string]$Domain = "irbitdp.ru",
    [int]$Port = 22,
    [string]$KeyPath = (Join-Path $env:USERPROFILE ".ssh\routeguard_sprinthost_ed25519")
)

$ErrorActionPreference = "Stop"

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command,
        [Parameter(Mandatory = $true)]
        [string]$FailureMessage
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$FailureMessage (код $LASTEXITCODE)."
    }
}

if ($SshUser -notmatch '^[a-zA-Z0-9._-]+$') {
    throw "Некорректный SSH-логин."
}
if ($SshHost -notmatch '^[a-zA-Z0-9.-]+$') {
    throw "Некорректный SSH-хост."
}
if ($Domain -notmatch '^[a-zA-Z0-9.-]+$') {
    throw "Некорректный домен."
}

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$fixPath = Join-Path $projectRoot "FIX\fix.php"
if (-not (Test-Path -LiteralPath $fixPath -PathType Leaf)) {
    throw "Не найден установщик: $fixPath. Сначала запустите scripts\build_release.ps1."
}

$ssh = (Get-Command ssh.exe -ErrorAction Stop).Source
$scp = (Get-Command scp.exe -ErrorAction Stop).Source
$sshKeygen = (Get-Command ssh-keygen.exe -ErrorAction Stop).Source

$keyDirectory = Split-Path -Parent $KeyPath
$registrationMarker = "$KeyPath.registered-$SshUser-$SshHost"
if (-not (Test-Path -LiteralPath $keyDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
    if (Test-Path -LiteralPath $registrationMarker -PathType Leaf) {
        Remove-Item -LiteralPath $registrationMarker -Force
    }
    Write-Host "Создаю отдельный SSH-ключ RouteGuard..." -ForegroundColor Cyan
    Invoke-NativeCommand -FailureMessage "Не удалось создать SSH-ключ" -Command {
        & $sshKeygen -q -t ed25519 -f $KeyPath -N '""' -C "routeguard-deploy"
    }
}

$publicKeyPath = "$KeyPath.pub"
if (-not (Test-Path -LiteralPath $publicKeyPath -PathType Leaf)) {
    throw "Не найден открытый SSH-ключ: $publicKeyPath."
}

$connection = "${SshUser}@${SshHost}"
$commonSshArguments = @(
    "-i", $KeyPath,
    "-p", $Port,
    "-o", "IdentitiesOnly=yes",
    "-o", "StrictHostKeyChecking=accept-new"
)

Write-Host "Проверяю SSH-доступ к $connection..." -ForegroundColor Cyan
& $ssh @commonSshArguments -o BatchMode=yes -o ConnectTimeout=15 $connection "true" 2>$null
$passwordlessLoginWorks = $LASTEXITCODE -eq 0

if (-not $passwordlessLoginWorks -and -not (Test-Path -LiteralPath $registrationMarker -PathType Leaf)) {
    Write-Host "Первичная настройка: введите пароль SprintHost, затем код подтверждения." -ForegroundColor Yellow
    Write-Host "Пароль при вводе не отображается — это нормально." -ForegroundColor DarkGray
    $installKeyCommand = 'umask 077; mkdir -p "$HOME/.ssh"; touch "$HOME/.ssh/authorized_keys"; key=$(cat); grep -qxF "$key" "$HOME/.ssh/authorized_keys" || printf "%s\n" "$key" >> "$HOME/.ssh/authorized_keys"; chmod 700 "$HOME/.ssh"; chmod 600 "$HOME/.ssh/authorized_keys"'
    Get-Content -LiteralPath $publicKeyPath -Raw | & $ssh -p $Port -o StrictHostKeyChecking=accept-new -o "PreferredAuthentications=keyboard-interactive,password" -o PubkeyAuthentication=no $connection $installKeyCommand
    if ($LASTEXITCODE -ne 0) {
        throw "Не удалось добавить SSH-ключ. Проверьте логин, пароль и код подтверждения SprintHost."
    }
    Set-Content -LiteralPath $registrationMarker -Value ([DateTime]::UtcNow.ToString("O")) -Encoding ASCII

    & $ssh @commonSshArguments -o BatchMode=yes -o ConnectTimeout=15 $connection "true" 2>$null
    $passwordlessLoginWorks = $LASTEXITCODE -eq 0
}

$remoteFixDirectory = "domains/$Domain/public_html/FIX"
$remoteFixPath = "$remoteFixDirectory/fix.php"
$remoteUploadPath = "domains/$Domain/public_html/.routeguard-fix-upload.php"
$authenticationArguments = @()

if ($passwordlessLoginWorks) {
    $authenticationArguments = @("-o", "BatchMode=yes")
} else {
    Write-Host "SprintHost требует подтверждение SSH-входа." -ForegroundColor Yellow
    Write-Host "Во время загрузки и запуска введите запрошенный код подтверждения." -ForegroundColor Yellow
}

Write-Host "Загружаю единый установщик (архив отдельно не нужен)..." -ForegroundColor Cyan
Invoke-NativeCommand -FailureMessage "Не удалось загрузить FIX/fix.php" -Command {
    & $scp -i $KeyPath -P $Port -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new @authenticationArguments $fixPath "${connection}:$remoteUploadPath"
}

Write-Host "Запускаю автоматическую установку RouteGuard..." -ForegroundColor Green
Invoke-NativeCommand -FailureMessage "Установщик RouteGuard завершился с ошибкой" -Command {
    & $ssh @commonSshArguments @authenticationArguments -t $connection "umask 077; mkdir -p '$remoteFixDirectory'; mv -f '$remoteUploadPath' '$remoteFixPath'; chmod 600 '$remoteFixPath'; php '$remoteFixPath'"
}

Write-Host "Проверяю адрес приложения..." -ForegroundColor Cyan
try {
    $health = Invoke-WebRequest -Uri "https://$Domain/api/health/" -UseBasicParsing -TimeoutSec 20
    if ($health.StatusCode -ge 200 -and $health.StatusCode -lt 400) {
        Write-Host "Готово: https://$Domain/" -ForegroundColor Green
    }
} catch {
    Write-Host "Файлы установлены. Если сайт пока не открылся, выберите Python 3.11/uWSGI в панели SprintHost." -ForegroundColor Yellow
    Write-Host "После этого проверьте: https://$Domain/api/health/" -ForegroundColor Yellow
}

Write-Host "Данные владельца: ~/domains/$Domain/routeguard_app/OWNER-CREDENTIALS.txt" -ForegroundColor Green
