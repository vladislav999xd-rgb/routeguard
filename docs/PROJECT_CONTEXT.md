# RouteGuard project context

Updated: 2026-11-02. This document describes the current local Python version.

## Source of truth and history

RouteGuard began as a PHP/MySQL prototype. The remote `main` branch still represents that retired implementation. The active local line was migrated to Python and is currently developed from commit `e986772`; the RouteGuard 2.0 work continues in `feature/routeguard-2-mvp`.

Do not restore files from PHP `main` over this checkout. The old implementation is useful only as behavioural history when a Python feature is demonstrably incomplete.

At the start of this phase, nine PNG files under `screenshots/` were already modified. They are user-owned changes and are outside the implementation scope.

## Actual technology stack

| Layer | Technology |
|---|---|
| Backend | Python, Django 5.2.18, Django REST Framework 3.16.1 |
| Production runtime | WSGI, Apache/uWSGI on SprintHost X-4 |
| Frontend | React 19, TypeScript, Vite |
| Presentation | Three.js / React Three Fiber and GSAP for the landing |
| Production database | PostgreSQL 14 through `DATABASE_URL` |
| Local fallback | SQLite |
| Browser tests | Playwright with Microsoft Edge |
| CI | GitHub Actions, Python 3.11 and Node.js 22 |

Node.js is not required on production. Vite output is committed under `backend_static/app` and served by Django/static hosting.

## Runtime architecture

The browser uses a cookie-backed Django session. An authenticated user resolves to a persistent workspace through `Membership`; a guest demo receives a UUID demo workspace stored in the session. API querysets scope operational records to that workspace.

Domain commands in `core/services.py` use transactions and create `AuditEvent` records. `core/views.py` exposes the DRF API. `core/demo.py` creates 20 deterministic synthetic scenarios. React consumes route summaries and detailed route data through `frontend/src/api.ts` and `frontend/src/App.tsx`.

Production layout:

```text
~/domains/<domain>/
├── public_html/
│   ├── site.wsgi
│   ├── .htaccess
│   └── static/
└── routeguard_app/
    ├── .venv/
    ├── .env
    ├── manage.py
    ├── core/
    └── routeguard/
```

## Implemented capabilities

- Persistent and isolated guest demo workspaces.
- Twenty synthetic scenarios P001-P020.
- Routes, ordered route steps, appointments, slots, documents, tasks, comments, contact results and audit events.
- Explainable attention priority without ML.
- Route confirmation and coordinator assignment.
- Transactional slot booking with row locks, database constraints and an idempotency key.
- Step completion, appointment cancellation/no-show and document confirmation.
- Deterministic call assistant and callback task creation.
- Dashboard, route queue, route card, tasks, schedule and analytics views.
- Responsive application and a separate presentation landing.
- Private release builder, SSH uploader, backup creation, migrations, static collection and WSGI bootstrap.

## Data model and separation of history

- `RouteStep`: agreed route plan and completion state.
- `Appointment`: each scheduled, cancelled, missed or completed booking.
- `AuditEvent`: immutable system/user action log.
- `Comment`: coordinator-authored notes.
- `ContactResult`: structured outcome of a call, optional note and callback time.
- `Task`: coordinator work item.

These collections must remain distinct in storage, even if the UI later presents a combined chronological timeline.

## Confirmed P0 problems

1. Demo seeding creates complex state but only one `scenario_seeded` audit event per route. API and React do not truncate history; the missing source events cause the one-item history regression.
2. `complete_step` and `book_slot` do not enforce an active route or ordered required steps.
3. Cancellation and no-show set attention state but do not create a coordinator follow-up task.
4. Repeated callback results can create duplicate open callback tasks; contact submission has no idempotency contract.
5. `ContactResult` notes and callback dates are stored but not serialized in route detail or shown in the application.
6. `POST /routes/` can create a route without steps.
7. Workspace scoping is broadly present, but cross-workspace mutation attempts are not covered by API tests.
8. Persistent membership roles are reported but not enforced for mutations.
9. Dashboard attention metrics mix dynamic priority with stored `attention_reason`, so advancing demo time can produce inconsistent counts.
10. URI-encoded database credentials from the release builder are not explicitly decoded by `database_config`.

## Confirmed P1 gaps

- Task workflow supports only open/done/cancelled.
- There is no atomic appointment reschedule operation.
- Full appointment and contact history is not visible.
- Analytics lacks documented completion, overdue, cancellation, no-show and coordinator-action formulas.
- Queue sorting is fixed and there is no server pagination.
- The assistant does not show previous attempts or the last result.
- Browser tests are not executed by CI; production PostgreSQL concurrency is not covered.

## Deployment and operational limitations

`scripts/build_release.ps1` creates a private archive and embeds its payload and environment in `FIX/fix.php`. `scripts/deploy_via_ssh.ps1` uploads and runs that installer. SprintHost authentication may still require an interactive password and confirmation code.

Known risks requiring hardening before a production-grade update:

- backups and the installer currently live below `public_html/FIX`, protected by permissions and `.htaccess` but still inside the public tree;
- deployment replaces public files before all Python setup and checks complete, so rollback is manual;
- database export is an operational prerequisite rather than an automated step;
- demo creation has no explicit rate limit and cleanup is triggered opportunistically unless a cron job is configured;
- production source maps are currently emitted.

No production deployment is part of the current development phase without explicit approval.

## Baseline verification on 2026-11-02

- `python manage.py check`: passed.
- `python manage.py makemigrations --check --dry-run`: no changes.
- `python manage.py test core.tests -v 2`: 14/14 passed on SQLite.
- `npm run typecheck`: passed.
- `npm audit --omit=dev`: 0 reported vulnerabilities.
- Existing specialist QA also ran the journey and analytics Playwright specs successfully; full mutation coverage and PostgreSQL testing remain open.

