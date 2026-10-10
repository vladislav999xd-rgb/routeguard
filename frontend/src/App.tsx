import { createContext, FormEvent, ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { Activity, ArrowRight, CalendarDays, Check, ChevronRight, ClipboardCheck, Clock3, LayoutDashboard, ListTodo, LogOut, Menu, PhoneCall, RefreshCw, Route as RouteIcon, Search, Settings, ShieldCheck, Sparkles, Users, X } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { api, formatDate, post, Session } from './api'

type Priority = { score: number; level: string; label: string; reason: string }
type RouteRow = { id: number; patient_code: string; patient_name: string; study_type: string; study_id: number; assignee: number | null; assignee_name: string | null; status: string; status_label: string; attention_reason: string; attention_label: string; due_date: string; priority: Priority; next_step: null | { id: number; title: string; status: string; due_date: string; service_id: number } }
type Slot = { id: number; starts_at: string; status: string; service: number; service_name: string; specialist_name: string; facility_name: string; facility_address: string }
type Employee = { id: number; full_name: string; role: string }
type Task = { id: number; route_id: number; patient_code: string; patient_name: string; title: string; kind: string; due_at: string; status: string; assignee_name: string | null }
type RouteDetail = RouteRow & { conclusion: string; study_date: string; steps: Array<{ id: number; title: string; service: number; service_name: string; status: string; due_date: string; confirmation_required: boolean; appointments: Array<{ id: number; status: string; reason: string; slot: Slot }>; documents: Array<{ id: number; label: string }> }>; tasks: Task[]; events: Array<{ id: number; message: string; author: string; occurred_at: string; demo_date: string }>; comments: Array<{ id: number; author: string; body: string; created_at: string }>; call_assistant: { scenario: string; goal: string; step: string; due: string; appointment: string | null; opening: string; questions: string[]; offer: string; closing: string; full_text: string; disclaimer: string } }

const SessionContext = createContext<{ session: Session | null; refresh: () => Promise<void> }>({ session: null, refresh: async () => undefined })
const useSession = () => useContext(SessionContext)

function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="brand"><img src="/static/app/mark.svg" alt="" /><span>{compact ? 'RG' : 'RouteGuard'}</span></span>
}

function Loading({ rows = 4 }: { rows?: number }) {
  return <div className="skeletons" aria-label="Загрузка">{Array.from({ length: rows }, (_, i) => <div className="skeleton" key={i} />)}</div>
}

function ErrorState({ error, retry }: { error: string; retry?: () => void }) {
  return <div className="empty error"><ShieldCheck /><h3>Не удалось загрузить данные</h3><p>{error}</p>{retry && <button className="button secondary" onClick={retry}><RefreshCw size={16} /> Повторить</button>}</div>
}

function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => { let live = true; setError(''); loader().then((value) => live && setData(value)).catch((e: Error) => live && setError(e.message)); return () => { live = false } }, [...deps, tick])
  return { data, error, reload: () => setTick((v) => v + 1) }
}

