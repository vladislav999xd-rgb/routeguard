import {
  createContext,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileText,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  MessageSquareText,
  Phone,
  PhoneCall,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Settings,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  X,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, formatDate, post, Session } from './api'

type Priority = { score: number; level: string; label: string; reason: string }
type RouteRow = {
  id: number
  patient_code: string
  patient_name: string
  birth_date: string
  study_type: string
  study_id: number
  assignee: number | null
  assignee_name: string | null
  status: string
  status_label: string
  attention_reason: string
  attention_label: string
  due_date: string
  priority: Priority
  next_step: null | { id: number; title: string; status: string; due_date: string; service_id: number }
}
type Slot = {
  id: number
  starts_at: string
  status: string
  service: number
  service_name: string
  specialist_name: string
  facility_name: string
  facility_address: string
}
type Employee = { id: number; full_name: string; role: string }
type Task = {
  id: number
  route_id: number
  patient_code: string
  patient_name: string
  title: string
  kind: string
  due_at: string
  status: string
  assignee_name: string | null
}
type RouteDetail = RouteRow & {
  conclusion: string
  study_date: string
  steps: Array<{
    id: number
    title: string
    service: number
    service_name: string
    status: string
    due_date: string
    confirmation_required: boolean
    appointments: Array<{ id: number; status: string; reason: string; slot: Slot }>
    documents: Array<{ id: number; label: string }>
  }>
  tasks: Task[]
  events: Array<{ id: number; message: string; author: string; occurred_at: string; demo_date: string }>
  comments: Array<{ id: number; author: string; body: string; created_at: string }>
  call_assistant: {
    scenario: string
    goal: string
    step: string
    due: string
    appointment: string | null
    opening: string
    questions: string[]
    offer: string
    closing: string
    full_text: string
    disclaimer: string
  }
}
type DashboardData = {
  summary: { total: number; active: number; completed: number; attention: number; tasks_due: number; calls_today?: number }
  status_counts: Record<string, number>
  attention_counts: Record<string, number>
  priority_routes: RouteRow[]
}

const SessionContext = createContext<{ session: Session | null; refresh: () => Promise<void> }>({
  session: null,
  refresh: async () => undefined,
})
const useSession = () => useContext(SessionContext)

function RouteMark() {
  return <svg className="route-mark" viewBox="0 0 38 38" aria-hidden="true">
    <path d="M8 29 19 19 29 8M8 10l11 9 11 10" />
    <circle cx="8" cy="10" r="4" />
    <circle cx="8" cy="29" r="4" />
    <circle cx="29" cy="8" r="4" />
    <circle cx="30" cy="29" r="4" />
    <circle cx="19" cy="19" r="4" />
  </svg>
}

function Brand({ subtitle }: { subtitle?: string }) {
  return <span className="brand"><RouteMark /><span><b>RouteGuard</b>{subtitle && <small>{subtitle}</small>}</span></span>
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function ageFromBirthDate(value?: string) {
  if (!value) return null
  const born = new Date(value)
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) age--
  return age
}

function isoDay(value: string) {
  return value.slice(0, 10)
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function Loading({ rows = 5 }: { rows?: number }) {
  return <div className="skeletons" aria-label="Загрузка">{Array.from({ length: rows }, (_, index) => <div className="skeleton" key={index} />)}</div>
}

function ErrorState({ error, retry }: { error: string; retry?: () => void }) {
  return <div className="empty error"><TriangleAlert /><h3>Не удалось загрузить данные</h3><p>{error}</p>{retry && <button className="button secondary" onClick={retry}><RefreshCw size={16} />Повторить</button>}</div>
}

function Empty({ text, detail = 'Здесь появятся данные после соответствующего действия.' }: { text: string; detail?: string }) {
  return <div className="empty"><Check /><h3>{text}</h3><p>{detail}</p></div>
}

function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    setError('')
    loader().then((value) => live && setData(value)).catch((reason: Error) => live && setError(reason.message))
    return () => { live = false }
  }, [...deps, tick])
  return { data, error, reload: () => setTick((value) => value + 1) }
}

