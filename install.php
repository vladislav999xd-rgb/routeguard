<?php
declare(strict_types=1);

define('RG_ROOT', __DIR__);
date_default_timezone_set('Asia/Yekaterinburg');

$configPath = getenv('ROUTEGUARD_CONFIG') ?: __DIR__ . '/config.php';
$config = is_file($configPath) ? require $configPath : null;
$error = null;
$success = false;
$base = '';
$dbConfig = is_array($config) && is_array($config['db'] ?? null) ? $config['db'] : [];
$dbReady = !empty($dbConfig['host']) && !empty($dbConfig['name']) && !empty($dbConfig['user']) && array_key_exists('password', $dbConfig);

if (!is_array($config)) {
    $error = 'Сначала создайте config.php. Для этого архива файл уже подготовлен.';
} elseif (!empty($config['installed'])) {
    $error = 'Установщик уже заблокирован. Приложение установлено.';
} elseif (strlen((string)($config['install_token'] ?? '')) < 24 || str_contains((string)$config['install_token'], 'ЗАМЕНИТЕ')) {
    $error = 'В config.php отсутствует безопасный install_token.';
} elseif (strlen((string)($config['maintenance_token'] ?? '')) < 24 || str_contains((string)$config['maintenance_token'], 'ДРУГАЯ_')) {
    $error = 'В config.php отсутствует безопасный maintenance_token.';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$error) {
    try {
        if (!hash_equals((string)$config['install_token'], (string)($_POST['install_token'] ?? ''))) {
            throw new RuntimeException('Неверный одноразовый токен.');
        }
        foreach (['pdo', 'pdo_mysql', 'mbstring', 'json', 'session'] as $extension) {
            if (!extension_loaded($extension)) throw new RuntimeException('Не установлено расширение PHP: ' . $extension);
        }
        if (version_compare(PHP_VERSION, '8.2.0', '<')) throw new RuntimeException('Требуется PHP 8.2 или новее.');

        $host = trim((string)($_POST['db_host'] ?? ($dbConfig['host'] ?? 'localhost')));
        $port = max(1, (int)($_POST['db_port'] ?? ($dbConfig['port'] ?? 3306)));
        $name = trim((string)($_POST['db_name'] ?? ($dbConfig['name'] ?? '')));
        $user = trim((string)($_POST['db_user'] ?? ($dbConfig['user'] ?? '')));
        $password = (string)($_POST['db_password'] ?? '');
        if ($password === '') $password = (string)($dbConfig['password'] ?? '');
        $prefix = trim((string)($_POST['db_prefix'] ?? ($dbConfig['prefix'] ?? 'rg_')));
        if (!preg_match('/^[a-zA-Z][a-zA-Z0-9_]{1,20}$/', $prefix)) throw new RuntimeException('Недопустимый префикс таблиц.');

        $base = rtrim('/' . trim((string)($_POST['base_url'] ?? ''), '/'), '/');
        if ($base === '/') $base = '';
        $admin = trim((string)($_POST['admin_login'] ?? ''));
        $adminPassword = (string)($_POST['admin_password'] ?? '');
        if (!preg_match('/^[a-zA-Z0-9._-]{4,40}$/', $admin)) throw new RuntimeException('Логин владельца: 4–40 латинских символов, цифр или ._-');
        if (strlen($adminPassword) < 12) throw new RuntimeException('Пароль владельца должен содержать не менее 12 символов.');

        $pdo = new PDO(
            "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4",
            $user,
            $password,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]
        );
        $schema = str_replace('{{prefix}}', $prefix, file_get_contents(__DIR__ . '/schema.sql'));
        foreach (array_filter(array_map('trim', preg_split('/;\s*(?:\r?\n|$)/', $schema))) as $sql) $pdo->exec($sql);

        $stmt = $pdo->prepare("INSERT INTO {$prefix}users (username,password_hash,role,display_name,created_at) VALUES (?,?,?,?,?)");
        $stmt->execute([$admin, password_hash($adminPassword, PASSWORD_DEFAULT), 'admin', 'Администратор', date('Y-m-d H:i:s')]);
        require __DIR__ . '/app/DemoSeeder.php';
        DemoSeeder::createWorkspace($pdo, $prefix, 'template000000000000000000000000', date('Y-m-d'), true, 3650);

        $newConfig = $config;
        $newConfig['installed'] = true;
        $newConfig['install_token'] = null;
        $newConfig['base_url'] = $base;
        $newConfig['db'] = ['host' => $host, 'port' => $port, 'name' => $name, 'user' => $user, 'password' => $password, 'prefix' => $prefix];
        $php = "<?php\ndeclare(strict_types=1);\n// Создан установщиком RouteGuard. Запретите веб-доступ к этому файлу.\nreturn " . var_export($newConfig, true) . ";\n";
        if (file_put_contents($configPath, $php, LOCK_EX) === false) throw new RuntimeException('Не удалось записать config.php. Проверьте права на файл.');
        @file_put_contents(__DIR__ . '/.install.lock', date(DATE_ATOM), LOCK_EX);
        $success = true;
    } catch (Throwable $exception) {
        $error = $exception instanceof PDOException && str_contains($exception->getMessage(), '[1045]')
            ? 'MySQL отклонил логин или пароль. Проверьте пароль базы данных и повторите установку.'
            : $exception->getMessage();
    }
}
?>
<!doctype html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Установка RouteGuard</title>
    <link rel="stylesheet" href="assets/vendor/bootstrap.min.css">
    <link rel="stylesheet" href="assets/app.css">
