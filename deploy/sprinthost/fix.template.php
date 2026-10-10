<?php
declare(strict_types=1);

const ROUTEGUARD_FIX_TOKEN = '__FIX_TOKEN__';
const ROUTEGUARD_PAYLOAD_SHA256 = '__PAYLOAD_SHA256__';
const ROUTEGUARD_PAYLOAD = '__PAYLOAD_BASE64__';
const ROUTEGUARD_ENVIRONMENT_BASE64 = '__ENV_BASE64__';

header('Content-Type: text/plain; charset=utf-8');
@set_time_limit(0);
@ignore_user_abort(true);
umask(0077);

function routeguard_fail(string $message, int $status = 500): void
{
    http_response_code($status);
    $output = "RouteGuard FIX: {$message}\n";
    if (PHP_SAPI === 'cli' && defined('STDERR')) {
        fwrite(STDERR, $output);
    } else {
        echo $output;
    }
    exit(1);
}

function routeguard_run(string $label, string $command, string $workingDirectory, bool $required = true): bool
{
    echo "\n[RouteGuard] {$label}\n";
    $fullCommand = 'cd ' . escapeshellarg($workingDirectory) . ' && ' . $command . ' 2>&1';
    $status = 1;
    passthru($fullCommand, $status);
    if ($status !== 0 && $required) routeguard_fail("step failed: {$label} (exit {$status})");
    return $status === 0;
}

function routeguard_python(): string
{
    $configured = getenv('ROUTEGUARD_PYTHON');
    $candidates = array_filter([
        $configured === false ? null : $configured,
        '/usr/local/bin/python3.11',
        '/usr/bin/python3.11',
    ]);
    foreach ($candidates as $candidate) {
        if (is_file($candidate) && is_executable($candidate)) return $candidate;
    }
    if (function_exists('exec')) {
        foreach (['python3.11', 'python3'] as $binary) {
            $lines = [];
            $status = 1;
            exec('command -v ' . escapeshellarg($binary) . ' 2>/dev/null', $lines, $status);
            if ($status === 0 && isset($lines[0]) && is_executable(trim($lines[0]))) return trim($lines[0]);
        }
    }
    routeguard_fail('Python 3.11 not found. Select Python 3.11 for the domain in the hosting panel.');
}

function routeguard_clear_public(string $publicRoot): void
{
    if (!is_dir($publicRoot)) return;
    $preserved = [$publicRoot . '/FIX', $publicRoot . '/.well-known'];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($publicRoot, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($iterator as $item) {
        $path = $item->getPathname();
        $normalizedPath = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $path);
        $keep = false;
        foreach ($preserved as $prefix) {
            $normalizedPrefix = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $prefix);
            if ($normalizedPath === $normalizedPrefix || strpos($normalizedPath, $normalizedPrefix . DIRECTORY_SEPARATOR) === 0) {
                $keep = true;
                break;
            }
        }
        if ($keep) continue;
        if ($item->isDir() && !$item->isLink()) {
            @rmdir($path);
        } else {
            @unlink($path);
        }
    }
}

function routeguard_extract_payload(ZipArchive $zip, string $destination): void
{
    for ($index = 0; $index < $zip->numFiles; $index++) {
        $entry = $zip->getNameIndex($index);
        if ($entry === false) routeguard_fail("cannot read payload entry {$index}.");
        $normalized = str_replace('\\', '/', $entry);
        if (
            $normalized === '' ||
            $normalized[0] === '/' ||
            strpos($normalized, "\0") !== false ||
            preg_match('#(^|/)\.\.(/|$)#', $normalized) === 1
        ) {
            routeguard_fail("unsafe payload entry: {$entry}");
        }

        $relative = rtrim($normalized, '/');
        if ($relative === '') continue;
        $target = $destination . '/' . $relative;
        if (substr($normalized, -1) === '/') {
            if (!is_dir($target) && !mkdir($target, 0755, true) && !is_dir($target)) {
                routeguard_fail("cannot create payload directory: {$relative}");
            }
            continue;
        }

        $parent = dirname($target);
        if (!is_dir($parent) && !mkdir($parent, 0755, true) && !is_dir($parent)) {
            routeguard_fail("cannot create payload parent: {$relative}");
        }
        $input = $zip->getStream($entry);
        $output = fopen($target, 'wb');
        if ($input === false || $output === false) {
            if (is_resource($input)) fclose($input);
            if (is_resource($output)) fclose($output);
            routeguard_fail("cannot open payload entry: {$relative}");
        }
        $copied = stream_copy_to_stream($input, $output);
        fclose($input);
        fclose($output);
        if ($copied === false) routeguard_fail("cannot write payload entry: {$relative}");
        @chmod($target, 0644);
    }
}

if (PHP_SAPI !== 'cli') {
    $provided = (string)($_GET['token'] ?? '');
    if (!hash_equals(ROUTEGUARD_FIX_TOKEN, $provided)) routeguard_fail('access denied.', 403);
}
if (!class_exists('ZipArchive')) routeguard_fail('ZipArchive is unavailable.');
if (!function_exists('passthru')) routeguard_fail('passthru is disabled; run the installer through SSH support.');

@file_put_contents(
    __DIR__ . '/.htaccess',
    "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n",
    LOCK_EX
);

$accountRoot = dirname(__DIR__, 2);
$projectRoot = $accountRoot . '/routeguard_app';
$publicRoot = $accountRoot . '/public_html';
$environmentPath = $projectRoot . '/.env';
$existingEnvironment = is_file($environmentPath) ? file_get_contents($environmentPath) : null;

