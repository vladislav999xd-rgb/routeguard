<?php
declare(strict_types=1);

final class DemoSeeder
{
    public static function installSqlite(PDO $pdo, string $prefix): void
    {
        $exists = $pdo->query("SELECT name FROM sqlite_master WHERE type='table' AND name=" . $pdo->quote($prefix . 'demo_workspaces'))->fetchColumn();
        if ($exists) {
            return;
        }
        $sql = str_replace('{{prefix}}', $prefix, file_get_contents(RG_ROOT . '/schema.sqlite.sql'));
        $pdo->exec($sql);
    }

    public static function createWorkspace(PDO $pdo, string $prefix, ?string $id = null, ?string $demoDate = null, bool $template = false, int $ttlDays = 7): string
    {
        $id ??= bin2hex(random_bytes(16));
        $demoDate ??= (new DateTimeImmutable('today', new DateTimeZone('Asia/Yekaterinburg')))->format('Y-m-d');
        $now = date('Y-m-d H:i:s');
        $expires = (new DateTimeImmutable($now))->modify('+' . max(1, $ttlDays) . ' days')->format('Y-m-d H:i:s');
        $stmt = $pdo->prepare("INSERT INTO {$prefix}demo_workspaces (id, demo_date, is_template, created_at, expires_at) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$id, $demoDate, $template ? 1 : 0, $now, $expires]);
        self::seedWorkspace($pdo, $prefix, $id, $demoDate);
        return $id;
    }

    public static function resetWorkspace(PDO $pdo, string $prefix, string $workspaceId): void
    {
        $stmt = $pdo->prepare("SELECT demo_date FROM {$prefix}demo_workspaces WHERE id = ?");
        $stmt->execute([$workspaceId]);
        $demoDate = (string)$stmt->fetchColumn();
        if (!$demoDate) {
            throw new RuntimeException('Демосессия не найдена.');
        }
        $pdo->beginTransaction();
        try {
            foreach (['action_keys', 'comments', 'event_log', 'appointments', 'schedule_slots', 'route_steps', 'routes', 'studies', 'patients', 'specialists', 'services', 'facilities', 'settings'] as $table) {
                $delete = $pdo->prepare("DELETE FROM {$prefix}{$table} WHERE workspace_id = ?");
                $delete->execute([$workspaceId]);
            }
            self::seedWorkspace($pdo, $prefix, $workspaceId, $demoDate, false);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    public static function seedWorkspace(PDO $pdo, string $prefix, string $workspaceId, string $demoDate, bool $transaction = true): void
    {
        if ($transaction) {
            $pdo->beginTransaction();
        }
        try {
            $facilityIds = [];
            $insert = $pdo->prepare("INSERT INTO {$prefix}facilities (workspace_id, name) VALUES (?, ?)");
            foreach (['Демоцентр Север', 'Демоцентр Центральный', 'Демоцентр Восток'] as $name) {
                $insert->execute([$workspaceId, $name]);
                $facilityIds[] = (int)$pdo->lastInsertId();
            }

            $serviceIds = [];
            $services = ['Консультация по результатам', 'Дополнительное исследование', 'Повторный приём', 'Контрольное исследование'];
            $insert = $pdo->prepare("INSERT INTO {$prefix}services (workspace_id, name) VALUES (?, ?)");
            foreach ($services as $name) {
                $insert->execute([$workspaceId, $name]);
                $serviceIds[] = (int)$pdo->lastInsertId();
            }

            $specialistIds = [];
            $specialists = ['Смирнова Ирина Львовна', 'Котова Мария Павловна', 'Родионов Андрей Сергеевич', 'Никитина Ольга Юрьевна'];
            $insert = $pdo->prepare("INSERT INTO {$prefix}specialists (workspace_id, full_name, service_id) VALUES (?, ?, ?)");
            foreach ($specialists as $i => $name) {
                $insert->execute([$workspaceId, $name, $serviceIds[$i]]);
                $specialistIds[] = (int)$pdo->lastInsertId();
            }

            $base = new DateTimeImmutable($demoDate, new DateTimeZone('Asia/Yekaterinburg'));
            $slotInsert = $pdo->prepare("INSERT INTO {$prefix}schedule_slots (workspace_id, service_id, specialist_id, facility_id, starts_at, status) VALUES (?, ?, ?, ?, ?, 'free')");
            for ($day = -3; $day <= 30; $day++) {
                for ($n = 0; $n < 8; $n++) {
                    $serviceIndex = $n % 4;
                    $date = $base->modify(($day >= 0 ? '+' : '') . $day . ' days')->setTime(9 + intdiv($n, 2) * 2, ($n % 2) * 30);
                    $slotInsert->execute([$workspaceId, $serviceIds[$serviceIndex], $specialistIds[$serviceIndex], $facilityIds[($day + $n + 30) % 3], $date->format('Y-m-d H:i:s')]);
                }
            }

            $patients = self::patients();
            $patientInsert = $pdo->prepare("INSERT INTO {$prefix}patients (workspace_id, code, full_name, birth_date) VALUES (?, ?, ?, ?)");
            $studyInsert = $pdo->prepare("INSERT INTO {$prefix}studies (workspace_id, patient_id, study_uid, study_type, study_date, conclusion) VALUES (?, ?, ?, 'Маммография', ?, ?)");
            $routeInsert = $pdo->prepare("INSERT INTO {$prefix}routes (workspace_id, patient_id, study_id, status, assigned_to, attention_reason, due_date, return_reason, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stepInsert = $pdo->prepare("INSERT INTO {$prefix}route_steps (workspace_id, route_id, sequence_no, title, service_id, status, required, confirmation_required, document_label, due_date, completed_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)");
            $eventInsert = $pdo->prepare("INSERT INTO {$prefix}event_log (workspace_id, route_id, event_type, message, author, created_at) VALUES (?, ?, ?, ?, ?, ?)");
            $commentInsert = $pdo->prepare("INSERT INTO {$prefix}comments (workspace_id, route_id, body, author, created_at) VALUES (?, ?, ?, ?, ?)");
            $appointmentInsert = $pdo->prepare("INSERT INTO {$prefix}appointments (workspace_id, route_step_id, slot_id, status, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");

            foreach ($patients as $i => $p) {
                $birth = $base->modify('-' . $p['age'] . ' years')->modify('-' . (($i % 10) + 12) . ' days')->format('Y-m-d');
                $patientInsert->execute([$workspaceId, $p['code'], $p['name'], $birth]);
                $patientId = (int)$pdo->lastInsertId();
                $studyDate = $base->modify('-' . (5 + ($i % 15)) . ' days')->format('Y-m-d');
                $studyUid = 'MG-' . $base->format('ym') . '-' . str_pad((string)($i + 1), 4, '0', STR_PAD_LEFT);
                $studyInsert->execute([$workspaceId, $patientId, $studyUid, $studyDate, $p['conclusion']]);
                $studyId = (int)$pdo->lastInsertId();
                $dueDate = $base->modify(($p['due'] >= 0 ? '+' : '') . $p['due'] . ' days')->format('Y-m-d');
                $created = $base->modify('-' . (4 + ($i % 5)) . ' days')->setTime(10, 15)->format('Y-m-d H:i:s');
                $completedAt = $p['status'] === 'completed' ? $base->modify('-1 day')->setTime(15, 20)->format('Y-m-d H:i:s') : null;
                $routeInsert->execute([$workspaceId, $patientId, $studyId, $p['status'], $p['assignee'], $p['attention'], $dueDate, $p['return_reason'] ?? null, $created, $completedAt]);
                $routeId = (int)$pdo->lastInsertId();

                $steps = $p['steps'] ?? [['title' => $p['step'], 'status' => $p['step_status'], 'service' => $p['service'] ?? 0, 'confirm' => $p['confirm'] ?? 0, 'document' => $p['document'] ?? null, 'due' => $p['due']]];
                foreach ($steps as $stepIndex => $step) {
                    $stepDue = $base->modify((($step['due'] ?? $p['due']) >= 0 ? '+' : '') . ($step['due'] ?? $p['due']) . ' days')->format('Y-m-d');
                    $stepCompleted = $step['status'] === 'completed' ? $base->modify('-' . max(1, count($steps) - $stepIndex) . ' days')->setTime(14, 0)->format('Y-m-d H:i:s') : null;
                    $stepInsert->execute([$workspaceId, $routeId, $stepIndex + 1, $step['title'], $serviceIds[$step['service'] ?? 0], $step['status'], (int)($step['confirm'] ?? 0), $step['document'] ?? null, $stepDue, $stepCompleted]);
                    $stepId = (int)$pdo->lastInsertId();
                    if ($stepIndex === count($steps) - 1 && isset($p['appointment'])) {
                        $appt = $p['appointment'];
                        $target = $base->modify(($appt['day'] >= 0 ? '+' : '') . $appt['day'] . ' days')->format('Y-m-d');
                        $slotQuery = $pdo->prepare("SELECT id FROM {$prefix}schedule_slots WHERE workspace_id = ? AND service_id = ? AND date(starts_at) = ? ORDER BY starts_at LIMIT 1");
                        $slotQuery->execute([$workspaceId, $serviceIds[$step['service'] ?? 0], $target]);
                        $slotId = (int)$slotQuery->fetchColumn();
                        if ($slotId) {
                            $stamp = $base->modify('-2 days')->setTime(12, 0)->format('Y-m-d H:i:s');
                            $appointmentInsert->execute([$workspaceId, $stepId, $slotId, $appt['status'], $appt['reason'] ?? null, $stamp, $stamp]);
                            if (in_array($appt['status'], ['scheduled', 'completed', 'missed'], true)) {
                                $pdo->prepare("UPDATE {$prefix}schedule_slots SET status = 'busy' WHERE id = ? AND workspace_id = ?")->execute([$slotId, $workspaceId]);
                            }
                        }
                    }
                }

                $eventInsert->execute([$workspaceId, $routeId, 'route_created', 'Создан маршрут по исследованию ' . $studyUid . '.', 'Демосистема', $created]);
                $eventInsert->execute([$workspaceId, $routeId, 'scenario', $p['history'], $p['assignee'] ?: 'Демосистема', $base->modify('-1 day')->setTime(11 + ($i % 5), 10)->format('Y-m-d H:i:s')]);
                $commentInsert->execute([$workspaceId, $routeId, $p['comment'], 'Демо-координатор', $base->modify('-1 day')->setTime(9, 30)->format('Y-m-d H:i:s')]);
            }
            $setting = $pdo->prepare("INSERT INTO {$prefix}settings (workspace_id, setting_key, setting_value) VALUES (?, ?, ?)");
            $setting->execute([$workspaceId, 'timezone', 'Asia/Yekaterinburg']);
            $setting->execute([$workspaceId, 'data_notice', 'ДЕМО · Все данные вымышлены']);
            if ($transaction) {
                $pdo->commit();
            }
        } catch (Throwable $e) {
            if ($transaction && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    private static function patients(): array
    {
        $standard = 'Синтетическое описание демонстрационного исследования. Решение о следующем организационном шаге заранее задано специалистом.';
        return [
            ['code'=>'P001','name'=>'Анна Сергеевна Лебедева','age'=>46,'status'=>'draft','attention'=>'no_confirmation','assignee'=>'Мария Котова','due'=>5,'step'=>'Согласовать консультацию по результатам','step_status'=>'pending','history'=>'План ожидает подтверждения сотрудником.','comment'=>'Проверить план и подтвердить следующий шаг.','conclusion'=>$standard],
            ['code'=>'P002','name'=>'Марина Олеговна Соколова','age'=>52,'status'=>'active','attention'=>null,'assignee'=>'Мария Котова','due'=>7,'step'=>'Записать на консультацию по результатам','step_status'=>'pending','history'=>'План подтверждён, подходящий слот найден.','comment'=>'Можно оформить запись на ближайший свободный слот.','conclusion'=>$standard],
            ['code'=>'P003','name'=>'Елена Викторовна Морозова','age'=>61,'status'=>'active','attention'=>null,'assignee'=>'Ирина Смирнова','due'=>9,'step'=>'Пройти консультацию по результатам','step_status'=>'scheduled','appointment'=>['day'=>4,'status'=>'scheduled'],'history'=>'Будущая запись подтверждена.','comment'=>'Маршрут идёт по плану.','conclusion'=>$standard],
            ['code'=>'P004','name'=>'Ольга Андреевна Волкова','age'=>48,'status'=>'active','attention'=>null,'assignee'=>'Ирина Смирнова','due'=>2,'step'=>'Пройти повторный приём','step_status'=>'scheduled','service'=>2,'appointment'=>['day'=>0,'status'=>'scheduled'],'history'=>'Запись назначена на демодату.','comment'=>'После посещения отметить результат.','conclusion'=>$standard],
            ['code'=>'P005','name'=>'Наталья Игоревна Орлова','age'=>57,'status'=>'completed','attention'=>null,'assignee'=>'Мария Котова','due'=>-1,'step'=>'Консультация по результатам','step_status'=>'completed','appointment'=>['day'=>-1,'status'=>'completed'],'history'=>'Обязательный шаг выполнен, маршрут закрыт.','comment'=>'Демонстрационный маршрут завершён.','conclusion'=>$standard],
            ['code'=>'P006','name'=>'Татьяна Павловна Белова','age'=>64,'status'=>'active','attention'=>'cancelled','assignee'=>'Мария Котова','due'=>6,'step'=>'Подобрать новое время консультации','step_status'=>'pending','appointment'=>['day'=>-1,'status'=>'cancelled','reason'=>'Пациентка отменила запись'],'return_reason'=>'Отмена пациенткой','history'=>'Запись отменена. Маршрут возвращён в работу.','comment'=>'Подобрать новый слот и связаться с пациенткой.','conclusion'=>$standard],
            ['code'=>'P007','name'=>'Ирина Алексеевна Крылова','age'=>43,'status'=>'active','attention'=>'missed','assignee'=>'Мария Котова','due'=>4,'step'=>'Организовать повторную запись','step_status'=>'pending','appointment'=>['day'=>-2,'status'=>'missed','reason'=>'Неявка'],'return_reason'=>'Неявка','history'=>'Зафиксирована неявка, создана задача координатору.','comment'=>'Уточнить готовность выбрать новое время.','conclusion'=>$standard],
            ['code'=>'P008','name'=>'Светлана Дмитриевна Зайцева','age'=>55,'status'=>'active','attention'=>'no_slot','assignee'=>'Ирина Смирнова','due'=>1,'step'=>'Найти слот до условного срока','step_status'=>'pending','service'=>1,'history'=>'Свободных слотов до выбранной даты нет.','comment'=>'Рассмотреть более позднюю дату или другую площадку.','conclusion'=>$standard],
            ['code'=>'P009','name'=>'Людмила Петровна Фомина','age'=>68,'status'=>'active','attention'=>'overdue','assignee'=>'Мария Котова','due'=>-2,'step'=>'Организовать повторный приём','step_status'=>'pending','service'=>2,'history'=>'Условный организационный срок нарушен.','comment'=>'Срок шага истёк два дня назад.','conclusion'=>$standard],
            ['code'=>'P010','name'=>'Вера Николаевна Громова','age'=>59,'status'=>'draft','attention'=>'no_confirmation','assignee'=>'Ирина Смирнова','due'=>8,'step'=>'Уточнить исходное заключение','step_status'=>'pending','history'=>'Заключение заполнено не полностью.','comment'=>'Запросить уточнение демоданных.','conclusion'=>'Синтетическое демонстрационное заключение заполнено частично; клинические выводы отсутствуют.'],
            ['code'=>'P011','name'=>'Юлия Романовна Тихонова','age'=>41,'status'=>'active','attention'=>'no_assignee','assignee'=>null,'due'=>5,'step'=>'Назначить ответственного за следующий шаг','step_status'=>'pending','history'=>'Следующий шаг задан без ответственного.','comment'=>'Назначьте ответственного.','conclusion'=>$standard],
            ['code'=>'P012','name'=>'Екатерина Денисовна Миронова','age'=>50,'status'=>'active','attention'=>'no_document','assignee'=>'Мария Котова','due'=>1,'step'=>'Подтвердить выполнение демодокументом','step_status'=>'completed','confirm'=>1,'history'=>'Шаг выполнен, подтверждающий демодокумент отсутствует.','comment'=>'Закрытие доступно после добавления синтетической заглушки.','conclusion'=>$standard],
            ['code'=>'P013','name'=>'Галина Степановна Жукова','age'=>72,'status'=>'active','attention'=>null,'assignee'=>'Ирина Смирнова','due'=>10,'steps'=>[['title'=>'Консультация по результатам','status'=>'completed','service'=>0,'due'=>-1,'document'=>'Синтетический демодокумент'],['title'=>'Контрольное исследование','status'=>'pending','service'=>3,'due'=>10]],'history'=>'Первый шаг завершён, второй ожидает записи.','comment'=>'Выбрать время контрольного исследования.','conclusion'=>$standard],
            ['code'=>'P014','name'=>'Алёна Максимовна Власова','age'=>39,'status'=>'active','attention'=>'cancelled','assignee'=>'Мария Котова','due'=>8,'step'=>'Перенести консультацию','step_status'=>'scheduled','appointment'=>['day'=>3,'status'=>'scheduled'],'history'=>'Получен запрос на перенос записи.','comment'=>'Есть альтернативный свободный слот.','conclusion'=>$standard],
            ['code'=>'P015','name'=>'Надежда Валерьевна Кузнецова','age'=>63,'status'=>'active','attention'=>null,'assignee'=>'Ирина Смирнова','due'=>12,'step'=>'Пройти консультацию по результатам','step_status'=>'scheduled','appointment'=>['day'=>5,'status'=>'scheduled'],'history'=>'Активный маршрут по исследованию уже существует.','comment'=>'Повторное создание должно показать предупреждение о дубле.','conclusion'=>$standard],
            ['code'=>'P016','name'=>'Лариса Евгеньевна Попова','age'=>54,'status'=>'active','attention'=>'no_confirmation','assignee'=>'Мария Котова','due'=>7,'step'=>'Согласовать удобное время','step_status'=>'pending','history'=>'Ожидается согласование времени с пациенткой.','comment'=>'После демозвонка можно выбрать слот.','conclusion'=>$standard],
            ['code'=>'P017','name'=>'Валентина Аркадьевна Новикова','age'=>66,'status'=>'active','attention'=>'cancelled','assignee'=>'Мария Котова','due'=>5,'step'=>'Подобрать новую запись','step_status'=>'pending','appointment'=>['day'=>1,'status'=>'cancelled','reason'=>'Приём отменён клиникой'],'return_reason'=>'Отмена клиникой','history'=>'Клиника отменила приём, требуется перезапись.','comment'=>'Предложить новый слот.','conclusion'=>$standard],
            ['code'=>'P018','name'=>'Ксения Ильинична Федорова','age'=>45,'status'=>'active','attention'=>'no_slot','assignee'=>'Ирина Смирнова','due'=>6,'step'=>'Подтвердить альтернативную площадку','step_status'=>'pending','history'=>'Удобная площадка недоступна, найдена альтернатива.','comment'=>'Не менять площадку без подтверждения сотрудника.','conclusion'=>$standard],
            ['code'=>'P019','name'=>'Тамара Борисовна Павлова','age'=>70,'status'=>'completed','attention'=>null,'assignee'=>'Мария Котова','due'=>-1,'steps'=>[['title'=>'Консультация по результатам','status'=>'completed','service'=>0,'due'=>-4,'document'=>'Синтетический демодокумент'],['title'=>'Контрольное исследование','status'=>'completed','service'=>3,'due'=>-1,'document'=>'Синтетический демодокумент']], 'history'=>'Оба обязательных шага выполнены, маршрут закрыт.','comment'=>'Полная история сохранена.','conclusion'=>$standard],
            ['code'=>'P020','name'=>'Дарья Константиновна Романова','age'=>47,'status'=>'active','attention'=>'due_soon','assignee'=>'Мария Котова','due'=>1,'step'=>'Записать на консультацию','step_status'=>'pending','history'=>'Срок следующего шага наступает завтра.','comment'=>'Записи пока нет, требуется внимание.','conclusion'=>$standard],
        ];
    }
}