function Landing() {
  const navigate = useNavigate()
  const { session, refresh } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const openDemo = async () => {
    setBusy(true)
    setError('')
    try {
      await post('/demo/open/')
      await refresh()
      navigate('/app')
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return <main className="landing">
    <nav className="landing-nav"><Brand /><div><a href="#capabilities">Возможности</a><a href="#workflow">Как работает</a><a href="/app" className="button ghost">Войти</a></div></nav>
    <section className="hero">
      <div className="hero-copy"><span className="eyebrow">Координация маршрутов пациентов</span><h1>Следующий шаг всегда под контролем</h1><p>RouteGuard объединяет маршруты, записи, звонки и задачи координатора в спокойном рабочем интерфейсе. Без клинических решений — только прозрачная организация процесса.</p><div className="hero-actions"><button className="button primary large" onClick={openDemo} disabled={busy}>{busy ? 'Готовим демо…' : session?.workspace ? 'Продолжить демо' : 'Открыть демо'}<ArrowRight size={18} /></button><a className="button secondary large" href="#workflow">Посмотреть процесс</a></div>{error && <p className="inline-error">{error}</p>}<div className="trust"><span><ShieldCheck />Изолированные демоданные</span><span><Check />20 сценариев</span><span><Activity />Объяснимый приоритет</span></div></div>
      <ProductPreview />
    </section>
    <section className="landing-section" id="capabilities"><span className="section-kicker">Рабочий контур</span><h2>Всё необходимое координатору — без визуального шума</h2><div className="features"><div><PhoneCall /><h3>Помощник звонка</h3><p>Готовый организационный сценарий, фиксация результата и задача перезвона.</p></div><div><ListTodo /><h3>Очередь действий</h3><p>Сроки, отмены, неявки и документы собраны в понятном приоритете.</p></div><div><CalendarDays /><h3>Безопасная запись</h3><p>Система проверяет слот и параллельные изменения перед сохранением.</p></div></div></section>
    <section className="workflow-section" id="workflow"><div><span className="section-kicker">Пользовательский путь</span><h2>От сигнала до следующего действия</h2></div><ol><li><b>01</b><span><strong>Увидеть приоритет</strong><small>Причина внимания отображается рядом со сроком.</small></span></li><li><b>02</b><span><strong>Открыть маршрут</strong><small>Шаги, задачи и документы доступны в одной карточке.</small></span></li><li><b>03</b><span><strong>Зафиксировать результат</strong><small>Запись или повторный звонок попадает в историю.</small></span></li></ol></section>
    <footer><Brand /><span>Самостоятельный демонстрационный продукт · данные синтетические</span></footer>
  </main>
}

function ProductPreview() {
  const people = ['Анна Лебедева', 'Марина Соколова', 'Ольга Белова']
  return <div className="product-preview" aria-label="Пример рабочего интерфейса"><div className="preview-sidebar"><Brand /><span className="active"><LayoutDashboard />Обзор</span><span><RouteIcon />Маршруты</span><span><ListTodo />Задачи</span></div><div className="preview-work"><div className="preview-search"><Search />Поиск по пациентам</div><h3>Рабочий день</h3><div className="preview-metrics"><b>20<small>в работе</small></b><b>5<small>требуют внимания</small></b><b>3<small>звонка сегодня</small></b></div>{people.map((person, index) => <div className={index === 0 ? 'preview-row selected' : 'preview-row'} key={person}><span className="avatar">{initials(person)}</span><b>{person}<small>P00{index + 1}</small></b><span>{index === 0 ? 'Повторная запись' : 'Подтвердить визит'}</span><time>{index === 2 ? '12 октября' : 'Сегодня'}</time></div>)}</div></div>
}

const mainNav = [
  ['/app', 'Обзор', LayoutDashboard],
  ['/app/routes', 'Маршруты', RouteIcon],
  ['/app/tasks', 'Задачи', ListTodo],
  ['/app/schedule', 'Расписание', CalendarDays],
  ['/app/analytics', 'Аналитика', BarChart3],
] as const

function AppShell({ children }: { children: ReactNode }) {
  const { session, refresh } = useSession()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    navigate(`/app/routes?search=${encodeURIComponent(query.trim())}`)
  }
  const logout = async () => {
    await post('/auth/logout/')
    await refresh()
    navigate('/')
  }
  const userName = session?.user?.name ?? 'Гость демо'
  return <div className="shell">
    <aside className={open ? 'sidebar open' : 'sidebar'}>
      <div className="sidebar-top"><Brand subtitle={session?.workspace?.kind === 'demo' ? 'ДЕМО · 20 пациентов' : session?.workspace?.name} /><button className="icon-button close-menu" onClick={() => setOpen(false)} aria-label="Закрыть меню"><X /></button></div>
      <nav className="primary-nav">{mainNav.map(([url, label, Icon]) => <NavLink key={url} to={url} end={url === '/app'} onClick={() => setOpen(false)}><Icon />{label}</NavLink>)}</nav>
      <nav className="secondary-nav"><NavLink to="/app/scenarios" onClick={() => setOpen(false)}><ClipboardCheck />Сценарии</NavLink><NavLink to="/app/settings" onClick={() => setOpen(false)}><Settings />Настройки</NavLink><button onClick={logout}><LogOut />Выйти</button></nav>
    </aside>
    {open && <button className="backdrop" onClick={() => setOpen(false)} aria-label="Закрыть меню" />}
    <div className="content">
      <header className="topbar"><button className="icon-button menu" onClick={() => setOpen(true)} aria-label="Открыть меню"><Menu /></button><form className="global-search" onSubmit={submitSearch}><Search /><label className="sr-only" htmlFor="global-search">Поиск</label><input id="global-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по пациентам, задачам, коду…" /></form><NavLink className="top-user" to="/app/settings"><span className="avatar">{initials(userName)}</span><span><b>{userName}</b><small>{session?.authenticated ? 'Сотрудник' : 'Деморежим'}</small></span><ChevronDown /></NavLink></header>
      <main className="page">{children}</main>
    </div>
  </div>
}

type QueueFilter = 'all' | 'attention' | 'today' | 'week'

function filterRoutes(rows: RouteRow[], filter: QueueFilter, today: string) {
  if (filter === 'attention') return rows.filter((row) => Boolean(row.attention_reason))
  if (filter === 'today') return rows.filter((row) => isoDay(row.due_date) <= today && row.status !== 'completed')
  if (filter === 'week') return rows.filter((row) => isoDay(row.due_date) >= today && isoDay(row.due_date) <= addDays(today, 7))
  return rows
}

function Dashboard() {
  const { session } = useSession()
  const today = session?.workspace?.demo_date ?? new Date().toISOString().slice(0, 10)
  const { data, error, reload } = useLoad<{ dashboard: DashboardData; routes: RouteRow[] }>(async () => {
    const [dashboard, routes] = await Promise.all([api<DashboardData>('/dashboard/'), api<RouteRow[]>('/routes/')])
    return { dashboard, routes }
  })
  const [filter, setFilter] = useState<QueueFilter>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  if (error) return <ErrorState error={error} retry={reload} />
  if (!data) return <Loading />
  const rows = filterRoutes(data.routes, filter, today)
  const counts = {
    all: data.routes.length,
    attention: filterRoutes(data.routes, 'attention', today).length,
    today: filterRoutes(data.routes, 'today', today).length,
    week: filterRoutes(data.routes, 'week', today).length,
  }
  return <div className={selectedId ? 'workbench drawer-open' : 'workbench'}>
    <div className="workspace-main">
      <PageHead title="Рабочий день" date={today} />
      <MetricsStrip active={data.dashboard.summary.active} attention={data.dashboard.summary.attention} calls={data.dashboard.summary.calls_today ?? 0} />
      <QueueTabs active={filter} counts={counts} onChange={setFilter} />
      <section className="queue-surface">{rows.length ? <RouteTable rows={rows} selectedId={selectedId} onSelect={setSelectedId} /> : <Empty text="В этой группе маршрутов нет" />}</section>
    </div>
    {selectedId && <PatientDrawer routeId={selectedId} onClose={() => setSelectedId(null)} />}
  </div>
}

function PageHead({ title, text, eyebrow, date, action }: { title: string; text?: string; eyebrow?: string; date?: string; action?: ReactNode }) {
  return <div className="page-head"><div>{eyebrow && <span className="section-kicker">{eyebrow}</span>}<div className="title-line"><h1>{title}</h1>{date && <span className="head-date"><CalendarDays />{formatDate(date)}</span>}</div>{text && <p>{text}</p>}</div>{action}</div>
}

function MetricsStrip({ active, attention, calls }: { active: number; attention: number; calls: number }) {
  return <div className="metrics-strip"><div><RouteIcon /><strong>{active}</strong><span><b>маршрутов</b><small>в работе</small></span></div><div className="attention-metric"><TriangleAlert /><strong>{attention}</strong><span><b>требуют внимания</b><small>есть организационные риски</small></span></div><div><Phone /><strong>{calls}</strong><span><b>звонков сегодня</b><small>запланировано</small></span></div></div>
}

function QueueTabs({ active, counts, onChange }: { active: QueueFilter; counts: Record<QueueFilter, number>; onChange: (filter: QueueFilter) => void }) {
  const items: Array<[QueueFilter, string]> = [['all', 'Все пациенты'], ['attention', 'Требуют внимания'], ['today', 'Сегодня'], ['week', 'На этой неделе']]
  return <div className="queue-tabs" role="tablist" aria-label="Фильтр очереди">{items.map(([value, label]) => <button role="tab" aria-selected={active === value} className={active === value ? 'active' : ''} onClick={() => onChange(value)} key={value}>{label}<span className={value === 'attention' && counts[value] ? 'count danger-count' : 'count'}>{counts[value]}</span></button>)}</div>
}

function duePresentation(row: RouteRow, today: string) {
  const overdue = isoDay(row.due_date) < today && row.status !== 'completed'
  const dueToday = isoDay(row.due_date) === today && row.status !== 'completed'
  return { overdue, dueToday, label: overdue ? 'Просрочен' : dueToday ? 'Сегодня' : formatDate(row.due_date) }
}

function RouteTable({ rows, selectedId, onSelect }: { rows: RouteRow[]; selectedId?: number | null; onSelect?: (id: number) => void }) {
  const { session } = useSession()
  const today = session?.workspace?.demo_date ?? new Date().toISOString().slice(0, 10)
  const navigate = useNavigate()
  const choose = (row: RouteRow) => onSelect ? onSelect(row.id) : navigate(`/app/routes/${row.id}`)
  const onRowKey = (event: KeyboardEvent<HTMLTableRowElement>, row: RouteRow) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(row) }
  }
  return <div className="table-wrap"><table className="route-table"><thead><tr><th>Пациент</th><th>Следующий шаг</th><th>Срок</th><th>Ответственный</th><th><span className="sr-only">Открыть</span></th></tr></thead><tbody>{rows.map((row) => {
    const due = duePresentation(row, today)
    return <tr key={row.id} className={selectedId === row.id ? 'selected' : ''} tabIndex={0} aria-label={`Открыть маршрут ${row.patient_name}`} onClick={() => choose(row)} onKeyDown={(event) => onRowKey(event, row)}><td data-label="Пациент"><div className="patient-cell"><span className="avatar patient-avatar">{initials(row.patient_name)}</span><span><b>{row.patient_name}</b><small>{row.patient_code} · {row.study_type}</small></span></div></td><td data-label="Следующий шаг"><div className="step-cell"><span className="cell-icon">{row.attention_reason === 'no_document' ? <FileText /> : row.attention_reason === 'cancelled' || row.attention_reason === 'missed' ? <Phone /> : <ClipboardCheck />}</span><span><b>{row.next_step?.title ?? 'Все шаги выполнены'}</b><small>{row.attention_label || row.status_label}</small></span></div></td><td data-label="Срок"><span className={due.overdue ? 'due overdue' : due.dueToday ? 'due today' : 'due'}><b>{due.label}</b>{(due.overdue || due.dueToday) && <small>{formatDate(row.due_date)}</small>}</span></td><td data-label="Ответственный"><div className="assignee-cell"><span className="avatar tiny">{row.assignee_name ? initials(row.assignee_name) : '—'}</span><span><b>{row.assignee_name ?? 'Не назначен'}</b><small>{row.assignee_name ? 'Координатор' : 'Требуется действие'}</small></span></div></td><td><button className="row-open" onClick={(event) => { event.stopPropagation(); onSelect ? onSelect(row.id) : navigate(`/app/routes/${row.id}`) }} aria-label={`Открыть ${row.patient_name}`}><ChevronRight /></button></td></tr>
  })}</tbody></table></div>
}