</head>
<body>
<main class="login-page">
    <section class="card p-4 p-md-5" style="width:min(760px,100%)">
        <div class="login-mark">RouteGuard · установка</div>
        <h1 class="h3 mt-3">Установка «Маршрутов пациентов»</h1>
        <?php if ($success): ?>
            <div class="alert alert-success mt-3">Установка завершена. Установщик заблокирован, шаблон демоданных создан.</div>
            <a class="btn btn-primary" href="<?=htmlspecialchars(($base ?: '') . '/index.php', ENT_QUOTES)?>">Открыть приложение</a>
        <?php else: ?>
            <?php if ($error): ?><div class="alert alert-danger mt-3"><?=htmlspecialchars($error, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')?></div><?php endif ?>
            <div class="small text-secondary mb-3">PHP <?=PHP_VERSION?> · PDO MySQL <?=extension_loaded('pdo_mysql') ? 'доступен' : 'не найден'?></div>
            <?php if ($dbReady): ?>
                <div class="alert alert-info">База данных уже настроена: <?=htmlspecialchars((string)$dbConfig['name'], ENT_QUOTES)?>@<?=htmlspecialchars((string)$dbConfig['host'], ENT_QUOTES)?>.</div>
            <?php endif ?>
            <form method="post">
                <div class="row g-3">
                    <div class="col-12"><label class="form-label">Одноразовый токен установки</label><input class="form-control" type="password" name="install_token" required></div>
                    <div class="col-md-8"><label class="form-label">Хост БД</label><input class="form-control" name="db_host" value="<?=htmlspecialchars((string)($dbConfig['host'] ?? 'localhost'), ENT_QUOTES)?>" required></div>
                    <div class="col-md-4"><label class="form-label">Порт</label><input class="form-control" type="number" name="db_port" value="<?=htmlspecialchars((string)($dbConfig['port'] ?? 3306), ENT_QUOTES)?>" required></div>
                    <div class="col-md-6"><label class="form-label">Имя БД</label><input class="form-control" name="db_name" value="<?=htmlspecialchars((string)($dbConfig['name'] ?? ''), ENT_QUOTES)?>" required></div>
                    <div class="col-md-6"><label class="form-label">Пользователь БД</label><input class="form-control" name="db_user" value="<?=htmlspecialchars((string)($dbConfig['user'] ?? ''), ENT_QUOTES)?>" required></div>
                    <div class="col-md-6"><label class="form-label">Пароль БД</label><input class="form-control" type="password" name="db_password" placeholder="Оставьте пустым, чтобы использовать config.php"><div class="form-text">Сохранённый пароль не показывается в браузере.</div></div>
                    <div class="col-md-6"><label class="form-label">Префикс</label><input class="form-control" name="db_prefix" value="<?=htmlspecialchars((string)($dbConfig['prefix'] ?? 'rg_'), ENT_QUOTES)?>" required></div>
                    <div class="col-12"><label class="form-label">BASE_URL</label><input class="form-control" name="base_url" placeholder="Оставьте пустым для корня сайта"></div>
                    <div class="col-md-6"><label class="form-label">Логин владельца</label><input class="form-control" name="admin_login" autocomplete="username" required></div>
                    <div class="col-md-6"><label class="form-label">Пароль владельца</label><input class="form-control" type="password" name="admin_password" autocomplete="new-password" minlength="12" required></div>
                </div>
                <button class="btn btn-primary mt-4" type="submit">Установить приложение</button>
            </form>
        <?php endif ?>
    </section>
</main>
</body>
</html>
