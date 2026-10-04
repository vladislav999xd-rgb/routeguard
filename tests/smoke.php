<?php
declare(strict_types=1);
putenv('RG_DEV=1');
require dirname(__DIR__) . '/app/bootstrap.php';

$pdo = rg_db();
$prefix = rg_prefix();
$checks = [];
$assert = static function (bool $condition, string $name) use (&$checks): void {
    $checks[] = ['name' => $name, 'ok' => $condition];
    if (!$condition) throw new RuntimeException('Проверка не пройдена: ' . $name);
};
$workspaces = [];

try {
    $w1 = DemoSeeder::createWorkspace($pdo, $prefix, null, '2026-10-04');
    $w2 = DemoSeeder::createWorkspace($pdo, $prefix, null, '2026-10-04');
    $workspaces = [$w1, $w2];
    $count = $pdo->prepare("SELECT COUNT(*) FROM {$prefix}patients WHERE workspace_id=?");
    $count->execute([$w1]); $assert((int)$count->fetchColumn() === 20, 'ровно 20 пациентов в первой демосессии');
    $count->execute([$w2]); $assert((int)$count->fetchColumn() === 20, 'ровно 20 пациентов во второй демосессии');

    $pdo->prepare("UPDATE {$prefix}patients SET full_name='Изменено только здесь' WHERE workspace_id=? AND code='P001'")->execute([$w1]);
    $name = $pdo->prepare("SELECT full_name FROM {$prefix}patients WHERE workspace_id=? AND code='P001'");
    $name->execute([$w2]); $assert($name->fetchColumn() === 'Анна Сергеевна Лебедева', 'изоляция двух демосессий');

    $q = $pdo->prepare("SELECT r.id route_id, rs.id step_id, rs.service_id FROM {$prefix}routes r JOIN {$prefix}patients p ON p.id=r.patient_id JOIN {$prefix}route_steps rs ON rs.route_id=r.id WHERE r.workspace_id=? AND p.code='P006'");
    $q->execute([$w1]); $p006 = $q->fetch();
    $slotQ = $pdo->prepare("SELECT id FROM {$prefix}schedule_slots WHERE workspace_id=? AND service_id=? AND status='free' AND starts_at>='2026-10-04' ORDER BY starts_at LIMIT 1");
    $slotQ->execute([$w1, $p006['service_id']]); $slotId = (int)$slotQ->fetchColumn();
    $pdo->beginTransaction();
    $slot = $pdo->prepare("SELECT status FROM {$prefix}schedule_slots WHERE id=? AND workspace_id=?");
    $slot->execute([$slotId, $w1]); $assert($slot->fetchColumn() === 'free', 'слот свободен перед записью');
    $pdo->prepare("UPDATE {$prefix}schedule_slots SET status='busy' WHERE id=? AND workspace_id=? AND status='free'")->execute([$slotId, $w1]);
    $pdo->prepare("INSERT INTO {$prefix}appointments (workspace_id,route_step_id,slot_id,status,created_at,updated_at) VALUES (?,?,?,'scheduled',?,?)")->execute([$w1,$p006['step_id'],$slotId,date('Y-m-d H:i:s'),date('Y-m-d H:i:s')]);
    $pdo->commit();
    $again = $pdo->prepare("UPDATE {$prefix}schedule_slots SET status='busy' WHERE id=? AND workspace_id=? AND status='free'");
    $again->execute([$slotId,$w1]); $assert($again->rowCount() === 0, 'двойное бронирование одного слота заблокировано');
    $pdo->prepare("INSERT INTO {$prefix}action_keys (workspace_id,request_key,created_at) VALUES (?,?,?)")->execute([$w1,'repeat-test-key-0001',date('Y-m-d H:i:s')]);
    $duplicateBlocked=false;
    try {$pdo->prepare("INSERT INTO {$prefix}action_keys (workspace_id,request_key,created_at) VALUES (?,?,?)")->execute([$w1,'repeat-test-key-0001',date('Y-m-d H:i:s')]);} catch(PDOException $e) {$duplicateBlocked=true;}
    $assert($duplicateBlocked,'повторная отправка действия блокируется уникальным ключом');

    $pdo->prepare("UPDATE {$prefix}route_steps SET status='completed',completed_at=? WHERE id=? AND workspace_id=?")->execute([date('Y-m-d H:i:s'),$p006['step_id'],$w1]);
    rg_recalculate_route($pdo,(int)$p006['route_id'],$w1);
    $status = $pdo->prepare("SELECT status FROM {$prefix}routes WHERE id=? AND workspace_id=?");
    $status->execute([$p006['route_id'],$w1]); $assert($status->fetchColumn()==='completed','ключевой сценарий P006 завершается после записи и выполнения');

    $p013 = $pdo->prepare("SELECT r.id FROM {$prefix}routes r JOIN {$prefix}patients p ON p.id=r.patient_id WHERE r.workspace_id=? AND p.code='P013'");
    $p013->execute([$w1]); $p013id=(int)$p013->fetchColumn(); rg_recalculate_route($pdo,$p013id,$w1);
    $status->execute([$p013id,$w1]); $assert($status->fetchColumn()==='active','маршрут с незавершённым обязательным шагом не закрывается');

    $p012 = $pdo->prepare("SELECT r.id FROM {$prefix}routes r JOIN {$prefix}patients p ON p.id=r.patient_id WHERE r.workspace_id=? AND p.code='P012'");
    $p012->execute([$w1]); $p012id=(int)$p012->fetchColumn(); rg_recalculate_route($pdo,$p012id,$w1);
    $status->execute([$p012id,$w1]); $assert($status->fetchColumn()==='active','обязательное подтверждение блокирует закрытие');

    $slots = $pdo->prepare("SELECT COUNT(*) FROM {$prefix}schedule_slots WHERE workspace_id=?");
    $slots->execute([$w1]); $assert((int)$slots->fetchColumn() >= 240,'расписание заполнено на 30 дней');
} finally {
    foreach ($workspaces as $workspace) {
        foreach (['action_keys','comments','event_log','appointments','schedule_slots','route_steps','routes','studies','patients','specialists','services','facilities','settings'] as $table) {
            $pdo->prepare("DELETE FROM {$prefix}{$table} WHERE workspace_id=?")->execute([$workspace]);
        }
        $pdo->prepare("DELETE FROM {$prefix}demo_workspaces WHERE id=?")->execute([$workspace]);
    }
}

echo json_encode(['ok'=>true,'checks'=>$checks],JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT) . PHP_EOL;