function PatientDrawer({ routeId, onClose }: { routeId: number; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: route, error, reload } = useLoad<RouteDetail>(() => api(`/routes/${routeId}/`), [routeId])
  const [tab, setTab] = useState<'route' | 'tasks' | 'files' | 'notes'>('route')
  useEffect(() => setTab('route'), [routeId])
  return <aside className="patient-drawer" aria-label="Карточка пациента"><div className="drawer-mobile-head"><button className="icon-button" onClick={onClose}><ArrowLeft /><span>Назад</span></button></div>{error ? <ErrorState error={error} retry={reload} /> : !route ? <Loading /> : <><header className="patient-header"><span className="avatar patient-large">{initials(route.patient_name)}</span><div><h2>{route.patient_name}</h2><p>{route.patient_code} · {ageFromBirthDate(route.birth_date)} лет · {route.study_type}</p></div><button className="icon-button drawer-close" onClick={onClose} aria-label="Закрыть карточку"><X /></button></header><div className="patient-quick"><span><RouteIcon />{route.status_label}</span>{route.assignee_name && <span><UserRound />{route.assignee_name}</span>}</div><div className="drawer-tabs" role="tablist">{([['route', 'Маршрут'], ['tasks', 'Задачи'], ['files', 'Файлы'], ['notes', 'Заметки']] as const).map(([value, label]) => <button role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{label}{value === 'tasks' && route.tasks.filter((task) => task.status === 'open').length > 0 && <span>{route.tasks.filter((task) => task.status === 'open').length}</span>}</button>)}</div><div className="drawer-body">{tab === 'route' && <DrawerRoute route={route} onOpen={() => navigate(`/app/routes/${route.id}`)} />}{tab === 'tasks' && <DrawerTasks route={route} />}{tab === 'files' && <DrawerFiles route={route} />}{tab === 'notes' && <DrawerNotes route={route} />}</div></>}</aside>
}

