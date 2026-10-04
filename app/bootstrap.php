<?php
declare(strict_types=1);

define('RG_ROOT', dirname(__DIR__));
date_default_timezone_set('Asia/Yekaterinburg');

function rg_config(): array
{
    static $config;
    if ($config !== null) {
        return $config;
    }
    if (getenv('RG_DEV') === '1') {
        return $config = [
            'app_name' => 'Маршруты пациентов',
            'base_url' => '',
            'timezone' => 'Asia/Yekaterinburg',
            'db' => ['dsn' => 'sqlite:' . RG_ROOT . '/storage/routeguard-dev.sqlite', 'user' => null, 'password' => null, 'prefix' => 'rg_'],
            'demo_ttl_days' => 7,
            'demo_limit' => 1000,
            'installed' => true,
        ];
    }
    $path = getenv('ROUTEGUARD_CONFIG') ?: RG_ROOT . '/config.php';
    if (!is_file($path)) {
        return $config = ['installed' => false, 'base_url' => '', 'timezone' => 'Asia/Yekaterinburg'];
    }
    $loaded = require $path;
    return $config = is_array($loaded) ? $loaded : ['installed' => false];
}

$rgConfig = rg_config();
date_default_timezone_set($rgConfig['timezone'] ?? 'Asia/Yekaterinburg');

if (session_status() !== PHP_SESSION_ACTIVE) {
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_name('routeguard_session');
    session_set_cookie_params(['httponly' => true, 'secure' => $secure, 'samesite' => 'Lax', 'path' => '/']);
    session_start();
}

function rg_db(): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $cfg = rg_config();
    if (empty($cfg['installed']) && getenv('RG_DEV') !== '1') {
        throw new RuntimeException('Приложение ещё не установлено.');
    }
    $db = $cfg['db'] ?? [];
    if (!empty($db['dsn'])) {
        $dsn = $db['dsn'];
    } else {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $db['host'] ?? 'localhost', $db['port'] ?? 3306, $db['name'] ?? '');
    }
    $pdo = new PDO($dsn, $db['user'] ?? null, $db['password'] ?? null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    if (str_starts_with($dsn, 'sqlite:')) {
        $pdo->exec('PRAGMA foreign_keys = ON');
        require_once RG_ROOT . '/app/DemoSeeder.php';
        DemoSeeder::installSqlite($pdo, rg_prefix());
    }
    return $pdo;
}

function rg_prefix(): string
{
    $prefix = (string)(rg_config()['db']['prefix'] ?? 'rg_');
    if (!preg_match('/^[a-zA-Z][a-zA-Z0-9_]{1,20}$/', $prefix)) {
        throw new RuntimeException('Недопустимый префикс таблиц.');
    }
    return $prefix;
}

function rg_table(string $name): string
{
    if (!preg_match('/^[a-z_]+$/', $name)) {
        throw new InvalidArgumentException('Недопустимое имя таблицы.');
    }
    return rg_prefix() . $name;
}

function rg_e(mixed $value): string
{
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function rg_url(string $path = ''): string
{
    $base = rtrim((string)(rg_config()['base_url'] ?? ''), '/');
    return $base . '/' . ltrim($path, '/');
}

function rg_csrf(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
    }
    return $_SESSION['csrf'];
}

