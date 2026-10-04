<?php
declare(strict_types=1);

final class RouteRepository
{
    public function __construct(private PDO $pdo, private string $workspaceId) {}

    public function refresh(): void
    {
        $stmt = $this->pdo->prepare('SELECT id FROM ' . rg_table('routes') . ' WHERE workspace_id = ?');
        $stmt->execute([$this->workspaceId]);
        foreach ($stmt->fetchAll() as $row) {
            rg_recalculate_route($this->pdo, (int)$row['id'], $this->workspaceId);
        }
    }

    public function counts(): array
    {
        $this->refresh();
        $sql = 'SELECT COUNT(*) total, SUM(CASE WHEN status = \'draft\' THEN 1 ELSE 0 END) draft, SUM(CASE WHEN status = \'active\' THEN 1 ELSE 0 END) active, SUM(CASE WHEN attention_reason IS NOT NULL THEN 1 ELSE 0 END) attention, SUM(CASE WHEN attention_reason = \'overdue\' THEN 1 ELSE 0 END) overdue, SUM(CASE WHEN status = \'completed\' THEN 1 ELSE 0 END) completed FROM ' . rg_table('routes') . ' WHERE workspace_id = ?';
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([$this->workspaceId]);
        $result = $stmt->fetch() ?: [];
        $next = $this->pdo->prepare('SELECT COUNT(*) FROM ' . rg_table('appointments') . ' a JOIN ' . rg_table('schedule_slots') . ' s ON s.id = a.slot_id WHERE a.workspace_id = ? AND a.status = \'scheduled\' AND s.starts_at >= ?');
        $next->execute([$this->workspaceId, rg_demo_date() . ' 00:00:00']);
        $result['appointments'] = (int)$next->fetchColumn();
        return array_map('intval', $result);
    }

    public function list(array $filters = []): array
    {
        $this->refresh();
        $where = ['r.workspace_id = ?'];
        $params = [$this->workspaceId];
        if (!empty($filters['q'])) {
            $where[] = '(p.full_name LIKE ? OR p.code LIKE ?)';
            $params[] = '%' . $filters['q'] . '%';
            $params[] = '%' . $filters['q'] . '%';
        }
        if (!empty($filters['status'])) {
            $where[] = 'r.status = ?';
            $params[] = $filters['status'];
        }
        if (!empty($filters['attention'])) {
            $where[] = 'r.attention_reason = ?';
            $params[] = $filters['attention'];
        }
        if (!empty($filters['assignee'])) {
            $where[] = 'r.assigned_to = ?';
            $params[] = $filters['assignee'];
        }
        if (!empty($filters['due'])) {
            if ($filters['due'] === 'overdue') { $where[] = 'r.due_date < ?'; $params[] = rg_demo_date(); }
            if ($filters['due'] === 'today') { $where[] = 'r.due_date = ?'; $params[] = rg_demo_date(); }
            if ($filters['due'] === 'week') { $where[] = 'r.due_date BETWEEN ? AND ?'; $params[] = rg_demo_date(); $params[] = (new DateTimeImmutable(rg_demo_date()))->modify('+7 days')->format('Y-m-d'); }
        }
        if (!empty($filters['quick'])) {
            if ($filters['quick'] === 'attention') $where[] = 'r.attention_reason IS NOT NULL';
            if ($filters['quick'] === 'overdue') $where[] = "r.attention_reason = 'overdue'";
            if ($filters['quick'] === 'completed') $where[] = "r.status = 'completed'";
            if ($filters['quick'] === 'today') {
                $where[] = 'EXISTS (SELECT 1 FROM ' . rg_table('route_steps') . ' sx WHERE sx.route_id=r.id AND sx.workspace_id=r.workspace_id AND sx.due_date=?)';
                $params[] = rg_demo_date();
            }
        }
        $sorts = ['due' => 'r.due_date ASC', 'patient' => 'p.full_name ASC', 'status' => 'r.status ASC', 'new' => 'r.created_at DESC'];
        $order = $sorts[$filters['sort'] ?? 'due'] ?? $sorts['due'];
        $sql = 'SELECT r.*, p.code, p.full_name, p.birth_date, s.study_type, rs.title step_title, rs.status step_status, a.status appointment_status, sl.starts_at appointment_at FROM ' . rg_table('routes') . ' r JOIN ' . rg_table('patients') . ' p ON p.id=r.patient_id JOIN ' . rg_table('studies') . ' s ON s.id=r.study_id LEFT JOIN ' . rg_table('route_steps') . ' rs ON rs.route_id=r.id AND rs.workspace_id=r.workspace_id AND rs.sequence_no=(SELECT MIN(sequence_no) FROM ' . rg_table('route_steps') . ' WHERE route_id=r.id AND status != \'completed\') LEFT JOIN ' . rg_table('appointments') . ' a ON a.route_step_id=rs.id AND a.status=\'scheduled\' LEFT JOIN ' . rg_table('schedule_slots') . ' sl ON sl.id=a.slot_id WHERE ' . implode(' AND ', $where) . ' ORDER BY ' . $order;
        if (!empty($filters['paginate'])) {
            $page = max(1, (int)($filters['page_no'] ?? 1));
            $sql .= ' LIMIT 11 OFFSET ' . (($page - 1) * 10);
        }
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT r.*, p.code, p.full_name, p.birth_date, s.study_uid, s.study_type, s.study_date, s.conclusion FROM ' . rg_table('routes') . ' r JOIN ' . rg_table('patients') . ' p ON p.id=r.patient_id JOIN ' . rg_table('studies') . ' s ON s.id=r.study_id WHERE r.id=? AND r.workspace_id=?');
        $stmt->execute([$id, $this->workspaceId]);
        $route = $stmt->fetch();
        if (!$route) return null;
        $stmt = $this->pdo->prepare('SELECT rs.*, sv.name service_name FROM ' . rg_table('route_steps') . ' rs LEFT JOIN ' . rg_table('services') . ' sv ON sv.id=rs.service_id WHERE rs.route_id=? AND rs.workspace_id=? ORDER BY rs.sequence_no');
        $stmt->execute([$id, $this->workspaceId]);
        $route['steps'] = $stmt->fetchAll();
        $stmt = $this->pdo->prepare('SELECT a.*, sl.starts_at, f.name facility_name, sp.full_name specialist_name, sv.name service_name FROM ' . rg_table('appointments') . ' a JOIN ' . rg_table('route_steps') . ' rs ON rs.id=a.route_step_id JOIN ' . rg_table('schedule_slots') . ' sl ON sl.id=a.slot_id JOIN ' . rg_table('facilities') . ' f ON f.id=sl.facility_id JOIN ' . rg_table('specialists') . ' sp ON sp.id=sl.specialist_id JOIN ' . rg_table('services') . ' sv ON sv.id=sl.service_id WHERE rs.route_id=? AND a.workspace_id=? ORDER BY sl.starts_at DESC');
        $stmt->execute([$id, $this->workspaceId]);
        $route['appointments'] = $stmt->fetchAll();
        $stmt = $this->pdo->prepare('SELECT * FROM ' . rg_table('comments') . ' WHERE route_id=? AND workspace_id=? ORDER BY created_at DESC');
        $stmt->execute([$id, $this->workspaceId]);
        $route['comments'] = $stmt->fetchAll();
        $stmt = $this->pdo->prepare('SELECT * FROM ' . rg_table('event_log') . ' WHERE route_id=? AND workspace_id=? ORDER BY created_at DESC');
        $stmt->execute([$id, $this->workspaceId]);
        $route['events'] = $stmt->fetchAll();
        $serviceId = 0;
        foreach ($route['steps'] as $step) if ($step['status'] !== 'completed') { $serviceId = (int)$step['service_id']; break; }
        $stmt = $this->pdo->prepare('SELECT sl.*, f.name facility_name, sp.full_name specialist_name, sv.name service_name FROM ' . rg_table('schedule_slots') . ' sl JOIN ' . rg_table('facilities') . ' f ON f.id=sl.facility_id JOIN ' . rg_table('specialists') . ' sp ON sp.id=sl.specialist_id JOIN ' . rg_table('services') . ' sv ON sv.id=sl.service_id WHERE sl.workspace_id=? AND sl.status=\'free\' AND sl.starts_at >= ? AND (?=0 OR sl.service_id=?) ORDER BY sl.starts_at LIMIT 8');
        $stmt->execute([$this->workspaceId, rg_demo_date() . ' 00:00:00', $serviceId, $serviceId]);
        $route['slots'] = $stmt->fetchAll();
        return $route;
    }