function DrawerRoute({ route, onOpen }: { route: RouteDetail; onOpen: () => void }) {
  const currentIndex = Math.max(0, route.steps.findIndex((step) => step.status !== 'completed'))
  const appointments = route.steps.flatMap((step) => step.appointments.filter((item) => item.status === 'scheduled'))
  return <><div className="drawer-section-title"><div><h3>Текущий маршрут</h3><p>{route.steps.filter((step) => step.status === 'completed').length} из {route.steps.length} этапов</p></div><span>{route.status_label}</span></div><div className="route-progress">{route.steps.map((step, index) => <div className={step.status === 'completed' ? 'progress-step completed' : index === currentIndex ? 'progress-step current' : 'progress-step future'} key={step.id}><span className="progress-dot">{step.status === 'completed' ? <Check /> : index + 1}</span><div><b>{step.title}</b><small>{step.status === 'completed' ? `Завершён · ${formatDate(step.due_date)}` : index === currentIndex ? 'Текущий этап' : `Срок · ${formatDate(step.due_date)}`}</small>{index === currentIndex && <div className="next-action"><CalendarDays /><span><b>{step.service_name}</b><small>{route.attention_label || 'Готов к следующему действию'}</small></span><ChevronRight /></div>}</div></div>)}</div>{route.next_step && <button className="button primary drawer-action" onClick={onOpen}><CalendarDays />Подобрать время</button>}<div className="upcoming"><div className="drawer-section-title"><h3>Ближайшие даты</h3><button onClick={onOpen}>Все действия<ArrowRight /></button></div>{appointments.length ? appointments.slice(0, 3).map((appointment) => <div className="upcoming-row" key={appointment.id}><i /><span><b>{formatDate(appointment.slot.starts_at, true)}</b><small>{appointment.slot.facility_name}</small></span></div>) : route.tasks.filter((task) => task.status === 'open').slice(0, 3).map((task) => <div className="upcoming-row" key={task.id}><i /><span><b>{formatDate(task.due_at, true)}</b><small>{task.title}</small></span></div>)}{!appointments.length && !route.tasks.some((task) => task.status === 'open') && <p className="drawer-empty">Ближайших записей и задач нет.</p>}</div></>
}

function DrawerTasks({ route }: { route: RouteDetail }) {
  return <div className="drawer-list"><h3>Задачи по маршруту</h3>{route.tasks.length ? route.tasks.map((task) => <div key={task.id}><span className={task.status === 'done' ? 'mini-status done' : 'mini-status'}>{task.status === 'done' ? <Check /> : <Clock3 />}</span><span><b>{task.title}</b><small>{formatDate(task.due_at, true)} · {task.assignee_name ?? 'Без ответственного'}</small></span></div>) : <Empty text="Задач нет" />}</div>
}

function DrawerFiles({ route }: { route: RouteDetail }) {
  const files = route.steps.flatMap((step) => step.documents.map((document) => ({ ...document, step: step.title })))
  return <div className="drawer-list"><h3>Документы маршрута</h3>{files.length ? files.map((file) => <div key={file.id}><span className="mini-status"><FileText /></span><span><b>{file.label}</b><small>{file.step}</small></span></div>) : <Empty text="Документов пока нет" />}</div>
}

