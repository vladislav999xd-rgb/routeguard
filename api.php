<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit('Метод не поддерживается');
}

try {
    rg_verify_csrf();
    $action = (string)($_POST['action'] ?? '');
    $pdo = rg_db();

    if ($action === 'open_demo') {
        $last = (int)($_SESSION['last_demo_created'] ?? 0);
        if ($last && time() - $last < 8) {
            throw new RuntimeException('Подождите несколько секунд перед созданием новой демосессии.');
        }
        $count = (int)$pdo->query('SELECT COUNT(*) FROM ' . rg_table('demo_workspaces') . ' WHERE is_template=0 AND expires_at > ' . $pdo->quote(date('Y-m-d H:i:s')))->fetchColumn();
        if ($count >= (int)(rg_config()['demo_limit'] ?? 1000)) {
            throw new RuntimeException('Достигнут лимит активных демосессий. Попробуйте позднее.');
        }
        $workspace = DemoSeeder::createWorkspace($pdo, rg_prefix(), null, null, false, (int)(rg_config()['demo_ttl_days'] ?? 7));
        session_regenerate_id(true);
        $_SESSION['workspace_id'] = $workspace;
        $_SESSION['user'] = ['role' => 'demo', 'display_name' => 'Демо-координатор'];
        $_SESSION['last_demo_created'] = time();
        rg_flash('success', 'Демосессия создана. Загружено 20 вымышленных пациентов.');
        rg_redirect('index.php?page=overview');
    }

    if ($action === 'login') {
        $identity = strtolower(trim((string)($_POST['username'] ?? '')));
        $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        $key = hash('sha256', $identity . '|' . $ip);
        $cutoff = date('Y-m-d H:i:s', time() - 900);
        $attempts = $pdo->prepare('SELECT COUNT(*) FROM ' . rg_table('login_attempts') . ' WHERE identity=? AND attempted_at>?');
        $attempts->execute([$key, $cutoff]);
        if ((int)$attempts->fetchColumn() >= 8) {
            throw new RuntimeException('Слишком много попыток. Повторите вход через 15 минут.');
        }
        $pdo->prepare('INSERT INTO ' . rg_table('login_attempts') . ' (identity, attempted_at) VALUES (?,?)')->execute([$key, date('Y-m-d H:i:s')]);
        $stmt = $pdo->prepare('SELECT * FROM ' . rg_table('users') . ' WHERE username=? LIMIT 1');
        $stmt->execute([$identity]);
        $user = $stmt->fetch();
        if (!$user || !password_verify((string)($_POST['password'] ?? ''), $user['password_hash'])) {
            throw new RuntimeException('Неверный логин или пароль.');
        }
        $workspace = DemoSeeder::createWorkspace($pdo, rg_prefix(), null, null, false, (int)(rg_config()['demo_ttl_days'] ?? 7));
        session_regenerate_id(true);
        $_SESSION['workspace_id'] = $workspace;
        $_SESSION['user'] = ['id' => (int)$user['id'], 'role' => $user['role'], 'display_name' => $user['display_name']];
        $pdo->prepare('UPDATE ' . rg_table('users') . ' SET last_login_at=? WHERE id=?')->execute([date('Y-m-d H:i:s'), $user['id']]);
        rg_redirect('index.php?page=overview');
    }

    rg_require_auth();
    $workspace = (string)rg_workspace_id();
    $author = (string)(rg_user()['display_name'] ?? 'Координатор');

    if ($action === 'logout') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'] ?? '', (bool)$p['secure'], (bool)$p['httponly']);
        }
        session_destroy();
        header('Location: ' . rg_url('index.php?page=login'));
        exit;
    }
    if ($action === 'reset_demo') {
        DemoSeeder::resetWorkspace($pdo, rg_prefix(), $workspace);
        rg_flash('success', 'Демоданные текущей сессии восстановлены.');
        rg_redirect('index.php?page=settings');
    }
    if ($action === 'next_day') {
        $stmt = $pdo->prepare('UPDATE ' . rg_table('demo_workspaces') . ' SET demo_date=date(demo_date, \'+1 day\') WHERE id=?');
        if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
            $stmt = $pdo->prepare('UPDATE ' . rg_table('demo_workspaces') . ' SET demo_date=DATE_ADD(demo_date, INTERVAL 1 DAY) WHERE id=?');
        }
        $stmt->execute([$workspace]);
        (new RouteRepository($pdo, $workspace))->refresh();
        rg_log($pdo, $workspace, null, 'demo_date', 'Демодата переведена на следующий день.', $author);
        rg_flash('success', 'Демодата изменена, просрочки пересчитаны.');
        rg_redirect('index.php?page=settings');
    }
    if ($action === 'cleanup_sessions') {
        if ((rg_user()['role'] ?? '') !== 'admin') throw new RuntimeException('Действие доступно только администратору.');
        $expired = $pdo->prepare('SELECT id FROM ' . rg_table('demo_workspaces') . ' WHERE is_template=0 AND expires_at < ?');
        $expired->execute([date('Y-m-d H:i:s')]);
        $ids = array_column($expired->fetchAll(), 'id');
        $pdo->beginTransaction();
        try {
            foreach ($ids as $id) {
                foreach (['action_keys','comments','event_log','appointments','schedule_slots','route_steps','routes','studies','patients','specialists','services','facilities','settings'] as $table) {
                    $pdo->prepare('DELETE FROM ' . rg_table($table) . ' WHERE workspace_id=?')->execute([$id]);
                }
                $pdo->prepare('DELETE FROM ' . rg_table('demo_workspaces') . ' WHERE id=? AND is_template=0')->execute([$id]);
            }
            $pdo->commit();
        } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
        rg_flash('success', 'Просроченные демосессии удалены: ' . count($ids) . '.');
        rg_redirect('index.php?page=settings');
    }

    $routeId = (int)($_POST['route_id'] ?? 0);
    $ensureRoute = static function() use ($pdo, $workspace, $routeId): array {
        $stmt = $pdo->prepare('SELECT * FROM ' . rg_table('routes') . ' WHERE id=? AND workspace_id=?');
        $stmt->execute([$routeId, $workspace]);
        $route = $stmt->fetch();
        if (!$route) throw new RuntimeException('Маршрут не найден в текущей демосессии.');
        return $route;
    };

    if ($action === 'confirm_plan') {
        $ensureRoute();
        $pdo->prepare('UPDATE ' . rg_table('routes') . ' SET status=\'active\', attention_reason=CASE WHEN attention_reason=\'no_confirmation\' THEN NULL ELSE attention_reason END WHERE id=? AND workspace_id=?')->execute([$routeId, $workspace]);
        rg_log($pdo, $workspace, $routeId, 'plan_confirmed', 'План маршрута подтверждён.', $author);
        rg_flash('success', 'План подтверждён. Можно продолжить маршрут.');
    } elseif ($action === 'assign') {
        $ensureRoute();
        $assignee = trim((string)($_POST['assignee'] ?? ''));
        if (!in_array($assignee, ['Мария Котова', 'Ирина Смирнова'], true)) throw new RuntimeException('Выберите ответственного из списка.');
        $pdo->prepare('UPDATE ' . rg_table('routes') . ' SET assigned_to=?, attention_reason=CASE WHEN attention_reason=\'no_assignee\' THEN NULL ELSE attention_reason END WHERE id=? AND workspace_id=?')->execute([$assignee, $routeId, $workspace]);
        rg_log($pdo, $workspace, $routeId, 'assigned', 'Назначен ответственный: ' . $assignee . '.', $author);
        rg_flash('success', 'Ответственный назначен.');
    } elseif ($action === 'book') {
        $ensureRoute();
        $stepId = (int)($_POST['step_id'] ?? 0);
        $slotId = (int)($_POST['slot_id'] ?? 0);
        $requestKey = preg_replace('/[^a-f0-9]/', '', (string)($_POST['request_key'] ?? ''));
        if (strlen($requestKey) < 16) throw new RuntimeException('Некорректный ключ запроса.');
        $pdo->beginTransaction();
        try {
            $insertKey = $pdo->prepare('INSERT INTO ' . rg_table('action_keys') . ' (workspace_id,request_key,created_at) VALUES (?,?,?)');
            try { $insertKey->execute([$workspace, $requestKey, date('Y-m-d H:i:s')]); } catch (PDOException $e) { throw new RuntimeException('Это действие уже выполнено.'); }
            $step = $pdo->prepare('SELECT * FROM ' . rg_table('route_steps') . ' WHERE id=? AND route_id=? AND workspace_id=?');
            $step->execute([$stepId, $routeId, $workspace]);
            $stepRow = $step->fetch();
            if (!$stepRow || $stepRow['status'] === 'completed') throw new RuntimeException('Шаг уже завершён или недоступен.');
            $lock = 'SELECT * FROM ' . rg_table('schedule_slots') . ' WHERE id=? AND workspace_id=?';
            if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') $lock .= ' FOR UPDATE';
            $slot = $pdo->prepare($lock);$slot->execute([$slotId,$workspace]);$slotRow=$slot->fetch();
            if (!$slotRow || $slotRow['status'] !== 'free') throw new RuntimeException('Слот уже занят. Выберите другое время.');
            if ((int)$slotRow['service_id'] !== (int)$stepRow['service_id']) throw new RuntimeException('Слот не соответствует услуге шага.');
            $old = $pdo->prepare('SELECT a.id,a.slot_id FROM ' . rg_table('appointments') . ' a WHERE a.route_step_id=? AND a.workspace_id=? AND a.status=\'scheduled\'');$old->execute([$stepId,$workspace]);
            foreach($old->fetchAll() as $o){$pdo->prepare('UPDATE '.rg_table('appointments').' SET status=\'cancelled\',reason=\'Перенос записи\',updated_at=? WHERE id=?')->execute([date('Y-m-d H:i:s'),$o['id']]);$pdo->prepare('UPDATE '.rg_table('schedule_slots').' SET status=\'free\' WHERE id=? AND workspace_id=?')->execute([$o['slot_id'],$workspace]);}
            $now=date('Y-m-d H:i:s');
            $pdo->prepare('INSERT INTO '.rg_table('appointments').' (workspace_id,route_step_id,slot_id,status,reason,created_at,updated_at) VALUES (?,?,?,\'scheduled\',NULL,?,?)')->execute([$workspace,$stepId,$slotId,$now,$now]);
            $pdo->prepare('UPDATE '.rg_table('schedule_slots').' SET status=\'busy\' WHERE id=? AND workspace_id=? AND status=\'free\'')->execute([$slotId,$workspace]);
            $pdo->prepare('UPDATE '.rg_table('route_steps').' SET status=\'scheduled\' WHERE id=? AND workspace_id=?')->execute([$stepId,$workspace]);
            $pdo->prepare('UPDATE '.rg_table('routes').' SET status=\'active\',attention_reason=NULL,return_reason=NULL WHERE id=? AND workspace_id=?')->execute([$routeId,$workspace]);
            rg_log($pdo,$workspace,$routeId,'appointment_created','Запись оформлена на '.date('d.m.Y H:i',strtotime($slotRow['starts_at'])).'.',$author);
            $pdo->commit();
        } catch(Throwable $e) { if($pdo->inTransaction())$pdo->rollBack(); throw $e; }
        rg_flash('success','Запись создана. Слот повторно проверен сервером.');
    } elseif ($action === 'complete_step') {
        $ensureRoute();$stepId=(int)($_POST['step_id']??0);
        $stmt=$pdo->prepare('UPDATE '.rg_table('route_steps').' SET status=\'completed\',completed_at=? WHERE id=? AND route_id=? AND workspace_id=? AND status!=\'completed\'');$stmt->execute([date('Y-m-d H:i:s'),$stepId,$routeId,$workspace]);
        if(!$stmt->rowCount())throw new RuntimeException('Шаг уже завершён или недоступен.');
        $pdo->prepare('UPDATE '.rg_table('appointments').' SET status=\'completed\',updated_at=? WHERE route_step_id=? AND workspace_id=? AND status=\'scheduled\'')->execute([date('Y-m-d H:i:s'),$stepId,$workspace]);
        rg_log($pdo,$workspace,$routeId,'step_completed','Шаг маршрута отмечен выполненным.',$author);rg_recalculate_route($pdo,$routeId,$workspace);
        rg_flash('success','Шаг выполнен. Можно продолжить маршрут.');
    } elseif (in_array($action,['cancel_appointment','miss_appointment'],true)) {
        $ensureRoute();$appointmentId=(int)($_POST['appointment_id']??0);$reason=trim((string)($_POST['reason']??($action==='miss_appointment'?'Неявка':'Отмена записи')));
        $pdo->beginTransaction();try{$q=$pdo->prepare('SELECT a.*,rs.route_id FROM '.rg_table('appointments').' a JOIN '.rg_table('route_steps').' rs ON rs.id=a.route_step_id WHERE a.id=? AND a.workspace_id=? AND rs.route_id=?');$q->execute([$appointmentId,$workspace,$routeId]);$a=$q->fetch();if(!$a||$a['status']!=='scheduled')throw new RuntimeException('Активная запись не найдена.');$status=$action==='miss_appointment'?'missed':'cancelled';$pdo->prepare('UPDATE '.rg_table('appointments').' SET status=?,reason=?,updated_at=? WHERE id=? AND workspace_id=?')->execute([$status,$reason,date('Y-m-d H:i:s'),$appointmentId,$workspace]);if($status==='cancelled')$pdo->prepare('UPDATE '.rg_table('schedule_slots').' SET status=\'free\' WHERE id=? AND workspace_id=?')->execute([$a['slot_id'],$workspace]);$pdo->prepare('UPDATE '.rg_table('route_steps').' SET status=\'pending\',completed_at=NULL WHERE id=? AND workspace_id=?')->execute([$a['route_step_id'],$workspace]);$attention=$status==='missed'?'missed':'cancelled';$pdo->prepare('UPDATE '.rg_table('routes').' SET status=\'active\',attention_reason=?,return_reason=? WHERE id=? AND workspace_id=?')->execute([$attention,$reason,$routeId,$workspace]);rg_log($pdo,$workspace,$routeId,$attention,$status==='missed'?'Отмечена неявка. Создана задача координатору.':'Запись отменена. Подберите новое время.',$author);$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        rg_flash('warning',$action==='miss_appointment'?'Неявка отмечена. Маршрут возвращён в работу.':'Запись отменена. Подберите новое время.');
    } elseif ($action === 'attach_demo_document') {
        $ensureRoute();$pdo->prepare('UPDATE '.rg_table('route_steps').' SET document_label=\'Синтетический демодокумент · не медицинский файл\' WHERE route_id=? AND workspace_id=? AND confirmation_required=1')->execute([$routeId,$workspace]);rg_log($pdo,$workspace,$routeId,'document','Добавлена синтетическая демозаглушка документа.',$author);rg_recalculate_route($pdo,$routeId,$workspace);rg_flash('success','Демодокумент добавлен. Теперь маршрут можно завершить.');
    } elseif ($action === 'comment') {
        $ensureRoute();$body=trim((string)($_POST['body']??''));if(mb_strlen($body)<2||mb_strlen($body)>500)throw new RuntimeException('Комментарий должен содержать от 2 до 500 символов.');$pdo->prepare('INSERT INTO '.rg_table('comments').' (workspace_id,route_id,body,author,created_at) VALUES (?,?,?,?,?)')->execute([$workspace,$routeId,$body,$author,date('Y-m-d H:i:s')]);rg_log($pdo,$workspace,$routeId,'comment','Добавлен комментарий.',$author);rg_flash('success','Комментарий добавлен.');
    } elseif ($action === 'save_call_result') {
        $route = $ensureRoute();
        $outcome = (string)($_POST['outcome'] ?? '');
        $labels = [
            'reached' => 'Контакт установлен',
            'slot_agreed' => 'Время согласовано',
            'callback' => 'Нужно перезвонить',
            'no_answer' => 'Нет ответа',
            'declined' => 'Пациент отказался от продолжения разговора',
        ];
        if (!isset($labels[$outcome])) throw new RuntimeException('Выберите результат звонка.');
        $note = trim((string)($_POST['call_note'] ?? ''));
        if (mb_strlen($note) > 500) throw new RuntimeException('Комментарий к звонку не должен превышать 500 символов.');
        $message = 'Демозвонок: ' . $labels[$outcome] . '.';
        if ($note !== '') $message .= ' ' . $note;
        rg_log($pdo, $workspace, $routeId, 'demo_call', $message, $author);
        $comment = $pdo->prepare('INSERT INTO ' . rg_table('comments') . ' (workspace_id,route_id,body,author,created_at) VALUES (?,?,?,?,?)');
        $comment->execute([$workspace, $routeId, 'Результат звонка: ' . $labels[$outcome] . ($note !== '' ? '. ' . $note : '.'), $author, date('Y-m-d H:i:s')]);
        if (in_array($outcome, ['reached', 'slot_agreed'], true) && $route['attention_reason'] === 'no_confirmation') {
            $pdo->prepare('UPDATE ' . rg_table('routes') . ' SET attention_reason=NULL WHERE id=? AND workspace_id=?')->execute([$routeId, $workspace]);
        }
        $next = match ($outcome) {
            'slot_agreed' => 'Теперь выберите подтверждённый слот и оформите запись.',
            'callback' => 'Договорённость о повторном контакте сохранена.',
            'no_answer' => 'Попытка контакта сохранена. Маршрут остаётся в работе.',
            'declined' => 'Результат сохранён. Проверьте дальнейшее действие с ответственным.',
            default => 'Результат звонка сохранён в истории маршрута.',
        };
        rg_flash('success', $next);
    } elseif ($action === 'demo_call') {
        $ensureRoute();rg_log($pdo,$workspace,$routeId,'demo_call','Отмечен демонстрационный звонок: контакт установлен.',$author);$pdo->prepare('UPDATE '.rg_table('routes').' SET attention_reason=CASE WHEN attention_reason=\'no_confirmation\' THEN NULL ELSE attention_reason END WHERE id=? AND workspace_id=?')->execute([$routeId,$workspace]);rg_flash('success','Результат демозвонка сохранён в истории.');
    } elseif ($action === 'create_route') {
        $patientId=(int)($_POST['patient_id']??0);$title=trim((string)($_POST['step_title']??''));$conclusion=trim((string)($_POST['conclusion']??''));$studyType=trim((string)($_POST['study_type']??''));$days=max(1,min(60,(int)($_POST['due_days']??7)));$assignee=trim((string)($_POST['assignee']??''));
        if(!$patientId||mb_strlen($title)<3||mb_strlen($conclusion)<10||mb_strlen($studyType)<3)throw new RuntimeException('Заполните обязательные поля маршрута.');
        $p=$pdo->prepare('SELECT * FROM '.rg_table('patients').' WHERE id=? AND workspace_id=?');$p->execute([$patientId,$workspace]);$patient=$p->fetch();if(!$patient)throw new RuntimeException('Пациент не найден.');
        if($patient['code']==='P015'){$dup=$pdo->prepare('SELECT r.id FROM '.rg_table('routes').' r JOIN '.rg_table('studies').' s ON s.id=r.study_id WHERE r.patient_id=? AND r.workspace_id=? AND r.status IN (\'draft\',\'active\') LIMIT 1');$dup->execute([$patientId,$workspace]);if($dup->fetchColumn())throw new RuntimeException('По этому исследованию уже существует активный маршрут. Дубликат не создан.');}
        $due=(new DateTimeImmutable(rg_demo_date()))->modify('+'.$days.' days')->format('Y-m-d');$studyUid='MG-NEW-'.date('ymd').'-'.strtoupper(substr(bin2hex(random_bytes(4)),0,6));$pdo->beginTransaction();try{$pdo->prepare('INSERT INTO '.rg_table('studies').' (workspace_id,patient_id,study_uid,study_type,study_date,conclusion) VALUES (?,?,?,?,?,?)')->execute([$workspace,$patientId,$studyUid,$studyType,rg_demo_date(),$conclusion]);$studyId=(int)$pdo->lastInsertId();$pdo->prepare('INSERT INTO '.rg_table('routes').' (workspace_id,patient_id,study_id,status,assigned_to,attention_reason,due_date,created_at) VALUES (?,?,?,\'draft\',?,\'no_confirmation\',?,?)')->execute([$workspace,$patientId,$studyId,$assignee,$due,date('Y-m-d H:i:s')]);$newRoute=(int)$pdo->lastInsertId();$svc=$pdo->prepare('SELECT id FROM '.rg_table('services').' WHERE workspace_id=? ORDER BY id LIMIT 1');$svc->execute([$workspace]);$serviceId=(int)$svc->fetchColumn();$pdo->prepare('INSERT INTO '.rg_table('route_steps').' (workspace_id,route_id,sequence_no,title,service_id,status,required,confirmation_required,due_date) VALUES (?,?,1,?,?,\'pending\',1,0,?)')->execute([$workspace,$newRoute,$title,$serviceId,$due]);rg_log($pdo,$workspace,$newRoute,'route_created','Создан новый маршрут по исследованию '.$studyUid.'.',$author);$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}rg_flash('success','Маршрут создан как черновик.');rg_redirect('index.php?page=route&id='.$newRoute);
    } else {
        throw new RuntimeException('Неизвестное действие.');
    }

    rg_redirect('index.php?page=route&id=' . $routeId);
} catch (Throwable $e) {
    rg_flash('danger', $e->getMessage());
    $target = 'index.php?page=login';
    if (rg_user()) {
        $routeId = (int)($_POST['route_id'] ?? 0);
        $target = $routeId ? 'index.php?page=route&id=' . $routeId : 'index.php?page=' . (($_POST['action'] ?? '') === 'create_route' ? 'create' : 'overview');
    }
    rg_redirect($target);
}