function rg_verify_csrf(): void
{
    $token = (string)($_POST['csrf'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (!hash_equals((string)($_SESSION['csrf'] ?? ''), $token)) {
        throw new RuntimeException('Сессия формы устарела. Обновите страницу и повторите действие.');
    }
}

function rg_user(): ?array
{
    return isset($_SESSION['user']) && is_array($_SESSION['user']) ? $_SESSION['user'] : null;
}

function rg_workspace_id(): ?string
{
    return isset($_SESSION['workspace_id']) ? (string)$_SESSION['workspace_id'] : null;
}

function rg_require_auth(): void
{
    if (!rg_user() || !rg_workspace_id()) {
        header('Location: ' . rg_url('index.php?page=login'));
        exit;
    }
}

function rg_demo_date(): string
{
    $stmt = rg_db()->prepare('SELECT demo_date FROM ' . rg_table('demo_workspaces') . ' WHERE id = ? AND expires_at > ?');
    $stmt->execute([rg_workspace_id(), date('Y-m-d H:i:s')]);
    $date = $stmt->fetchColumn();
    if (!$date) {
        $_SESSION = [];
        throw new RuntimeException('Демосессия завершилась. Откройте новую.');
    }
    return (string)$date;
}

function rg_flash(string $type, string $message): void
{
    $_SESSION['flash'][] = ['type' => $type, 'message' => $message];
}

function rg_take_flashes(): array
{
    $items = $_SESSION['flash'] ?? [];
    unset($_SESSION['flash']);
    return is_array($items) ? $items : [];
}

function rg_redirect(string $target): never
{
    header('Location: ' . rg_url($target));
    exit;
}

function rg_age(string $birthDate, ?string $at = null): int
{
    return (new DateTimeImmutable($birthDate))->diff(new DateTimeImmutable($at ?: 'today'))->y;
}

function rg_status_label(string $status): string
{
    return ['draft' => 'Черновик', 'active' => 'В работе', 'completed' => 'Завершён', 'pending' => 'Ожидает', 'scheduled' => 'Запись', 'cancelled' => 'Отменена', 'missed' => 'Неявка'][$status] ?? $status;
}

function rg_attention_label(?string $reason): string
{
    if ($reason === null || $reason === '') return 'Нет';
    return ['no_assignee' => 'Нет ответственного', 'no_slot' => 'Нет слота', 'cancelled' => 'Отмена', 'missed' => 'Неявка', 'no_document' => 'Нет документа', 'no_confirmation' => 'Нет подтверждения', 'due_soon' => 'Приближается срок', 'overdue' => 'Срок нарушен'][$reason] ?? $reason;
}

function rg_log(PDO $pdo, string $workspaceId, ?int $routeId, string $type, string $message, string $author): void
{
    $stmt = $pdo->prepare('INSERT INTO ' . rg_table('event_log') . ' (workspace_id, route_id, event_type, message, author, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([$workspaceId, $routeId, $type, $message, $author, date('Y-m-d H:i:s')]);
}

function rg_recalculate_route(PDO $pdo, int $routeId, string $workspaceId): void
{
    $steps = $pdo->prepare('SELECT status, required, confirmation_required, document_label, due_date FROM ' . rg_table('route_steps') . ' WHERE route_id = ? AND workspace_id = ? ORDER BY sequence_no');
    $steps->execute([$routeId, $workspaceId]);
    $items = $steps->fetchAll();
    if (!$items) {
        return;
    }
    $demoDateStmt = $pdo->prepare('SELECT demo_date FROM ' . rg_table('demo_workspaces') . ' WHERE id = ?');
    $demoDateStmt->execute([$workspaceId]);
    $demoDate = (string)$demoDateStmt->fetchColumn();
    $allDone = true;
    $attention = null;
    foreach ($items as $step) {
        if ((int)$step['required'] === 1 && ($step['status'] !== 'completed' || ((int)$step['confirmation_required'] === 1 && empty($step['document_label'])))) {
            $allDone = false;
        }
        if ($step['status'] !== 'completed' && $step['due_date'] < $demoDate) {
            $attention = 'overdue';
        } elseif (!$attention && (int)$step['confirmation_required'] === 1 && $step['status'] === 'completed' && empty($step['document_label'])) {
            $attention = 'no_document';
        }
    }
    $route = $pdo->prepare('SELECT status, attention_reason, assigned_to FROM ' . rg_table('routes') . ' WHERE id = ? AND workspace_id = ?');
    $route->execute([$routeId, $workspaceId]);
    $current = $route->fetch();
    if (!$current) {
        return;
    }
    if (!$attention && empty($current['assigned_to'])) {
        $attention = 'no_assignee';
    }
    if (!$attention && in_array($current['attention_reason'], ['cancelled', 'missed', 'no_slot', 'no_confirmation', 'due_soon'], true)) {
        $attention = $current['attention_reason'];
    }
    $status = $allDone ? 'completed' : ($current['status'] === 'draft' ? 'draft' : 'active');
    $update = $pdo->prepare('UPDATE ' . rg_table('routes') . ' SET status = ?, attention_reason = ?, completed_at = ? WHERE id = ? AND workspace_id = ?');
    $update->execute([$status, $attention, $allDone ? date('Y-m-d H:i:s') : null, $routeId, $workspaceId]);
}

require_once RG_ROOT . '/app/DemoSeeder.php';
require_once RG_ROOT . '/app/CallAssistant.php';
require_once RG_ROOT . '/app/RouteRepository.php';
