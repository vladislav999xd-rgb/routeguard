<?php
declare(strict_types=1);

$config = require dirname(__DIR__) . '/config.php';
$checks = [
    trim((string)($config['db']['host'] ?? '')) !== '',
    trim((string)($config['db']['name'] ?? '')) !== '',
    trim((string)($config['db']['user'] ?? '')) !== '',
    strlen((string)($config['db']['password'] ?? '')) >= 12,
    strlen((string)($config['install_token'] ?? '')) >= 48,
    strlen((string)($config['maintenance_token'] ?? '')) >= 48,
];

$_SERVER['REQUEST_METHOD'] = 'GET';
ob_start();
require dirname(__DIR__) . '/install.php';
$html = ob_get_clean();
$checks[] = str_contains($html, 'База данных уже настроена');
$checks[] = !str_contains($html, (string)$config['db']['password']);

if (in_array(false, $checks, true)) {
    fwrite(STDERR, "personal_config_check_failed\n");
    exit(1);
}
echo "personal_config_check_ok\n";
