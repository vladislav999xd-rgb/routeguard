import { lazy, MutableRefObject, Suspense, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  BarChart3,
  CalendarCheck2,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileCheck2,
  LayoutDashboard,
  ListChecks,
  PhoneCall,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UsersRound,
} from 'lucide-react'
import './landing.css'

const RouteScene = lazy(() => import('./RouteScene'))

type LandingExperienceProps = {
  busy: boolean
  error: string
  hasWorkspace: boolean
  onOpenDemo: () => Promise<void>
}

function Mark() {
  return <svg className="story-mark" viewBox="0 0 44 44" aria-hidden="true">
    <path d="M8 31 22 22 34 8M9 11l13 11 13 12" />
    <circle cx="9" cy="11" r="4.3" /><circle cx="8" cy="31" r="4.3" />
    <circle cx="34" cy="8" r="4.3" /><circle cx="35" cy="34" r="4.3" /><circle cx="22" cy="22" r="4.3" />
  </svg>
}

function StoryBrand() {
  return <a className="story-brand" href="#top" aria-label="RouteGuard — на начало страницы"><Mark /><span><strong>RouteGuard</strong><small>координация маршрутов</small></span></a>
}

function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
  } catch {
    return false
  }
}

function useScene(progress: MutableRefObject<number>, root: MutableRefObject<HTMLElement | null>) {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const desktop = window.matchMedia('(min-width: 800px)')
    let idleId: number | undefined
    let delayId: number | undefined
    const supportsScene = () => desktop.matches && !reduced.matches && canUseWebGL()
    const updateMode = () => setEnabled(supportsScene())
    const updateProgress = () => {
      const node = root.current
      if (!node) return
      const available = Math.max(1, node.scrollHeight - window.innerHeight)
      progress.current = Math.min(1, Math.max(0, (window.scrollY - node.offsetTop) / available))
    }
    if (supportsScene()) {
      if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(() => setEnabled(true), { timeout: 1200 })
      else delayId = globalThis.setTimeout(() => setEnabled(true), 600)
    }
    updateProgress()
    desktop.addEventListener('change', updateMode)
    reduced.addEventListener('change', updateMode)
    window.addEventListener('scroll', updateProgress, { passive: true })
    window.addEventListener('resize', updateProgress, { passive: true })
    return () => {
      if (idleId !== undefined) window.cancelIdleCallback(idleId)
      if (delayId !== undefined) window.clearTimeout(delayId)
      desktop.removeEventListener('change', updateMode)
      reduced.removeEventListener('change', updateMode)
      window.removeEventListener('scroll', updateProgress)
      window.removeEventListener('resize', updateProgress)
    }
  }, [progress, root])
  return enabled
}

function SceneLabel({ number, children }: { number: string; children: string }) {
  return <span className="story-kicker"><b>{number}</b>{children}</span>
}

function DemoButton({ busy, hasWorkspace, onClick, className = '' }: { busy: boolean; hasWorkspace: boolean; onClick: () => Promise<void>; className?: string }) {
  return <button className={`story-button story-button-primary ${className}`} disabled={busy} onClick={() => void onClick()}>
    {busy ? 'Готовим демо…' : hasWorkspace ? 'Продолжить демо' : 'Открыть демо'}<ArrowRight aria-hidden="true" />
  </button>
}

function MiniDashboard() {
  const rows = [
    ['P006', 'Повторная запись', 'Сегодня'],
    ['P011', 'Подтвердить визит', 'Сегодня'],
    ['P014', 'Получить документ', '12 окт.'],
  ]
  return <div className="story-product" aria-label="Демонстрационный экран рабочего места координатора">
    <aside><StoryBrand /><span className="active"><LayoutDashboard />Обзор</span><span><RouteIcon />Маршруты</span><span><ListChecks />Задачи</span></aside>
    <div className="story-product-main">
      <div className="story-product-top"><span>Рабочий день</span><small>Демо · синтетические данные</small></div>
      <div className="story-metrics"><b>20<small>маршрутов</small></b><b>5<small>требуют внимания</small></b><b>3<small>звонка сегодня</small></b></div>
      <div className="story-table-head"><span>Пациент</span><span>Следующий шаг</span><span>Срок</span></div>
      {rows.map((row, index) => <div className={`story-table-row ${index === 0 ? 'selected' : ''}`} key={row[0]}>
        <span className="story-avatar">{row[0].slice(1)}</span><b>{row[0]}<small>демопациент</small></b><span>{row[1]}</span><time>{row[2]}</time>
      </div>)}
    </div>
  </div>
}

