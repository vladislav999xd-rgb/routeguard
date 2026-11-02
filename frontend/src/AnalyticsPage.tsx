import { useEffect, useState } from 'react'
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
import { api, formatDate } from './api'

type AnalyticsSnapshot = {
  as_of: string
  eligible_routes: number
  completed_routes: number
  completion_rate_percent: number
  incomplete_routes: number
  overdue_routes: number
  missed_appointments: number
  cancelled_appointments: number
  open_tasks: number
  due_tasks: number
  completed_tasks: number
}

type DashboardData = {
  summary: { total: number }
  status_counts: Record<string, number>
  attention_counts: Record<string, number>
  analytics: AnalyticsSnapshot
}

const statusLabels: Record<string, string> = { active: 'В работе', completed: 'Завершены', draft: 'Черновики', cancelled: 'Отменены' }
const statusColors: Record<string, string> = { active: '#32745D', completed: '#82968A', draft: '#C4CEC7', cancelled: '#946214' }
const statusOrder = ['active', 'completed', 'draft', 'cancelled']
const attentionLabels: Record<string, string> = { overdue: 'Просрочены', cancelled: 'После отмены', missed: 'После неявки', no_slot: 'Нет слота', no_assignee: 'Нет ответственного', no_document: 'Нет документа', no_confirmation: 'Нет подтверждения', due_soon: 'Срок близко', none: 'Без причин' }
const attentionOrder = ['overdue', 'missed', 'cancelled', 'no_slot', 'no_assignee', 'no_document', 'no_confirmation', 'due_soon']

const safeNumber = (value: number) => Number.isFinite(value) ? value : 0

export default function AnalyticsPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setError('')
    api<DashboardData>('/dashboard/').then((value) => live && setData(value)).catch((reason: Error) => live && setError(reason.message))
    return () => { live = false }
  }, [attempt])

  if (error) return <div className="empty error"><h3>Не удалось загрузить данные</h3><p>{error}</p><button className="button secondary" onClick={() => setAttempt((value) => value + 1)}>Повторить</button></div>
  if (!data) return <div className="skeletons" aria-label="Загрузка">{Array.from({ length: 5 }, (_, index) => <div className="skeleton" key={index} />)}</div>

  const analytics = data.analytics
  const statusKeys = [...statusOrder.filter((key) => key in data.status_counts), ...Object.keys(data.status_counts).filter((key) => !statusOrder.includes(key)).sort()]
  const attentionKeys = [...attentionOrder.filter((key) => key in data.attention_counts), ...Object.keys(data.attention_counts).filter((key) => key !== 'none' && !attentionOrder.includes(key)).sort()]
  const statuses = statusKeys.map((key) => ({ key, name: statusLabels[key] ?? key, value: safeNumber(data.status_counts[key]), color: statusColors[key] ?? '#68766E' }))
  const reasons = attentionKeys.map((key) => ({ key, name: attentionLabels[key] ?? key, value: safeNumber(data.attention_counts[key]) })).filter((item) => item.value > 0)
  const statusTotal = statuses.reduce((total, item) => total + item.value, 0)
  const statusPercent = (value: number) => statusTotal > 0 ? Math.round(value * 1000 / statusTotal) / 10 : 0
  const routeTotal = safeNumber(data.summary.total)

  return <>
    <div className="page-head analytics-head"><div><span className="section-kicker">Сводные показатели</span><h1>Аналитика</h1><p>Распределение маршрутов и организационных причин внимания.</p></div><time className="analytics-snapshot" dateTime={analytics.as_of}>Снимок на {formatDate(analytics.as_of)}</time></div>
    <section className="analytics-kpis" aria-label="Ключевые показатели">
      <article className="analytics-kpi positive"><span>Доля завершения</span><strong>{safeNumber(analytics.completion_rate_percent).toLocaleString('ru-RU')}%</strong><small>{safeNumber(analytics.completed_routes)} из {safeNumber(analytics.eligible_routes)} маршрутов</small></article>
      <article className="analytics-kpi"><span>Незавершённые</span><strong>{safeNumber(analytics.incomplete_routes)}</strong><small>черновики и маршруты в работе</small></article>
      <article className={`analytics-kpi${analytics.overdue_routes > 0 ? ' attention' : ''}`}><span>Просроченные</span><strong>{safeNumber(analytics.overdue_routes)}</strong><small>незавершённые маршруты</small></article>
      <article className={`analytics-kpi${analytics.missed_appointments > 0 ? ' attention' : ''}`}><span>Неявки</span><strong>{safeNumber(analytics.missed_appointments)}</strong><small>зафиксированные записи</small></article>
      <article className="analytics-kpi"><span>Отмены</span><strong>{safeNumber(analytics.cancelled_appointments)}</strong><small>отменённые записи</small></article>
      <article className={`analytics-kpi${analytics.due_tasks > 0 ? ' attention' : ''}`}><span>Задачи</span><strong>{safeNumber(analytics.completed_tasks)}</strong><small>выполнено · {safeNumber(analytics.due_tasks)} срочно · {safeNumber(analytics.open_tasks)} открыто</small></article>
    </section>
    <div className="analytics-grid">
      <section className="panel" aria-labelledby="route-status-title"><h2 id="route-status-title">Состояние маршрутов</h2>{statusTotal > 0 ? <div className="chart-visual" role="img" aria-label={`Распределение ${statusTotal} маршрутов по статусам`}><div className="donut-wrap"><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={statuses} dataKey="value" nameKey="name" innerRadius={70} outerRadius={105} paddingAngle={2}>{statuses.map((item) => <Cell key={item.key} fill={item.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-center"><b>{routeTotal}</b><span>маршрутов</span></div></div></div> : <div className="chart-empty"><b>0 маршрутов</b><span>Данные появятся после создания маршрутов.</span></div>}<table className="chart-data"><caption className="sr-only">Данные графика состояния маршрутов</caption><thead className="sr-only"><tr><th>Статус</th><th>Количество</th><th>Доля</th></tr></thead><tbody>{statuses.map((item) => <tr key={item.key}><th scope="row"><i aria-hidden="true" style={{ background: item.color }} />{item.name}</th><td>{item.value}</td><td>{statusPercent(item.value).toLocaleString('ru-RU')}%</td></tr>)}</tbody></table></section>
      <section className="panel" aria-labelledby="attention-reasons-title"><h2 id="attention-reasons-title">Причины внимания</h2>{reasons.length ? <><div className="chart-visual" role="img" aria-label="Количество маршрутов по причинам внимания"><ResponsiveContainer width="100%" height={320}><BarChart data={reasons} layout="vertical" margin={{ left: 20, right: 24 }}><CartesianGrid stroke="#DEE4DE" horizontal={false} /><XAxis type="number" allowDecimals={false} stroke="#68766E" /><YAxis type="category" dataKey="name" width={125} tick={{ fill: '#68766E', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" name="Маршруты" fill="#32745D" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></div><table className="chart-data"><caption className="sr-only">Данные графика причин внимания</caption><thead className="sr-only"><tr><th>Причина</th><th>Количество</th></tr></thead><tbody>{reasons.map((item) => <tr key={item.key}><th scope="row">{item.name}</th><td>{item.value}</td></tr>)}</tbody></table></> : <div className="chart-empty"><b>Причин внимания нет</b><span>На дату снимка маршруты не требуют дополнительного внимания.</span></div>}</section>
    </div>
  </>
}