function DrawerNotes({ route }: { route: RouteDetail }) {
  return <div className="drawer-list"><h3>Заметки</h3>{route.comments.length ? route.comments.map((comment) => <div key={comment.id}><span className="mini-status"><MessageSquareText /></span><span><b>{comment.body}</b><small>{comment.author} · {formatDate(comment.created_at, true)}</small></span></div>) : <Empty text="Заметок пока нет" />}</div>
}

function RoutesPage() {
  const [params] = useSearchParams()
  const initialSearch = params.get('search') ?? ''
  const [search, setSearch] = useState(initialSearch)
  const [status, setStatus] = useState('')
  const [attention, setAttention] = useState('')
  const [assignee, setAssignee] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { data: employees } = useLoad<Employee[]>(() => api('/employees/'))
  const { data, error, reload } = useLoad<RouteRow[]>(() => api(`/routes/?search=${encodeURIComponent(search)}&status=${status}&attention_reason=${attention}&assignee=${assignee}`), [search, status, attention, assignee])
  useEffect(() => setSearch(initialSearch), [initialSearch])
  return <div className={selectedId ? 'workbench drawer-open' : 'workbench'}><div className="workspace-main"><PageHead eyebrow="Единый реестр" title="Маршруты пациентов" text="Следующий шаг, срок и ответственный в одной очереди." /><div className="filter-bar"><label className="search field-search"><Search /><span className="sr-only">Поиск маршрута</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ФИО, код пациента или UID" /></label><select aria-label="Статус" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Все статусы</option><option value="draft">Черновики</option><option value="active">В работе</option><option value="completed">Завершены</option></select><select aria-label="Причина внимания" value={attention} onChange={(event) => setAttention(event.target.value)}><option value="">Любая причина</option><option value="overdue">Просрочен</option><option value="cancelled">Отмена</option><option value="missed">Неявка</option><option value="no_slot">Нет слота</option><option value="no_assignee">Нет ответственного</option><option value="no_document">Нет документа</option></select><select aria-label="Ответственный" value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Все сотрудники</option>{employees?.map((employee) => <option value={employee.id} key={employee.id}>{employee.full_name}</option>)}</select></div><section className="queue-surface">{error ? <ErrorState error={error} retry={reload} /> : !data ? <Loading /> : data.length ? <RouteTable rows={data} selectedId={selectedId} onSelect={setSelectedId} /> : <Empty text="Маршруты не найдены" detail="Измените поисковый запрос или фильтры." />}</section></div>{selectedId && <PatientDrawer routeId={selectedId} onClose={() => setSelectedId(null)} />}</div>
}

function RouteDetailPage() {
  const { id } = useParams()
  const { data: route, error, reload } = useLoad<RouteDetail>(() => api(`/routes/${id}/`), [id])
  const { data: employees } = useLoad<Employee[]>(() => api('/employees/'))
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  if (error) return <ErrorState error={error} retry={reload} />
  if (!route) return <Loading rows={6} />
  const act = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true)
    setMessage('')
    try { await fn(); setMessage(success); reload() } catch (reason) { setMessage((reason as Error).message) } finally { setBusy(false) }
  }
  return <><div className="detail-head"><NavLink to="/app/routes" className="back"><ArrowLeft />Все маршруты</NavLink><div><span>{route.patient_code} · {route.study_type}</span><h1>{route.patient_name}</h1><p>Исследование от {formatDate(route.study_date)} · срок маршрута {formatDate(route.due_date)}</p></div><PriorityBadge priority={route.priority} /></div>{message && <div className={message.includes('Не ') || message.includes('нельзя') ? 'notice error-notice' : 'notice'}>{message}</div>}<div className="detail-grid"><div className="detail-main"><section className="panel"><PanelHead title="Маршрут" />{route.status === 'draft' && <button disabled={busy} className="button primary" onClick={() => act(() => post(`/routes/${id}/confirm/`), 'Маршрут подтверждён')}>Подтвердить маршрут</button>}<div className="timeline">{route.steps.map((step, index) => <StepCard key={step.id} step={step} index={index} onDone={() => act(() => post(`/steps/${step.id}/complete/`), 'Шаг выполнен')} onDocument={() => act(() => post(`/steps/${step.id}/documents/`, { label: 'Синтетическое подтверждение' }), 'Подтверждение добавлено')} onBook={reload} />)}</div></section><section className="panel"><PanelHead title="Заключение исследования" /><div className="clinical-note"><ShieldCheck /><p>{route.conclusion}</p></div><small className="muted">RouteGuard не интерпретирует клинические данные и не формирует медицинские рекомендации.</small></section><section className="panel"><PanelHead title="Комментарии" /><CommentForm routeId={route.id} onSaved={reload} />{route.comments.map((comment) => <div className="comment" key={comment.id}><b>{comment.author}</b><p>{comment.body}</p><small>{formatDate(comment.created_at, true)}</small></div>)}</section><section className="panel"><PanelHead title="История действий" /><div className="history">{route.events.map((event) => <div key={event.id}><i /><div><b>{event.message}</b><span>{event.author} · {formatDate(event.occurred_at, true)}</span></div></div>)}</div></section></div><aside className="detail-side"><section className="panel sticky"><div className="assistant-title"><span><PhoneCall /></span><div><small>Помощник звонка</small><h2>{route.call_assistant.scenario}</h2></div></div><p>{route.call_assistant.goal}</p><div className="script"><small>Начало разговора</small><p>{route.call_assistant.opening}</p><small>Уточнить</small><ul>{route.call_assistant.questions.map((question) => <li key={question}>{question}</li>)}</ul><small>Предложение</small><p>{route.call_assistant.offer}</p></div><CallResult routeId={route.id} onSaved={reload} /><p className="disclaimer">{route.call_assistant.disclaimer}</p></section><section className="panel"><h2>Ответственный</h2><select value={route.assignee ?? ''} onChange={(event) => act(() => post(`/routes/${id}/assign/`, { employee_id: Number(event.target.value) }), 'Ответственный назначен')}><option value="">Не назначен</option>{employees?.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></section>{route.patient_code === 'P015' && <section className="panel integrity"><ShieldCheck /><h2>Проверка защиты от дубля</h2><p>Попытка создать второй активный маршрут по тому же исследованию должна быть отклонена.</p><button className="button secondary" onClick={() => act(() => post('/routes/', { study_id: route.study_id }), 'Ошибка: дубль неожиданно создан')}>Проверить ограничение</button></section>}</aside></div></>
}

