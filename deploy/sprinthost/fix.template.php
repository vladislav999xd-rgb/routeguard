<?php
declare(strict_types=1);

const ROUTEGUARD_FIX_TOKEN = '__FIX_TOKEN__';
const ROUTEGUARD_PAYLOAD_SHA256 = '__PAYLOAD_SHA256__';
const ROUTEGUARD_PAYLOAD = '__PAYLOAD_BASE64__';

header('Content-Type: text/plain; charset=utf-8');
if (PHP_SAPI !== 'cli') {
    $provided = (string)($_GET['token'] ?? '');
    if (!hash_equals(ROUTEGUARD_FIX_TOKEN, $provided)) {
        http_response_code(403);
        exit("RouteGuard FIX: access denied.\n");
    }
}
if (!class_exists('ZipArchive')) {
    exit("RouteGuard FIX: ZipArchive is unavailable.\n");
}
$accountRoot = dirname(__DIR__, 2);
$payload = base64_decode(ROUTEGUARD_PAYLOAD, true);
if ($payload === false || !hash_equals(ROUTEGUARD_PAYLOAD_SHA256, hash('sha256', $payload))) {
    exit("RouteGuard FIX: payload checksum mismatch.\n");
}
$temporary = tempnam(sys_get_temp_dir(), 'routeguard-fix-');
if ($temporary === false || file_put_contents($temporary, $payload, LOCK_EX) === false) {
    exit("RouteGuard FIX: cannot create a temporary file.\n");
}
$backupDirectory = __DIR__ . '/backups';
if (!is_dir($backupDirectory) && !mkdir($backupDirectory, 0700, true) && !is_dir($backupDirectory)) {
    unlink($temporary);
    exit("RouteGuard FIX: cannot create backup directory.\n");
}
$backup = $backupDirectory . '/before-' . gmdate('Ymd-His') . '.zip';
$backupZip = new ZipArchive();
if ($backupZip->open($backup, ZipArchive::CREATE | ZipArchive::OVERWRITE) === true) {
    foreach (['public_html/site.wsgi', 'public_html/.htaccess', 'routeguard_app'] as $relative) {
        $target = $accountRoot . '/' . $relative;
        if (is_file($target)) $backupZip->addFile($target, $relative);
        if (is_dir($target)) {
            $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($target, FilesystemIterator::SKIP_DOTS));
            foreach ($iterator as $file) if ($file->isFile()) $backupZip->addFile($file->getPathname(), $relative . '/' . substr($file->getPathname(), strlen($target) + 1));
        }
    }
    $backupZip->close();
}
$zip = new ZipArchive();
if ($zip->open($temporary) !== true || !$zip->extractTo($accountRoot)) {
    @unlink($temporary);
    exit("RouteGuard FIX: extraction failed. Existing files were backed up to {$backup}.\n");
}
$zip->close();
@unlink($temporary);
echo "RouteGuard FIX: files updated. Backup: {$backup}\n";
echo "Next: install requirements, run migrate and collectstatic, then complete the smoke-check.\n";