$payload = base64_decode(ROUTEGUARD_PAYLOAD, true);
if ($payload === false || !hash_equals(ROUTEGUARD_PAYLOAD_SHA256, hash('sha256', $payload))) {
    routeguard_fail('payload checksum mismatch.');
}
$temporary = tempnam(sys_get_temp_dir(), 'routeguard-fix-');
if ($temporary === false || file_put_contents($temporary, $payload, LOCK_EX) === false) {
    routeguard_fail('cannot create a temporary payload file.');
}

$backupDirectory = __DIR__ . '/backups';
if (!is_dir($backupDirectory) && !mkdir($backupDirectory, 0700, true) && !is_dir($backupDirectory)) {
    @unlink($temporary);
    routeguard_fail('cannot create backup directory.');
}
$backup = $backupDirectory . '/before-' . gmdate('Ymd-His') . '.zip';
$backupZip = new ZipArchive();
if ($backupZip->open($backup, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    @unlink($temporary);
    routeguard_fail('cannot create a backup archive.');
}
foreach (['public_html', 'routeguard_app'] as $relative) {
    $target = $accountRoot . '/' . $relative;
    if (!is_dir($target)) continue;
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($target, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
    );
    foreach ($iterator as $file) {
        if (!$file->isFile()) continue;
        $path = $file->getPathname();
        if (strpos($path, $backupDirectory . DIRECTORY_SEPARATOR) === 0) continue;
        if (realpath($path) === realpath(__FILE__)) continue;
        $archiveName = $relative . '/' . substr($path, strlen($target) + 1);
        $backupZip->addFile($path, $archiveName);
    }
}
$backupZip->close();
echo "RouteGuard FIX: backup created: {$backup}\n";
routeguard_clear_public($publicRoot);
echo "RouteGuard FIX: previous public files archived and cleared.\n";

$zip = new ZipArchive();
if ($zip->open($temporary) !== true) {
    @unlink($temporary);
    routeguard_fail("cannot open the payload. Restore the backup: {$backup}");
}
routeguard_extract_payload($zip, $accountRoot);
$zip->close();
@unlink($temporary);

$requiredFiles = [
    $projectRoot . '/requirements.txt',
    $projectRoot . '/manage.py',
    $projectRoot . '/routeguard/settings.py',
    $publicRoot . '/site.wsgi',
];
foreach ($requiredFiles as $requiredFile) {
    if (!is_file($requiredFile)) {
        routeguard_fail('required file was not extracted: ' . $requiredFile . ". Restore the backup: {$backup}");
    }
}
@chmod($publicRoot . '/site.wsgi', 0755);
echo "RouteGuard FIX: payload files extracted and verified.\n";

if ($existingEnvironment !== null) {
    file_put_contents($environmentPath, $existingEnvironment, LOCK_EX);
    @chmod($environmentPath, 0600);
    echo "RouteGuard FIX: existing database settings preserved.\n";
}
if (!is_file($environmentPath)) {
    $embeddedEnvironment = base64_decode(ROUTEGUARD_ENVIRONMENT_BASE64, true);
    if ($embeddedEnvironment === false || $embeddedEnvironment === '') {
        routeguard_fail('embedded environment settings are invalid.');
    }
    if (!is_dir($projectRoot) && !mkdir($projectRoot, 0700, true) && !is_dir($projectRoot)) {
        routeguard_fail('cannot create routeguard_app for environment settings.');
    }
    if (file_put_contents($environmentPath, $embeddedEnvironment, LOCK_EX) === false) {
        routeguard_fail('cannot restore routeguard_app/.env from the installer.');
    }
    @chmod($environmentPath, 0600);
    echo "RouteGuard FIX: embedded database settings restored.\n";
}
if (!is_file($environmentPath)) routeguard_fail('routeguard_app/.env is missing. Rebuild the private release with database credentials.');
if (getenv('ROUTEGUARD_SKIP_SETUP') === '1') {
    echo "RouteGuard FIX: setup skipped by ROUTEGUARD_SKIP_SETUP.\n";
    exit(0);
}

$python = routeguard_python();
$venv = $projectRoot . '/.venv';
$venvPython = $venv . '/bin/python';
if (!is_file($venvPython)) {
    $created = routeguard_run(
        'Creating Python virtual environment',
        escapeshellarg($python) . ' -m venv ' . escapeshellarg($venv),
        $projectRoot,
        false
    );
    if (!$created) {
        routeguard_run(
            'Installing virtualenv for the hosting account',
            escapeshellarg($python) . ' -m pip install --user --disable-pip-version-check virtualenv',
            $projectRoot
        );
        routeguard_run(
            'Creating fallback virtual environment',
            escapeshellarg($python) . ' -m virtualenv ' . escapeshellarg($venv),
            $projectRoot
        );
    }
}
if (!is_file($venvPython)) routeguard_fail('virtual environment was not created.');

$pythonCommand = escapeshellarg($venvPython);
routeguard_run(
    'Installing application dependencies',
    $pythonCommand . ' -m pip install --no-input --disable-pip-version-check -r requirements.txt',
    $projectRoot
);
routeguard_run('Applying database migrations', $pythonCommand . ' manage.py migrate --noinput', $projectRoot);
routeguard_run('Collecting static files', $pythonCommand . ' manage.py collectstatic --noinput', $projectRoot);
routeguard_run('Creating the owner account if needed', $pythonCommand . ' manage.py bootstrap_deployment', $projectRoot);
routeguard_run('Running production checks', $pythonCommand . ' manage.py check --deploy', $projectRoot);
@touch($publicRoot . '/site.wsgi');

echo "\nRouteGuard FIX: installation completed successfully.\n";
echo "Backup: {$backup}\n";
echo "Owner credentials: {$projectRoot}/OWNER-CREDENTIALS.txt\n";
echo "Only one hosting-panel action remains: select Python 3.11 / uWSGI for the domain.\n";
echo "Then open /api/health/ and the site home page.\n";