export default function LandingExperience({ busy, error, hasWorkspace, onOpenDemo }: LandingExperienceProps) {
  const root = useRef<HTMLElement | null>(null)
  const progress = useRef(0)
  const sceneEnabled = useScene(progress, root)

  return <main className={`story ${sceneEnabled ? 'has-webgl' : 'has-fallback'}`} ref={root} id="top">
    <a className="story-skip" href="#content">К содержанию</a>
    {sceneEnabled && <div className="story-canvas"><Suspense fallback={null}><RouteScene progress={progress} /></Suspense></div>}
    <header className="story-header">
      <StoryBrand />
      <nav aria-label="Основная навигация"><a href="#route">Как работает</a><a href="#workspace">Возможности</a><a href="#safety">Безопасность</a><a className="story-login" href="/app">Войти</a></nav>
    </header>

    <div id="content">
      <section className="story-scene story-hero" aria-labelledby="story-title">
        <div className="story-copy story-copy-wide">
          <SceneLabel number="01">маршрут пациента</SceneLabel>
          <h1 id="story-title">Каждый следующий шаг пациента — под контролем</h1>
          <p>RouteGuard собирает маршруты, задачи, записи и звонки в одном спокойном рабочем пространстве координатора.</p>
          <div className="story-actions"><DemoButton busy={busy} hasWorkspace={hasWorkspace} onClick={onOpenDemo} /><a className="story-button story-button-quiet" href="#route">Посмотреть путь<ChevronDown /></a></div>
          {error && <p className="story-error" role="alert">{error}</p>}
          <div className="story-trust"><span><ShieldCheck />Изолированные демоданные</span><span><Check />Без клинических решений</span></div>
        </div>
        <div className="story-fallback-route" aria-hidden="true"><i /><i /><i /><i /><span /></div>
        <span className="story-scroll-hint">Листайте, чтобы пройти маршрут <ChevronDown /></span>
      </section>

      <section className="story-scene story-problem" aria-labelledby="problem-title">
        <div className="story-copy">
          <SceneLabel number="02">проблема</SceneLabel>
          <h2 id="problem-title">Маршрут распадается на звонки, сроки и документы</h2>
          <p>Когда всё хранится в разных местах, координатору приходится вручную восстанавливать картину дня.</p>
        </div>
        <div className="story-card-grid">
          <article><Clock3 /><h3>Сроки</h3><p>Важные действия теряются среди текущих задач.</p></article>
          <article><PhoneCall /><h3>Звонки</h3><p>Следующий разговор нужно каждый раз собирать заново.</p></article>
          <article><FileCheck2 /><h3>Документы</h3><p>Статус подтверждений не всегда виден сразу.</p></article>
        </div>
      </section>

      <section className="story-scene story-route" id="route" aria-labelledby="route-title">
        <div className="story-copy story-copy-right">
          <SceneLabel number="03">единый маршрут</SceneLabel>
          <h2 id="route-title">От диагностики до контроля — одна понятная линия</h2>
          <p>Каждый этап хранит следующий шаг, срок и ответственного. RouteGuard организует процесс и не заменяет медицинское решение.</p>
        </div>
        <ol className="route-steps">
          <li><span>1</span><div><b>Диагностика</b><small>исследование и документы</small></div></li>
          <li className="current"><span>2</span><div><b>Лечение</b><small>текущий организационный этап</small></div></li>
          <li><span>3</span><div><b>Контроль</b><small>следующая дата наблюдения</small></div></li>
        </ol>
      </section>

      <section className="story-scene story-workspace" id="workspace" aria-labelledby="workspace-title">
        <div className="story-copy">
          <SceneLabel number="04">рабочее место</SceneLabel>
          <h2 id="workspace-title">День координатора виден целиком</h2>
          <p>Очередь внимания объясняет приоритет, а карточка маршрута сохраняет общий контекст действий.</p>
          <ul className="story-checks"><li><Check />понятная причина внимания</li><li><Check />единая история действий</li><li><Check />запись с проверкой доступности слота</li></ul>
        </div>
        <MiniDashboard />
      </section>

      <section className="story-scene story-assistant" aria-labelledby="assistant-title">
        <div className="story-copy story-copy-right">
          <SceneLabel number="05">помощник звонка</SceneLabel>
          <h2 id="assistant-title">К разговору не нужно готовиться с нуля</h2>
          <p>Система подставляет организационный контекст и помогает зафиксировать результат разговора.</p>
        </div>
        <article className="call-card">
          <div className="call-card-head"><span><PhoneCall /></span><div><small>Сценарий</small><h3>Подтверждение визита</h3></div></div>
          <div className="call-script"><small>Начало разговора</small><p>Здравствуйте! Уточняю, удобно ли вам подтвердить запись на выбранное время?</p><small>Уточнить</small><ul><li>подходит ли дата и время;</li><li>есть ли организационные вопросы;</li><li>нужно ли повторить адрес.</li></ul></div>
          <p className="call-note"><ShieldCheck />Сценарий не ставит диагноз и не даёт медицинских рекомендаций.</p>
        </article>
      </section>

      <section className="story-scene story-analytics" id="safety" aria-labelledby="analytics-title">
        <div className="story-copy">
          <SceneLabel number="06">объяснимая аналитика</SceneLabel>
          <h2 id="analytics-title">Сигналы внимания без чёрного ящика</h2>
          <p>Каждый приоритет сопровождается конкретной причиной: срок, отмена, неявка или отсутствующий документ.</p>
          <div className="safe-note"><TriangleAlert /><span><b>Организационный инструмент</b><small>RouteGuard не интерпретирует клинические данные.</small></span></div>
        </div>
        <div className="analytics-card">
          <div className="analytics-head"><div><small>Демонстрационные данные</small><h3>Состояние маршрутов</h3></div><BarChart3 /></div>
          <div className="bars"><span style={{ '--value': '82%' } as React.CSSProperties}><b>В работе</b><i /></span><span style={{ '--value': '46%' } as React.CSSProperties}><b>Требуют внимания</b><i /></span><span style={{ '--value': '67%' } as React.CSSProperties}><b>Шаг подтверждён</b><i /></span></div>
          <div className="reason-list"><span><i className="amber" />Срок сегодня <b>3</b></span><span><i className="red" />Есть просрочка <b>2</b></span><span><i />Нужен документ <b>1</b></span></div>
        </div>
      </section>

      <section className="story-scene story-final" aria-labelledby="final-title">
        <div className="final-panel">
          <span className="final-glow" aria-hidden="true"><Sparkles /></span>
          <SceneLabel number="07">посмотреть в работе</SceneLabel>
          <h2 id="final-title">Пройдите маршрут вместе с RouteGuard</h2>
          <p>Откройте изолированное демо с синтетическими данными и проверьте весь пользовательский путь.</p>
          <div className="story-actions"><DemoButton busy={busy} hasWorkspace={hasWorkspace} onClick={onOpenDemo} className="story-button-light" /><a className="story-button story-button-dark-quiet" href="/app">Войти в кабинет</a></div>
          {error && <p className="story-error story-error-light" role="alert">{error}</p>}
          <div className="final-meta"><span><UsersRound />Для координаторов</span><span><ClipboardList />Синтетические данные</span><span><CalendarCheck2 />Полный демосценарий</span></div>
        </div>
      </section>
    </div>

    <footer className="story-footer"><StoryBrand /><p>Самостоятельный демонстрационный продукт · данные синтетические</p><a href="#top">Наверх ↑</a></footer>
  </main>
}
