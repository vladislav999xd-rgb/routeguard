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
import { api } from './api'

type DashboardData = {
  summary: { total: number }
  status_counts: Record<string, number>
  attention_counts: Record<string, number>
}

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

  const statusLabels: Record<string, string> = { active: 'В работе', completed: 'Завершены', draft: 'Черновики', cancelled: 'Отменены' }
  const attentionLabels: Record<string, string> = { overdue: 'Просрочены', cancelled: 'После отмены', missed: 'После неявки', no_slot: 'Нет слота', no_assignee: 'Нет ответственного', no_document: 'Нет документа', no_confirmation: 'Нет подтверждения', due_soon: 'Срок близко', none: 'Без причин' }
  const statuses = Object.entries(data.status_counts).map(([key, value]) => ({ name: statusLabels[key] ?? key, value }))
  const reasons = Object.entries(data.attention_counts).filter(([key]) => key !== 'none').map(([key, value]) => ({ name: attentionLabels[key] ?? key, value }))

  return <>
    <div className="page-head"><span>Сводные показатели</span><h1>Аналитика</h1><p>Распределение маршрутов и организационных причин внимания.</p></div>
    <div className="analytics-grid">
      <section className="panel"><h2>Состояние маршрутов</h2><div className="donut-wrap"><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={statuses} dataKey="value" nameKey="name" innerRadius={70} outerRadius={105} paddingAngle={2}>{statuses.map((_, index) => <Cell key={index} fill={['#32745D', '#82968A', '#C4CEC7', '#946214'][index % 4]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-center"><b>{data.summary.total}</b><span>маршрутов</span></div></div><div className="chart-legend">{statuses.map((item, index) => <span key={item.name}><i style={{ background: ['#32745D', '#82968A', '#C4CEC7', '#946214'][index % 4] }} />{item.name}: {item.value}</span>)}</div></section>
      <section className="panel"><h2>Причины внимания</h2>{reasons.length ? <ResponsiveContainer width="100%" height={320}><BarChart data={reasons} layout="vertical" margin={{ left: 20, right: 24 }}><CartesianGrid stroke="#DEE4DE" horizontal={false} /><XAxis type="number" allowDecimals={false} stroke="#68766E" /><YAxis type="category" dataKey="name" width={125} tick={{ fill: '#68766E', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" fill="#32745D" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer> : <div className="empty"><h3>Причин внимания нет</h3></div>}</section>
    </div>
  </>
}