function PanelHead({ title, link }: { title: string; link?: string }) {
  return <div className="panel-head"><h2>{title}</h2>{link && <NavLink to={link}>Открыть<ArrowRight /></NavLink>}</div>
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`priority ${priority.level}`} title={priority.reason}><i />{priority.label}</span>
}

function StepCard({ step, index, onDone, onDocument, onBook }: { step: RouteDetail['steps'][number]; index: number; onDone: () => void; onDocument: () => void; onBook: () => void }) {
  const [showSlots, setShowSlots] = useState(false)
  const { data: slots, error, reload } = useLoad<Slot[]>(() => api(`/schedule/?service=${step.service}&available=1`), [step.service])
  const [booking, setBooking] = useState(false)
  const [notice, setNotice] = useState('')
  const scheduled = step.appointments.find((appointment) => appointment.status === 'scheduled')
  const book = async (slotId: number) => {
    setBooking(true)
    try { await post(`/steps/${step.id}/book/`, { slot_id: slotId }, { 'Idempotency-Key': crypto.randomUUID() }); setNotice('Запись подтверждена'); setShowSlots(false); reload(); onBook() } catch (reason) { setNotice((reason as Error).message) } finally { setBooking(false) }
  }
  const updateAppointment = async (appointmentId: number, status: 'cancelled' | 'missed') => {
    setBooking(true)
    try { await post(`/appointments/${appointmentId}/status/`, { status, reason: status === 'cancelled' ? 'Отменено координатором' : 'Пациент не пришёл' }); setNotice(status === 'cancelled' ? 'Запись отменена, шаг возвращён в работу' : 'Неявка сохранена, шаг возвращён в работу'); onBook() } catch (reason) { setNotice((reason as Error).message) } finally { setBooking(false) }
  }
  return <article className={`step ${step.status}`}><div className="step-index">{step.status === 'completed' ? <Check /> : index + 1}</div><div className="step-body"><div className="step-top"><div><span>{step.service_name}</span><h3>{step.title}</h3></div><span className="status-chip">{step.status === 'completed' ? 'Выполнен' : step.status === 'scheduled' ? 'Запланирован' : 'Ожидает'}</span></div><p className="muted">Срок: {formatDate(step.due_date)}</p>{scheduled && <div className="appointment"><CalendarDays /><div><b>{formatDate(scheduled.slot.starts_at, true)}</b><span>{scheduled.slot.facility_name} · {scheduled.slot.specialist_name}</span></div></div>}{step.documents.map((document) => <div className="document" key={document.id}><Check />{document.label}</div>)}{notice && <p className="inline-note">{notice}</p>}<div className="step-actions">{step.status === 'pending' && <button className="button secondary small" onClick={() => setShowSlots(!showSlots)}>Выбрать слот</button>}{step.status !== 'completed' && <button className="button ghost small" onClick={onDone}>Отметить выполненным</button>}{scheduled && <button disabled={booking} className="button ghost small danger" onClick={() => updateAppointment(scheduled.id, 'cancelled')}>Отменить запись</button>}{scheduled && <button disabled={booking} className="button ghost small" onClick={() => updateAppointment(scheduled.id, 'missed')}>Отметить неявку</button>}{step.status === 'completed' && step.confirmation_required && !step.documents.length && <button className="button secondary small" onClick={onDocument}>Добавить подтверждение</button>}</div>{showSlots && <div className="slot-picker"><b>Свободное время</b>{error ? <ErrorState error={error} /> : !slots ? <Loading rows={2} /> : slots.length ? slots.slice(0, 8).map((slot) => <button disabled={booking} onClick={() => book(slot.id)} key={slot.id}><span><b>{formatDate(slot.starts_at, true)}</b><small>{slot.facility_name} · {slot.specialist_name}</small></span><ChevronRight /></button>) : <Empty text="Свободных слотов нет" />}</div>}</div></article>
}

function CommentForm({ routeId, onSaved }: { routeId: number; onSaved: () => void }) {
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try { await post(`/routes/${routeId}/comments/`, { body }); setBody(''); onSaved() } catch (reason) { setError((reason as Error).message) }
  }
  return <form className="comment-form" onSubmit={submit}><label className="sr-only" htmlFor="route-comment">Комментарий</label><textarea id="route-comment" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Зафиксировать договорённость или контекст" /><button className="button secondary small">Добавить</button>{error && <small>{error}</small>}</form>
}

