# Архитектура RouteGuard

## Общий подход

RouteGuard — компактное серверное PHP-приложение без отдельного frontend-сборщика и фоновых сервисов. Такой формат выбран для размещения на обычном виртуальном хостинге: приложение требует только PHP, PDO, MySQL и Apache.

```mermaid
flowchart TB
    subgraph Client[Браузер]
        UI[HTML / Bootstrap / JavaScript]
        CHART[Chart.js]
    end

    subgraph Application[PHP-приложение]
        INDEX[index.php<br/>страницы]
        API[api.php<br/>команды]
        BOOT[bootstrap.php<br/>конфигурация и безопасность]
        REPO[RouteRepository<br/>чтение данных]
        CALL[CallAssistant<br/>сценарии звонка]
        SEED[DemoSeeder<br/>демоданные]
    end

    subgraph Data[Хранилище]
        MYSQL[(MySQL<br/>production)]
        SQLITE[(SQLite<br/>только локально)]
    end

    UI --> INDEX
    UI --> API
    CHART --> INDEX
    INDEX --> BOOT
    API --> BOOT
    INDEX --> REPO
    INDEX --> CALL
    REPO --> MYSQL
    API --> MYSQL
    SEED --> MYSQL
    REPO -. RG_DEV .-> SQLITE
    SEED -. RG_DEV .-> SQLITE
```

## Компоненты

| Компонент | Ответственность |
|---|---|
| `index.php` | Маршрутизация страниц и серверный рендеринг интерфейса |
| `api.php` | Изменяющие состояние команды, валидация и перенаправления |
| `app/bootstrap.php` | Загрузка конфигурации, сессии, PDO, CSRF и общие функции |
| `app/RouteRepository.php` | Запросы чтения для обзора, очереди, карточки и расписания |
| `app/CallAssistant.php` | Выбор организационного сценария звонка по состоянию маршрута |
| `app/DemoSeeder.php` | Создание изолированных синтетических рабочих пространств |
| `install.php` | Проверка окружения, создание схемы и первого владельца |
| `FIX/fix.php` | Авторизованное файловое обновление уже загруженной версии |

## Обработка запроса

### Чтение страницы

```mermaid
sequenceDiagram
    actor User as Координатор
    participant Index as index.php
    participant Boot as bootstrap.php
    participant Repo as RouteRepository
    participant DB as PDO / БД

    User->>Index: GET /index.php?page=route&id=...
    Index->>Boot: Проверка сессии и workspace
    Index->>Repo: find(routeId)
    Repo->>DB: Подготовленные SELECT-запросы
    DB-->>Repo: Маршрут, шаги, записи, история
    Repo-->>Index: Модель карточки
    Index-->>User: HTML
```

### Изменение состояния

```mermaid
sequenceDiagram
    actor User as Координатор
    participant API as api.php
    participant Boot as bootstrap.php
    participant DB as PDO / БД

    User->>API: POST action + CSRF
    API->>Boot: Авторизация, роль, workspace, CSRF
    API->>DB: Транзакция и подготовленные запросы
    API->>DB: Запись события
    API-->>User: Redirect + flash-сообщение
```

## Изоляция данных

Каждая публичная демосессия получает собственный `workspace_id`. Все рабочие сущности содержат этот идентификатор, а серверные запросы дополнительно фильтруются по текущему workspace. Это предотвращает изменение данных другой демосессии через подмену числового ID.

## Помощник звонка

`CallAssistant` не обращается к внешним сервисам и не использует генеративный ИИ. Он выбирает заранее подготовленный организационный сценарий по причине внимания, текущему шагу и записи пациента. В результате возвращаются цель, вступление, вопросы, предложение, завершение и рекомендуемое следующее действие.

## Модель безопасности

- сессии используются для пользователя и рабочего пространства;
- изменяющие запросы принимаются только методом POST;
- формы защищены CSRF-токеном;
- SQL выполняется через подготовленные запросы;
- действия проверяют принадлежность сущности текущему workspace;
- настоящий `config.php` и локальные данные исключены из Git;
- `.htaccess` закрывает конфигурацию, схемы и внутренние каталоги от прямого доступа;
- `FIX/fix.php` требует отдельный maintenance token при веб-запуске.

## Границы решения

В текущую архитектуру не входят телефония, МИС, SSO, очереди сообщений, фоновые задачи и отправка уведомлений. Эти интеграции должны добавляться через отдельные адаптеры, не смешивая их с правилами маршрутов и шаблонами помощника.
