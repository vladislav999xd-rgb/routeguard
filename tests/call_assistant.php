<?php
declare(strict_types=1);
putenv('RG_DEV=1');
require dirname(__DIR__) . '/app/bootstrap.php';

$pdo = rg_db();
$prefix = rg_prefix();
$workspace = null;
$checks = [];
$assert = static function (bool $condition, string $name) use (&$checks): void {
    $checks[] = ['name' => $name, 'ok' => $condition];
    if (!$condition) throw new RuntimeException('Проверка не пройдена: ' . $name);
};

try {
    $workspace = DemoSeeder::createWorkspace($pdo, $prefix, null, '2026-10-04');
    $_SESSION['workspace_id'] = $workspace;
    $_SESSION['user'] = ['display_name' => 'Тестовый координатор', 'role' => 'owner'];
    $repository = new RouteRepository($pdo, $workspace);
    $routeByCode = static function (string $code) use ($pdo, $prefix, $workspace, $repository): array {
        $query = $pdo->prepare("SELECT r.id FROM {$prefix}routes r JOIN {$prefix}patients p ON p.id=r.patient_id WHERE r.workspace_id=? AND p.code=?");
        $query->execute([$workspace, $code]);
        $route = $repository->find((int)$query->fetchColumn());
        if (!$route) throw new RuntimeException('Не найден маршрут ' . $code);
        return $route;
    };

    $cancelled = CallAssistant::build($routeByCode('P006'), '2026-10-04');
    $assert($cancelled['scenario'] === 'Возврат после отмены', 'P006 получает сценарий возврата после отмены');
    $assert(str_contains($cancelled['full_text'], 'подобрать новое удобное время'), 'P006 содержит готовый текст повторной записи');

    $missed = CallAssistant::build($routeByCode('P007'), '2026-10-04');
    $assert($missed['scenario'] === 'Повторная запись после неявки', 'P007 получает сценарий после неявки');

    $alternative = CallAssistant::build($routeByCode('P008'), '2026-10-04');
    $assert($alternative['scenario'] === 'Согласование альтернативы', 'P008 получает сценарий альтернативного слота');
    $assert(count($alternative['questions']) >= 3, 'помощник показывает чек-лист вопросов');

    $reminder = CallAssistant::build($routeByCode('P003'), '2026-10-04');
    $assert($reminder['scenario'] === 'Напоминание о записи', 'P003 получает сценарий напоминания');
    $assert(!empty($reminder['appointment']), 'в напоминании отображается активная запись');
    $assert(str_contains($reminder['disclaimer'], 'не давайте медицинских рекомендаций'), 'помощник ограничен организационными вопросами');
} finally {
    if ($workspace) {
        foreach (['action_keys','comments','event_log','appointments','schedule_slots','route_steps','routes','studies','patients','specialists','services','facilities','settings'] as $table) {
            $pdo->prepare("DELETE FROM {$prefix}{$table} WHERE workspace_id=?")->execute([$workspace]);
        }
        $pdo->prepare("DELETE FROM {$prefix}demo_workspaces WHERE id=?")->execute([$workspace]);
    }
}

echo json_encode(['ok' => true, 'checks' => $checks], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