function CallResult({ routeId, onSaved }: { routeId: number; onSaved: () => void }) {
  const [outcome, setOutcome] = useState('reached')
  const [note, setNote] = useState('')
  const [callback, setCallback] = useState('')
  const [state, setState] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setState('Сохраняем…')
    try { await post(`/routes/${routeId}/contact/`, { outcome, note, callback_at: callback || null }); setState('Результат сохранён'); setNote(''); onSaved() } catch (reason) { setState((reason as Error).message) }
  }
  return <form className="call-result" onSubmit={submit}><label>Результат разговора<select value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="reached">Контакт установлен</option><option value="slot_agreed">Время согласовано</option><option value="callback">Перезвонить</option><option value="no_answer">Нет ответа</option><option value="declined">Отказ от разговора</option></select></label>{outcome === 'callback' && <label>Когда перезвонить<input required type="datetime-local" value={callback} onChange={(event) => setCallback(event.target.value)} /></label>}<label>Комментарий<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Кратко зафиксируйте договорённость" /></label><button className="button primary" type="submit">Сохранить результат</button>{state && <small>{state}</small>}</form>
}

function TasksPage() {
  const [status, setStatus] = useState('open')
  const { data, error, reload } = useLoad<Task[]>(() => api(`/tasks/?status=${status}`), [status])
  const done = async (id: number) => { await post(`/tasks/${id}/complete/`); reload() }
  return <><PageHead eyebrow="Персональная очередь" title="Задачи" text="Повторные звонки и следующие действия с понятным сроком." /><div className="tabs"><button className={status === 'open' ? 'active' : ''} onClick={() => setStatus('open')}>Открытые</button><button className={status === 'done' ? 'active' : ''} onClick={() => setStatus('done')}>Выполненные</button></div><section className="panel task-list">{error ? <ErrorState error={error} retry={reload} /> : !data ? <Loading /> : data.length ? data.map((task) => <article key={task.id}><div className="task-check">{task.status === 'done' ? <Check /> : <Clock3 />}</div><div><NavLink to={`/app/routes/${task.route_id}`}>{task.title}</NavLink><span>{task.patient_code} · {task.patient_name}</span></div><time>{formatDate(task.due_at, true)}</time><span className="muted">{task.assignee_name ?? 'Без ответственного'}</span>{task.status === 'open' && <button className="button secondary small" onClick={() => done(task.id)}>Выполнено</button>}</article>) : <Empty text="Задач в этой группе нет" />}</section></>
}

