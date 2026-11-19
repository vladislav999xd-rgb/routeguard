import {
  CalendarCheck2,
  Check,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  ListChecks,
  PhoneCall,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react'
import './landing.css'

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
  return <a className="story-brand" href="#top" aria-label="МедМаршрут — на начало страницы">
    <Mark /><span><strong>МедМаршрут</strong><small>координация маршрутов</small></span>
  </a>
}

function DemoButton({ busy, hasWorkspace, onClick, light = false }: {
  busy: boolean
  hasWorkspace: boolean
  onClick: () => Promise<void>
  light?: boolean
}) {
  return <button
    className={`story-button ${light ? 'story-button-light' : 'story-button-primary'}`}
    disabled={busy}
    onClick={() => void onClick()}
  >
    {busy ? 'Готовим демо…' : hasWorkspace ? 'Продолжить демо' : 'Открыть демо'}
  </button>
}

function ProductPreview() {
  return <div className="concept-product" aria-label="Пример карточки маршрута пациента">
    <div className="concept-product-bar">
      <span><i /> Карточка пациента</span>
      <small>Синтетические данные</small>
    </div>
    <div className="concept-person">
      <span className="concept-avatar">АЛ</span>
      <div><strong>Анна Лебедева</strong><small>P013 · маршрут активен</small></div>
      <span className="concept-status">В работе</span>
    </div>
    <div className="concept-next">
      <small>Следующее действие</small>
      <strong>Повторно связаться и подобрать время</strong>
      <p>Предыдущая запись отмечена как неявка. Срок действия — сегодня.</p>
      <div><span><PhoneCall />Связаться</span><span><CalendarCheck2 />Записать</span></div>
    </div>
    <ol className="concept-route">
      <li className="done"><span><Check /></span><div><strong>Диагностика</strong><small>Завершено</small></div></li>
      <li className="current"><span>2</span><div><strong>Лечение</strong><small>Требует внимания</small></div></li>
      <li><span>3</span><div><strong>Контроль</strong><small>Ожидается</small></div></li>
    </ol>
  </div>
}

const journey = [
  { icon: Search, title: 'Найти пациента', text: 'Поиск по имени или внутреннему идентификатору.' },
  { icon: RouteIcon, title: 'Увидеть маршрут', text: 'Текущий этап, срок и причина внимания собраны в карточке.' },
  { icon: PhoneCall, title: 'Выполнить действие', text: 'Связаться, подобрать время или отметить выполнение.' },
  { icon: ClipboardCheck, title: 'Зафиксировать результат', text: 'Звонок, запись и изменение этапа сохраняются в истории.' },
]

export default function LandingExperience({ busy, error, hasWorkspace, onOpenDemo }: LandingExperienceProps) {
  return <main className="story" id="top">
    <a className="story-skip" href="#content">К содержанию</a>
    <header className="story-header">
      <StoryBrand />
      <nav aria-label="Основная навигация">
        <a href="#purpose">Для чего нужен</a>
        <a href="#workflow">Как работает</a>
        <a href="#boundaries">Границы продукта</a>
        <a className="story-login" href="/app">Войти</a>
      </nav>
    </header>

    <div id="content">
      <section className="concept-hero" aria-labelledby="story-title">
        <div className="concept-hero-copy">
          <span className="story-kicker">Рабочее пространство координатора</span>
          <h1 id="story-title">Довести маршрут пациента до фактического выполнения</h1>
          <p>МедМаршрут помогает администратору клиники быстро понять, что должно произойти дальше: связаться с пациентом, подобрать время, получить подтверждение или закрыть выполненный этап.</p>
          <div className="story-actions">
            <DemoButton busy={busy} hasWorkspace={hasWorkspace} onClick={onOpenDemo} />
            <a className="story-button story-button-quiet" href="#workflow">Как устроен процесс</a>
          </div>
          {error && <p className="story-error" role="alert">{error}</p>}
          <div className="story-trust">
            <span><ShieldCheck />Только синтетические демоданные</span>
            <span><Check />Без клинических решений</span>
          </div>
        </div>
        <ProductPreview />
      </section>

      <section className="concept-purpose" id="purpose" aria-labelledby="purpose-title">
        <div className="concept-section-head">
          <span className="story-kicker">Зачем нужен МедМаршрут</span>
          <h2 id="purpose-title">Чтобы организационные шаги не терялись между назначением и визитом</h2>
          <p>Продукт объединяет разрозненные действия координатора в один понятный рабочий процесс.</p>
        </div>
        <div className="concept-outcomes">
          <article><ListChecks /><h3>Понятный приоритет</h3><p>Видно, кому нужно позвонить сегодня, где пропущен срок и почему маршрут требует внимания.</p></article>
          <article><UserRoundPlus /><h3>Одна карточка пациента</h3><p>Маршрут, записи, документы, контакты и история доступны в одном контексте.</p></article>
          <article><FileText /><h3>Проверяемая история</h3><p>Каждое организационное действие сохраняется отдельно и не подменяет медицинский факт.</p></article>
        </div>
      </section>

      <section className="concept-workflow" id="workflow" aria-labelledby="workflow-title">
        <div className="concept-section-head">
          <span className="story-kicker">Ежедневный процесс</span>
          <h2 id="workflow-title">От поиска пациента до следующего подтверждённого шага</h2>
        </div>
        <ol className="journey-list">
          {journey.map(({ icon: Icon, title, text }) => <li key={title}>
            <span><Icon /></span><div><strong>{title}</strong><p>{text}</p></div>
          </li>)}
        </ol>
        <div className="workflow-note"><LayoutDashboard /><p><strong>Главный принцип:</strong> основные действия выполняются внутри карточки пациента, без переходов между множеством разделов.</p></div>
      </section>

      <section className="concept-boundaries" id="boundaries" aria-labelledby="boundaries-title">
        <div>
          <span className="story-kicker">Честные границы продукта</span>
          <h2 id="boundaries-title">Организация процесса, а не медицинское решение</h2>
          <p>МедМаршрут хранит назначенные этапы и помогает координировать их выполнение. Диагнозы, назначения и клиническую срочность определяет медицинский специалист.</p>
        </div>
        <ul>
          <li><Check />Показывает следующий организационный шаг</li>
          <li><Check />Готовит шаблонный сценарий звонка</li>
          <li><Check />Проверяет последовательность этапов</li>
          <li><Check />Сохраняет записи, контакты и историю</li>
        </ul>
      </section>

      <section className="concept-final" aria-labelledby="final-title">
        <div>
          <span className="story-kicker">Демонстрационный контур</span>
          <h2 id="final-title">Посмотрите, как маршрут двигается по этапам</h2>
          <p>Откройте изолированное демо: найдите пациента, зафиксируйте звонок, создайте запись и завершите следующий этап.</p>
        </div>
        <DemoButton busy={busy} hasWorkspace={hasWorkspace} onClick={onOpenDemo} light />
        {error && <p className="story-error story-error-light" role="alert">{error}</p>}
      </section>
    </div>

    <footer className="story-footer">
      <StoryBrand />
      <p>Демонстрационный продукт · данные синтетические</p>
      <span><UsersRound />Для координаторов частных клиник</span>
    </footer>
  </main>
}