function Landing() {
  const navigate = useNavigate()
  const { session, refresh } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const openDemo = async () => { setBusy(true); setError(''); try { await post('/demo/open/'); await refresh(); navigate('/app') } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <main className="landing">
    <nav className="landing-nav"><Brand /><a href="#how">Как это работает</a><a href="/app/settings" className="button ghost">Войти сотруднику</a></nav>
    <section className="hero">
      <div className="eyebrow"><Sparkles size={16} /> Организационный контур медицинского маршрута</div>
      <h1>Ни один следующий шаг пациента не останется без внимания</h1>
      <p>RouteGuard собирает маршруты, записи, звонки и задачи координатора в одном понятном рабочем пространстве — без клинических рекомендаций и автоматических решений.</p>
      <div className="hero-actions"><button className="button primary large" onClick={openDemo} disabled={busy}>{busy ? 'Готовим демо…' : session?.workspace ? 'Продолжить демо' : 'Открыть демо'} <ArrowRight size={18} /></button><a className="button secondary large" href="#how">Посмотреть возможности</a></div>
      {error && <p className="inline-error">{error}</p>}
      <div className="trust"><span><ShieldCheck /> Изолированные демоданные</span><span><Check /> 20 готовых сценариев</span><span><Activity /> Прозрачный приоритет</span></div>
    </section>
    <section className="product-preview" aria-label="Пример рабочей панели"><div className="preview-head"><Brand /><span>Сегодня, 12 задач</span></div><div className="preview-grid"><div className="preview-card"><small>Требуют внимания</small><strong>8</strong><span>2 просрочены</span></div><div className="preview-card teal"><small>Маршруты в работе</small><strong>16</strong><span>динамика стабильна</span></div><div className="preview-list"><b>Приоритет на сегодня</b>{['Просрочен организационный срок', 'Нужна повторная запись', 'Нет ответственного'].map((text, index) => <div key={text}><span className={`dot d${index}`} />{text}<ChevronRight size={16} /></div>)}</div></div></section>
    <section id="how" className="features"><div><PhoneCall /><h3>Помощник звонка</h3><p>Готовит нейтральный сценарий разговора и фиксирует результат.</p></div><div><ListTodo /><h3>Мои задачи</h3><p>Повторные звонки и следующие действия больше не теряются в комментариях.</p></div><div><CalendarDays /><h3>Безопасная запись</h3><p>Проверяет слот, срок и параллельные изменения перед сохранением.</p></div></section>
    <footer><Brand /><span>Самостоятельный демонстрационный продукт · данные синтетические</span></footer>
  </main>
}

const navItems = [
  ['/app', 'Обзор', LayoutDashboard], ['/app/routes', 'Маршруты', RouteIcon], ['/app/tasks', 'Мои задачи', ListTodo], ['/app/schedule', 'Расписание', CalendarDays], ['/app/scenarios', 'Сценарии', ClipboardCheck], ['/app/settings', 'Настройки', Settings],
] as const

function AppShell({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const [open, setOpen] = useState(false)
  return <div className="shell">
    <aside className={open ? 'sidebar open' : 'sidebar'}><div className="sidebar-top"><Brand /><button className="icon-button close-menu" onClick={() => setOpen(false)} aria-label="Закрыть меню"><X /></button></div><nav>{navItems.map(([url, label, Icon]) => <NavLink key={url} to={url} end={url === '/app'} onClick={() => setOpen(false)}><Icon size={19} />{label}</NavLink>)}</nav><div className="workspace-mini"><span className="avatar">{session?.workspace?.kind === 'demo' ? 'Д' : 'RG'}</span><div><b>{session?.workspace?.name}</b><small>{session?.workspace?.kind === 'demo' ? `Демодата: ${formatDate(session.workspace.demo_date)}` : 'Рабочее пространство'}</small></div></div></aside>
    {open && <button className="backdrop" onClick={() => setOpen(false)} aria-label="Закрыть меню" />}
    <div className="content"><header className="topbar"><button className="icon-button menu" onClick={() => setOpen(true)} aria-label="Открыть меню"><Menu /></button><div className="top-context"><span className="live-dot" />{session?.workspace?.kind === 'demo' ? 'Безопасный деморежим' : 'Рабочий контур'}</div><div className="top-user"><span className="avatar">{session?.user?.name?.[0] ?? 'Г'}</span><span>{session?.user?.name ?? 'Гость'}</span></div></header><main className="page">{children}</main></div>
  </div>
}

function Dashboard() {
  const { data, error, reload } = useLoad<any>(() => api('/dashboard/'))
  if (error) return <ErrorState error={error} retry={reload} />
  if (!data) return <Loading />
  const chart = Object.entries(data.status_counts).map(([name, value]) => ({ name, value }))
  return <><PageHead eyebrow="Рабочая панель" title="Добрый день" text="Главное на сегодня — в порядке реального организационного приоритета." />
    <div className="stats"><Stat label="Всего маршрутов" value={data.summary.total} icon={<RouteIcon />} /><Stat label="В работе" value={data.summary.active} icon={<Activity />} /><Stat label="Требуют внимания" value={data.summary.attention} accent icon={<ShieldCheck />} /><Stat label="Задачи на сегодня" value={data.summary.tasks_due} icon={<Clock3 />} /></div>
    <div className="dashboard-grid"><section className="panel span2"><PanelHead title="Приоритет на сегодня" link="/app/routes" />{data.priority_routes.length ? <RouteTable rows={data.priority_routes} compact /> : <Empty text="Срочных маршрутов нет" />}</section><section className="panel chart-panel"><h2>Состояние портфеля</h2><div className="chart"><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={chart} dataKey="value" innerRadius={62} outerRadius={88} paddingAngle={3}>{chart.map((_: unknown, i: number) => <Cell key={i} fill={['#0f766e', '#38bdf8', '#94a3b8', '#f97316'][i % 4]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="chart-center"><b>{data.summary.total}</b><span>маршрутов</span></div></div><div className="legend"><span><i className="teal-bg" />В работе</span><span><i className="blue-bg" />Завершены</span><span><i className="slate-bg" />Черновики</span></div></section></div>
  </>
}

function PageHead({ eyebrow, title, text, action }: { eyebrow?: string; title: string; text?: string; action?: ReactNode }) { return <div className="page-head"><div>{eyebrow && <span>{eyebrow}</span>}<h1>{title}</h1>{text && <p>{text}</p>}</div>{action}</div> }
function PanelHead({ title, link }: { title: string; link?: string }) { return <div className="panel-head"><h2>{title}</h2>{link && <NavLink to={link}>Все маршруты <ArrowRight size={16} /></NavLink>}</div> }
function Stat({ label, value, icon, accent }: { label: string; value: number; icon: ReactNode; accent?: boolean }) { return <div className={accent ? 'stat accent' : 'stat'}><div className="stat-icon">{icon}</div><div><b>{value}</b><span>{label}</span></div></div> }
function Empty({ text }: { text: string }) { return <div className="empty"><Check /><h3>{text}</h3><p>Здесь появятся данные после соответствующего действия.</p></div> }

function PriorityBadge({ priority }: { priority: Priority }) { return <span className={`priority ${priority.level}`} title={priority.reason}><i />{priority.label}</span> }

function RouteTable({ rows, compact = false }: { rows: RouteRow[]; compact?: boolean }) {
  return <div className="table-wrap"><table><thead><tr><th>Пациент</th><th>Следующий шаг</th><th>Ответственный</th><th>Срок</th><th>Приоритет</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><NavLink className="patient" to={`/app/routes/${row.id}`}><b>{row.patient_name}</b><small>{row.patient_code} · {row.study_type}</small></NavLink></td><td><span className="cell-main">{row.next_step?.title ?? 'Все шаги выполнены'}</span>{row.attention_label && <small className="attention">{row.attention_label}</small>}</td><td>{row.assignee_name ?? <span className="muted">Не назначен</span>}</td><td>{formatDate(row.due_date)}</td><td><PriorityBadge priority={row.priority} /></td><td><NavLink className="round-link" to={`/app/routes/${row.id}`} aria-label="Открыть маршрут"><ChevronRight /></NavLink></td></tr>)}</tbody></table>{compact && rows.length > 5 && <div className="fade" />}</div>
}

function RoutesPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [attention, setAttention] = useState('')
  const [assignee, setAssignee] = useState('')
  const { data: employees } = useLoad<Employee[]>(() => api('/employees/'))
  const { data, error, reload } = useLoad<RouteRow[]>(() => api(`/routes/?search=${encodeURIComponent(search)}&status=${status}&attention_reason=${attention}&assignee=${assignee}`), [search, status, attention, assignee])
  return <><PageHead eyebrow="Единый реестр" title="Маршруты пациентов" text="Поиск, приоритет и следующий организационный шаг в одном списке." />
    <div className="filters"><label className="search"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ФИО, код пациента или UID" /></label><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Все статусы</option><option value="draft">Черновики</option><option value="active">В работе</option><option value="completed">Завершены</option></select><select value={attention} onChange={(e) => setAttention(e.target.value)}><option value="">Любая причина</option><option value="overdue">Просрочен</option><option value="cancelled">Отмена</option><option value="missed">Неявка</option><option value="no_slot">Нет слота</option><option value="no_assignee">Нет ответственного</option><option value="no_document">Нет документа</option></select><select value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Все сотрудники</option>{employees?.map((employee) => <option value={employee.id} key={employee.id}>{employee.full_name}</option>)}</select></div>
    <section className="panel">{error ? <ErrorState error={error} retry={reload} /> : !data ? <Loading /> : data.length ? <RouteTable rows={data} /> : <Empty text="Маршруты не найдены" />}</section>
  </>
}

function RouteDetailPage() {
  const { id } = useParams()
  const { data: route, error, reload } = useLoad<RouteDetail>(() => api(`/routes/${id}/`), [id])
  const { data: employees } = useLoad<Employee[]>(() => api('/employees/'))
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  if (error) return <ErrorState error={error} retry={reload} />
  if (!route) return <Loading rows={6} />
  const act = async (fn: () => Promise<unknown>, success: string) => { setBusy(true); setMessage(''); try { await fn(); setMessage(success); reload() } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) } }
  return <><div className="detail-head"><NavLink to="/app/routes" className="back">← Все маршруты</NavLink><div><span>{route.patient_code} · {route.study_type}</span><h1>{route.patient_name}</h1><p>Исследование от {formatDate(route.study_date)} · срок маршрута {formatDate(route.due_date)}</p></div><PriorityBadge priority={route.priority} /></div>
    {message && <div className={message.includes('Не ') || message.includes('нельзя') ? 'notice error-notice' : 'notice'}>{message}</div>}
    <div className="detail-grid"><div className="detail-main">
      <section className="panel"><PanelHead title="Маршрут" />{route.status === 'draft' && <button disabled={busy} className="button primary" onClick={() => act(() => post(`/routes/${id}/confirm/`), 'Маршрут подтверждён')}>Подтвердить маршрут</button>}<div className="timeline">{route.steps.map((step, index) => <StepCard key={step.id} step={step} index={index} route={route} onDone={() => act(() => post(`/steps/${step.id}/complete/`), 'Шаг выполнен')} onDocument={() => act(() => post(`/steps/${step.id}/documents/`, { label: 'Синтетическое подтверждение' }), 'Подтверждение добавлено')} onBook={() => reload()} />)}</div></section>
      <section className="panel"><PanelHead title="Заключение исследования" /><div className="clinical-note"><ShieldCheck /><p>{route.conclusion}</p></div><small className="muted">RouteGuard не интерпретирует клинические данные и не формирует медицинские рекомендации.</small></section>
      <section className="panel"><PanelHead title="Комментарии" /><CommentForm routeId={route.id} onSaved={reload} />{route.comments.map((comment) => <div className="comment" key={comment.id}><b>{comment.author}</b><p>{comment.body}</p><small>{formatDate(comment.created_at, true)}</small></div>)}</section>
      <section className="panel"><PanelHead title="История действий" /><div className="history">{route.events.map((event) => <div key={event.id}><i /><div><b>{event.message}</b><span>{event.author} · {formatDate(event.occurred_at, true)}</span></div></div>)}</div></section>
    </div><aside className="detail-side">
      <section className="panel sticky"><div className="assistant-title"><span><PhoneCall /></span><div><small>Помощник звонка</small><h2>{route.call_assistant.scenario}</h2></div></div><p>{route.call_assistant.goal}</p><div className="script"><small>Начало разговора</small><p>{route.call_assistant.opening}</p><small>Уточнить</small><ul>{route.call_assistant.questions.map((q) => <li key={q}>{q}</li>)}</ul><small>Предложение</small><p>{route.call_assistant.offer}</p></div><CallResult routeId={route.id} onSaved={reload} /><p className="disclaimer">{route.call_assistant.disclaimer}</p></section>
      <section className="panel"><h2>Ответственный</h2><select value={route.assignee ?? ''} onChange={(e) => act(() => post(`/routes/${id}/assign/`, { employee_id: Number(e.target.value) }), 'Ответственный назначен')}><option value="">Не назначен</option>{employees?.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></section>
      {route.patient_code === 'P015' && <section className="panel integrity"><ShieldCheck /><h2>Проверка защиты от дубля</h2><p>Попытка создать второй активный маршрут по тому же исследованию должна быть отклонена.</p><button className="button secondary" onClick={() => act(() => post('/routes/', { study_id: route.study_id }), 'Ошибка: дубль неожиданно создан')}>Проверить ограничение</button></section>}
    </aside></div>
  </>
}

function StepCard({ step, index, route, onDone, onDocument, onBook }: { step: RouteDetail['steps'][number]; index: number; route: RouteDetail; onDone: () => void; onDocument: () => void; onBook: () => void }) {
  const [showSlots, setShowSlots] = useState(false)
  const { data: slots, error, reload } = useLoad<Slot[]>(() => api(`/schedule/?service=${step.service}&available=1`), [step.service])
  const [booking, setBooking] = useState(false)
  const [notice, setNotice] = useState('')
  const book = async (slotId: number) => { setBooking(true); try { await post(`/steps/${step.id}/book/`, { slot_id: slotId }, { 'Idempotency-Key': crypto.randomUUID() }); setNotice('Запись подтверждена'); setShowSlots(false); reload(); onBook() } catch (e) { setNotice((e as Error).message) } finally { setBooking(false) } }
  const updateAppointment = async (appointmentId: number, status: 'cancelled' | 'missed') => { setBooking(true); try { await post(`/appointments/${appointmentId}/status/`, { status, reason: status === 'cancelled' ? 'Отменено координатором' : 'Пациент не пришёл' }); setNotice(status === 'cancelled' ? 'Запись отменена, шаг возвращён в работу' : 'Неявка сохранена, шаг возвращён в работу'); onBook() } catch (e) { setNotice((e as Error).message) } finally { setBooking(false) } }
  const scheduled = step.appointments.find((a) => a.status === 'scheduled')
  return <article className={`step ${step.status}`}><div className="step-index">{step.status === 'completed' ? <Check /> : index + 1}</div><div className="step-body"><div className="step-top"><div><span>{step.service_name}</span><h3>{step.title}</h3></div><span className="status-chip">{step.status === 'completed' ? 'Выполнен' : step.status === 'scheduled' ? 'Запланирован' : 'Ожидает'}</span></div><p className="muted">Срок: {formatDate(step.due_date)}</p>{scheduled && <div className="appointment"><CalendarDays /><div><b>{formatDate(scheduled.slot.starts_at, true)}</b><span>{scheduled.slot.facility_name} · {scheduled.slot.specialist_name}</span></div></div>}{step.documents.map((doc) => <div className="document" key={doc.id}><Check /> {doc.label}</div>)}{notice && <p className="inline-note">{notice}</p>}
    <div className="step-actions">{step.status === 'pending' && <button className="button secondary small" onClick={() => setShowSlots(!showSlots)}>Выбрать слот</button>}{step.status !== 'completed' && <button className="button ghost small" onClick={onDone}>Отметить выполненным</button>}{scheduled && <button disabled={booking} className="button ghost small danger" onClick={() => updateAppointment(scheduled.id, 'cancelled')}>Отменить запись</button>}{scheduled && <button disabled={booking} className="button ghost small" onClick={() => updateAppointment(scheduled.id, 'missed')}>Отметить неявку</button>}{step.status === 'completed' && step.confirmation_required && !step.documents.length && <button className="button secondary small" onClick={onDocument}>Добавить подтверждение</button>}</div>
    {showSlots && <div className="slot-picker"><b>Свободное время</b>{error ? <ErrorState error={error} /> : !slots ? <Loading rows={2} /> : slots.length ? slots.slice(0, 8).map((slot) => <button disabled={booking} onClick={() => book(slot.id)} key={slot.id}><span><b>{formatDate(slot.starts_at, true)}</b><small>{slot.facility_name} · {slot.specialist_name}</small></span><ChevronRight /></button>) : <Empty text="Свободных слотов нет" />}</div>}
  </div></article>
}

function CommentForm({ routeId, onSaved }: { routeId: number; onSaved: () => void }) {
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => { e.preventDefault(); setError(''); try { await post(`/routes/${routeId}/comments/`, { body }); setBody(''); onSaved() } catch (reason) { setError((reason as Error).message) } }
  return <form className="comment-form" onSubmit={submit}><textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Зафиксировать договорённость или контекст" /><button className="button secondary small">Добавить</button>{error && <small>{error}</small>}</form>
}

function CallResult({ routeId, onSaved }: { routeId: number; onSaved: () => void }) {
  const [outcome, setOutcome] = useState('reached')
  const [note, setNote] = useState('')
  const [callback, setCallback] = useState('')
  const [state, setState] = useState('')
  const submit = async (e: FormEvent) => { e.preventDefault(); setState('Сохраняем…'); try { await post(`/routes/${routeId}/contact/`, { outcome, note, callback_at: callback || null }); setState('Результат сохранён'); setNote(''); onSaved() } catch (err) { setState((err as Error).message) } }
  return <form className="call-result" onSubmit={submit}><label>Результат разговора<select value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="reached">Контакт установлен</option><option value="slot_agreed">Время согласовано</option><option value="callback">Перезвонить</option><option value="no_answer">Нет ответа</option><option value="declined">Отказ от разговора</option></select></label>{outcome === 'callback' && <label>Когда перезвонить<input required type="datetime-local" value={callback} onChange={(e) => setCallback(e.target.value)} /></label>}<label>Комментарий<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Кратко зафиксируйте договорённость" /></label><button className="button primary" type="submit">Сохранить результат</button>{state && <small>{state}</small>}</form>
}

function TasksPage() {
  const [status, setStatus] = useState('open')
  const { data, error, reload } = useLoad<Task[]>(() => api(`/tasks/?status=${status}`), [status])
  const done = async (id: number) => { await post(`/tasks/${id}/complete/`); reload() }
  return <><PageHead eyebrow="Персональная очередь" title="Мои задачи" text="Повторные звонки и следующие действия с понятным сроком." /><div className="tabs"><button className={status === 'open' ? 'active' : ''} onClick={() => setStatus('open')}>Открытые</button><button className={status === 'done' ? 'active' : ''} onClick={() => setStatus('done')}>Выполненные</button></div><section className="panel task-list">{error ? <ErrorState error={error} retry={reload} /> : !data ? <Loading /> : data.length ? data.map((task) => <article key={task.id}><div className="task-check">{task.status === 'done' ? <Check /> : <Clock3 />}</div><div><NavLink to={`/app/routes/${task.route_id}`}>{task.title}</NavLink><span>{task.patient_code} · {task.patient_name}</span></div><time>{formatDate(task.due_at, true)}</time><span className="muted">{task.assignee_name ?? 'Без ответственного'}</span>{task.status === 'open' && <button className="button secondary small" onClick={() => done(task.id)}>Выполнено</button>}</article>) : <Empty text="Задач в этой группе нет" />}</section></>
}

function SchedulePage() {
  const [status, setStatus] = useState('free')
  const { data, error, reload } = useLoad<Slot[]>(() => api(`/schedule/?status=${status}`), [status])
  const grouped = useMemo(() => (data ?? []).reduce<Record<string, Slot[]>>((result, slot) => {
    const day = formatDate(slot.starts_at)
    ;(result[day] ??= []).push(slot)
    return result
  }, {}), [data])
  return <><PageHead eyebrow="Доступность" title="Расписание" text="Слоты специалистов и площадок. Прошедшее время при записи отклоняется сервером." /><div className="tabs"><button className={status === 'free' ? 'active' : ''} onClick={() => setStatus('free')}>Свободные</button><button className={status === 'busy' ? 'active' : ''} onClick={() => setStatus('busy')}>Занятые</button></div>{error ? <ErrorState error={error} retry={reload} /> : !data ? <Loading /> : <div className="schedule-grid">{Object.entries(grouped).slice(0, 12).map(([day, slots]) => <section className="panel day" key={day}><h2>{day}</h2>{slots?.map((slot) => <div className="schedule-slot" key={slot.id}><time>{new Date(slot.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time><div><b>{slot.service_name}</b><span>{slot.specialist_name}</span><small>{slot.facility_name}</small></div><span className={`availability ${slot.status}`}>{slot.status === 'free' ? 'Свободен' : 'Занят'}</span></div>)}</section>)}</div>}</>
}

const scenarioNotes = ['Черновик: требуется подтверждение', 'Активный маршрут: доступен слот', 'Будущая запись подтверждена', 'Приём назначен на демодату', 'Завершённый маршрут', 'Возврат после отмены пациентом', 'Неявка и задача координатору', 'Нет слота до срока', 'Просроченный шаг', 'Неполное заключение', 'Нет ответственного', 'Нет подтверждающего документа', 'Маршрут из двух шагов', 'Запрос на перенос', 'Защита от дубля', 'Согласование времени', 'Отмена клиникой', 'Альтернативная площадка', 'Два выполненных шага', 'Срок наступает завтра']
function ScenariosPage() {
  const { data, error, reload } = useLoad<RouteRow[]>(() => api('/routes/'))
  const byCode = new Map((data ?? []).map((route) => [route.patient_code, route.id]))
  return <><PageHead eyebrow="Контур демонстрации" title="20 проверяемых сценариев" text="Каждый сценарий имеет заданное начальное состояние и ожидаемый результат действий." />{error ? <ErrorState error={error} retry={reload} /> : !data ? <Loading /> : <div className="scenario-grid">{scenarioNotes.map((note, index) => { const code = `P${String(index + 1).padStart(3, '0')}`; return <NavLink to={`/app/routes/${byCode.get(code)}`} className="scenario" key={note}><span>{code}</span><h3>{note}</h3><p>{index % 3 === 0 ? 'Покажите изменение статуса и запись в истории.' : index % 3 === 1 ? 'Проверьте приоритет и следующее действие.' : 'Пройдите сценарий из карточки маршрута.'}</p><b>Открыть <ArrowRight /></b></NavLink> })}</div>}</>
}

function SettingsPage() {
  const { session, refresh } = useSession()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const perform = async (fn: () => Promise<unknown>, text: string) => { try { await fn(); await refresh(); setNotice(text) } catch (e) { setNotice((e as Error).message) } }
  const login = (e: FormEvent) => { e.preventDefault(); perform(() => post('/auth/login/', { username, password }), 'Вход выполнен') }
  return <><PageHead eyebrow="Рабочее пространство" title="Настройки" text="Управление демосессией и вход в постоянный контур." />{notice && <div className="notice">{notice}</div>}<div className="settings-grid"><section className="panel"><h2>Текущая сессия</h2><dl><div><dt>Пространство</dt><dd>{session?.workspace?.name}</dd></div><div><dt>Режим</dt><dd>{session?.workspace?.kind === 'demo' ? 'Гостевой деморежим' : 'Постоянный'}</dd></div><div><dt>Условная дата</dt><dd>{formatDate(session?.workspace?.demo_date)}</dd></div></dl>{session?.workspace?.kind === 'demo' && <div className="settings-actions"><button className="button secondary" onClick={() => perform(() => post('/demo/advance/', { days: 1 }), 'Демодата изменена')}>+1 день</button><button className="button ghost danger" onClick={() => perform(() => post('/demo/reset/'), 'Демоданные восстановлены')}>Сбросить демо</button></div>}{session?.authenticated && <button className="button ghost" onClick={() => perform(() => post('/auth/logout/'), 'Вы вышли')}><LogOut /> Выйти</button>}</section><section className="panel"><h2>Вход сотрудника</h2><p className="muted">Постоянное рабочее пространство не смешивается с гостевыми демоданными.</p><form className="login-form" onSubmit={login}><label>Логин<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></label><label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label><button className="button primary">Войти</button></form><button className="text-button" onClick={() => navigate('/')}>Вернуться на лендинг</button></section></div></>
}

function ProtectedApp() {
  const { session, refresh } = useSession()
  const [error, setError] = useState('')
  if (!session) return <div className="center-screen"><Loading /></div>
  if (!session.workspace) return <div className="access-screen"><Brand /><div><ShieldCheck /><h1>Откройте рабочее пространство</h1><p>Для знакомства используйте изолированное демо с двадцатью готовыми сценариями.</p><button className="button primary large" onClick={() => post('/demo/open/').then(refresh).catch((e: Error) => setError(e.message))}>Открыть демо</button>{error && <p className="inline-error">{error}</p>}<a href="/">На главную</a></div></div>
  return <AppShell><Routes><Route index element={<Dashboard />} /><Route path="routes" element={<RoutesPage />} /><Route path="routes/:id" element={<RouteDetailPage />} /><Route path="tasks" element={<TasksPage />} /><Route path="schedule" element={<SchedulePage />} /><Route path="scenarios" element={<ScenariosPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/app" replace />} /></Routes></AppShell>
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const refresh = async () => setSession(await api<Session>('/session/'))
  useEffect(() => { refresh().catch(() => setSession({ authenticated: false, user: null, workspace: null, role: null })) }, [])
  return <SessionContext.Provider value={{ session, refresh }}><Routes><Route path="/" element={<Landing />} /><Route path="/app/*" element={<ProtectedApp />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></SessionContext.Provider>
}