function SchedulePage() {
  const [status, setStatus] = useState('free')
  const { data, error, reload } = useLoad<Slot[]>(() => api(`/schedule/?status=${status}`), [status])
  const grouped = useMemo(() => (data ?? []).reduce<Record<string, Slot[]>>((result, slot) => { const day = formatDate(slot.starts_at); (result[day] ??= []).push(slot); return result }, {}), [data])
  return <><PageHead eyebrow="Доступность" title="Расписание" text="Слоты специалистов и площадок. Прошедшее время при записи отклоняется сервером." /><div className="tabs"><button className={status === 'free' ? 'active' : ''} onClick={() => setStatus('free')}>Свободные</button><button className={status === 'busy' ? 'active' : ''} onClick={() => setStatus('busy')}>Занятые</button></div>{error ? <ErrorState error={error} retry={reload} /> : !data ? <Loading /> : <div className="schedule-grid">{Object.entries(grouped).slice(0, 12).map(([day, slots]) => <section className="panel day" key={day}><h2>{day}</h2>{slots.map((slot) => <div className="schedule-slot" key={slot.id}><time>{new Date(slot.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time><div><b>{slot.service_name}</b><span>{slot.specialist_name}</span><small>{slot.facility_name}</small></div><span className={`availability ${slot.status}`}>{slot.status === 'free' ? 'Свободен' : 'Занят'}</span></div>)}</section>)}</div>}</>
}

function AnalyticsPage() {
  const { data, error, reload } = useLoad<DashboardData>(() => api('/dashboard/'))
  if (error) return <ErrorState error={error} retry={reload} />
  if (!data) return <Loading />
  const statusLabels: Record<string, string> = { active: 'В работе', completed: 'Завершены', draft: 'Черновики', cancelled: 'Отменены' }
  const attentionLabels: Record<string, string> = { overdue: 'Просрочены', cancelled: 'После отмены', missed: 'После неявки', no_slot: 'Нет слота', no_assignee: 'Нет ответственного', no_document: 'Нет документа', no_confirmation: 'Нет подтверждения', due_soon: 'Срок близко', none: 'Без причин' }
  const statuses = Object.entries(data.status_counts).map(([key, value]) => ({ name: statusLabels[key] ?? key, value }))
  const reasons = Object.entries(data.attention_counts).filter(([key]) => key !== 'none').map(([key, value]) => ({ name: attentionLabels[key] ?? key, value }))
  return <><PageHead eyebrow="Сводные показатели" title="Аналитика" text="Распределение маршрутов и организационных причин внимания." /><div className="analytics-grid"><section className="panel"><h2>Состояние маршрутов</h2><div className="donut-wrap"><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={statuses} dataKey="value" nameKey="name" innerRadius={70} outerRadius={105} paddingAngle={2}>{statuses.map((_, index) => <Cell key={index} fill={['#32745D', '#82968A', '#C4CEC7', '#946214'][index % 4]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-center"><b>{data.summary.total}</b><span>маршрутов</span></div></div><div className="chart-legend">{statuses.map((item, index) => <span key={item.name}><i style={{ background: ['#32745D', '#82968A', '#C4CEC7', '#946214'][index % 4] }} />{item.name}: {item.value}</span>)}</div></section><section className="panel"><h2>Причины внимания</h2>{reasons.length ? <ResponsiveContainer width="100%" height={320}><BarChart data={reasons} layout="vertical" margin={{ left: 20, right: 24 }}><CartesianGrid stroke="#DEE4DE" horizontal={false} /><XAxis type="number" allowDecimals={false} stroke="#68766E" /><YAxis type="category" dataKey="name" width={125} tick={{ fill: '#68766E', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" fill="#32745D" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer> : <Empty text="Причин внимания нет" />}</section></div></>
}

const scenarioNotes = ['Черновик: требуется подтверждение', 'Активный маршрут: доступен слот', 'Будущая запись подтверждена', 'Приём назначен на демодату', 'Завершённый маршрут', 'Возврат после отмены пациентом', 'Неявка и задача координатору', 'Нет слота до срока', 'Просроченный шаг', 'Неполное заключение', 'Нет ответственного', 'Нет подтверждающего документа', 'Маршрут из двух шагов', 'Запрос на перенос', 'Защита от дубля', 'Согласование времени', 'Отмена клиникой', 'Альтернативная площадка', 'Два выполненных шага', 'Срок наступает завтра']

function ScenariosPage() {
  const { data, error, reload } = useLoad<RouteRow[]>(() => api('/routes/'))
  const byCode = new Map((data ?? []).map((route) => [route.patient_code, route.id]))
  return <><PageHead eyebrow="Контур демонстрации" title="20 сценариев" text="Каждый сценарий имеет заданное состояние и ожидаемый результат." />{error ? <ErrorState error={error} retry={reload} /> : !data ? <Loading /> : <div className="scenario-grid">{scenarioNotes.map((note, index) => { const code = `P${String(index + 1).padStart(3, '0')}`; return <NavLink to={`/app/routes/${byCode.get(code)}`} className="scenario" key={note}><span>{code}</span><h3>{note}</h3><p>{index % 3 === 0 ? 'Покажите изменение статуса и запись в истории.' : index % 3 === 1 ? 'Проверьте приоритет и следующее действие.' : 'Пройдите сценарий из карточки маршрута.'}</p><b>Открыть<ArrowRight /></b></NavLink> })}</div>}</>
}

function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { refresh } = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setNotice('')
    try { await post('/auth/login/', { username, password }); await refresh(); setNotice('Вход выполнен'); onSuccess?.() } catch (reason) { setNotice((reason as Error).message) }
  }
  return <form className="login-form" onSubmit={submit}><label>Логин<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="button primary">Войти</button>{notice && <small>{notice}</small>}</form>
}

function SettingsPage() {
  const { session, refresh } = useSession()
  const [notice, setNotice] = useState('')
  const perform = async (fn: () => Promise<unknown>, text: string) => {
    try { await fn(); await refresh(); setNotice(text) } catch (reason) { setNotice((reason as Error).message) }
  }
  return <><PageHead eyebrow="Рабочее пространство" title="Настройки" text="Управление демосессией и вход в постоянный контур." />{notice && <div className="notice">{notice}</div>}<div className="settings-grid"><section className="panel"><h2>Текущая сессия</h2><dl><div><dt>Пространство</dt><dd>{session?.workspace?.name}</dd></div><div><dt>Режим</dt><dd>{session?.workspace?.kind === 'demo' ? 'Гостевой деморежим' : 'Постоянный'}</dd></div><div><dt>Условная дата</dt><dd>{formatDate(session?.workspace?.demo_date)}</dd></div></dl>{session?.workspace?.kind === 'demo' && <div className="settings-actions"><button className="button secondary" onClick={() => perform(() => post('/demo/advance/', { days: 1 }), 'Демодата изменена')}>+1 день</button><button className="button ghost danger" onClick={() => perform(() => post('/demo/reset/'), 'Демоданные восстановлены')}>Сбросить демо</button></div>}</section><section className="panel"><h2>Вход сотрудника</h2><p className="muted">Постоянное рабочее пространство не смешивается с гостевыми демоданными.</p><LoginForm /></section></div></>
}

function AccessScreen() {
  const { refresh } = useSession()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const openDemo = async () => {
    try { await post('/demo/open/'); await refresh() } catch (reason) { setError((reason as Error).message) }
  }
  return <div className="access-screen"><header><Brand /></header><div className="access-card"><div className="access-copy"><span className="section-kicker">RouteGuard</span><h1>Откройте рабочее пространство</h1><p>Для знакомства используйте изолированное демо с двадцатью готовыми сценариями.</p><button className="button primary large" onClick={openDemo}>Открыть демо</button>{error && <p className="inline-error">{error}</p>}<button className="text-button" onClick={() => navigate('/')}>Вернуться на главную</button></div><div className="access-login"><h2>Вход сотрудника</h2><LoginForm /></div></div></div>
}

function ProtectedApp() {
  const { session } = useSession()
  const location = useLocation()
  if (!session) return <div className="center-screen"><Loading /></div>
  if (!session.workspace) return <AccessScreen />
  return <AppShell><Routes location={location}><Route index element={<Dashboard />} /><Route path="routes" element={<RoutesPage />} /><Route path="routes/:id" element={<RouteDetailPage />} /><Route path="tasks" element={<TasksPage />} /><Route path="schedule" element={<SchedulePage />} /><Route path="analytics" element={<AnalyticsPage />} /><Route path="scenarios" element={<ScenariosPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/app" replace />} /></Routes></AppShell>
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const refresh = async () => setSession(await api<Session>('/session/'))
  useEffect(() => { refresh().catch(() => setSession({ authenticated: false, user: null, workspace: null, role: null })) }, [])
  return <SessionContext.Provider value={{ session, refresh }}><Routes><Route path="/" element={<Landing />} /><Route path="/app/*" element={<ProtectedApp />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></SessionContext.Provider>
}