    public function events(int $limit = 30): array
    {
        $stmt = $this->pdo->prepare('SELECT e.*, p.code, p.full_name FROM ' . rg_table('event_log') . ' e LEFT JOIN ' . rg_table('routes') . ' r ON r.id=e.route_id LEFT JOIN ' . rg_table('patients') . ' p ON p.id=r.patient_id WHERE e.workspace_id=? ORDER BY e.created_at DESC LIMIT ' . max(1, min(100, $limit)));
        $stmt->execute([$this->workspaceId]);
        return $stmt->fetchAll();
    }

    public function schedule(array $filters = []): array
    {
        $where = ['sl.workspace_id=?', 'sl.starts_at >= ?', 'sl.starts_at < ?'];
        $params = [$this->workspaceId, rg_demo_date() . ' 00:00:00', (new DateTimeImmutable(rg_demo_date()))->modify('+31 days')->format('Y-m-d') . ' 00:00:00'];
        foreach (['service_id'=>'sl.service_id','facility_id'=>'sl.facility_id','specialist_id'=>'sl.specialist_id'] as $key=>$field) if (!empty($filters[$key])) { $where[]="$field=?"; $params[]=(int)$filters[$key]; }
        $stmt = $this->pdo->prepare('SELECT sl.*, sv.name service_name, f.name facility_name, sp.full_name specialist_name FROM ' . rg_table('schedule_slots') . ' sl JOIN ' . rg_table('services') . ' sv ON sv.id=sl.service_id JOIN ' . rg_table('facilities') . ' f ON f.id=sl.facility_id JOIN ' . rg_table('specialists') . ' sp ON sp.id=sl.specialist_id WHERE ' . implode(' AND ', $where) . ' ORDER BY sl.starts_at LIMIT 180');
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function options(string $table): array
    {
        $field = $table === 'facilities' ? 'name' : ($table === 'services' ? 'name' : 'full_name');
        $stmt = $this->pdo->prepare('SELECT id, ' . $field . ' name FROM ' . rg_table($table) . ' WHERE workspace_id=? ORDER BY name');
        $stmt->execute([$this->workspaceId]);
        return $stmt->fetchAll();
    }

    public function completedByDay(): array
    {
        $stmt = $this->pdo->prepare('SELECT substr(completed_at,1,10) day, COUNT(*) total FROM ' . rg_table('route_steps') . ' WHERE workspace_id=? AND completed_at IS NOT NULL GROUP BY substr(completed_at,1,10) ORDER BY day');
        $stmt->execute([$this->workspaceId]);
        return $stmt->fetchAll();
    }
}
