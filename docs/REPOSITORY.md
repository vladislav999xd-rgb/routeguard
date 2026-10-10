# Карта репозитория

```text
routeguard/
├── frontend/              # React/TypeScript и Playwright
├── core/                  # Django domain, API, demo, tests
├── routeguard/            # settings, urls, WSGI
├── backend_static/        # собранный SPA
├── deploy/sprinthost/     # hosting entrypoint и FIX template
├── scripts/               # сборка release-архива
├── docs/                  # проектная документация
├── manage.py
└── requirements*.txt
```

Основной код v2 находится в `frontend`, `core` и `routeguard`. Корневые PHP-файлы относятся к сохранённому прототипу первой версии и не попадают в архив v2. После приёмки их можно перенести в отдельную legacy-ветку или тег, сохранив историю Git.

Изменения в правилах маршрута начинаются с теста в `core/tests`, затем вносятся в `core/services.py`. Изменения UI проверяются строгой сборкой и Playwright на трёх viewport. Production-архив всегда формируется `scripts/build_release.ps1`, поэтому `.env` не попадает в Git.
