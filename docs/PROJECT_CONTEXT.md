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
- Active-route and required-step-order guards for booking and completion.
- One reusable follow-up task after cancellation/no-show, closed after successful rebooking.
- Deterministic call assistant, structured contact history and one updatable callback task.
- Idempotent contact submission through `Idempotency-Key`.
- Truthful seeded audit sequences for the synthetic route state instead of one summary event.
- Workspace-scoped snapshot analytics with documented formulas.
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

## P0 implementation in the current working tree

These changes are present locally and require the lead agent's final integrated test run before release:

1. `core/demo.py` emits separate truthful events for route creation/confirmation, steps, appointments, documents, completed steps, tasks, comments and final scenario state. P019 no longer relies on one decorative summary.
2. `book_slot` and `complete_step` require an active route and prevent moving past an earlier incomplete required step.
3. Cancellation/no-show creates or reuses one open `follow_up`; successful rebooking marks it done.
4. Callback time must be in the future. Repeated callback results update one open callback task rather than accumulating open duplicates.
5. Contact writes accept `Idempotency-Key`; a repeated key returns the original `ContactResult` without duplicating contact or audit event.
6. Route detail serializes structured contacts in reverse chronological order. The UI displays outcome, note, employee and callback time; the assistant exposes attempt count, latest contact and next open task.
7. P013 is now the complete synthetic continuation path: first step complete, second appointment missed, one follow-up task, rebooking, task resolution and final completion.
8. `POST /routes/` rejects creation without a validated agreed step plan using `route_plan_required`.
9. `dashboard.analytics` returns exact workspace-scoped snapshot metrics. Overdue routes use dynamic due-date logic and do not double-count a route that also has `attention_reason=overdue`.
10. `database_config` decodes percent-encoded database name, user and password from `DATABASE_URL`.
11. Vite production configuration uses `sourcemap: false`.

No model schema change was required for this P0 set; the existing `ActionKey`, `Task`, `ContactResult` and audit models are reused.

## Remaining P0/release risks

- The cross-workspace mutation regression currently covers the appointment mutation path; direct route, step, slot, task and employee identifier cases should be added.
- Persistent membership roles are reported but are not yet enforced as a complete mutation permission matrix.
- PostgreSQL locking and partial-constraint behaviour has not been proven by SQLite tests.
- The rebuilt static bundle has no JavaScript source maps; this check must be repeated for each release package.
- The P013 browser mutation journey passes locally on mobile and desktop; production-like PostgreSQL and release-package checks remain release gates.

## Remaining P1 gaps

- Task workflow supports only open/done/cancelled.
- There is no atomic appointment reschedule operation.
- Contact history is now visible; a unified typed timeline across contacts, appointments, comments, documents and audit events remains optional UI work.
- Snapshot analytics formulas exist; historical periods and coordinator performance trends do not.
- Queue sorting is fixed and there is no server pagination.
- The assistant shows attempt count, last result and next open task, but does not use generative AI or external communication services.
- Browser tests are not executed by CI; production PostgreSQL concurrency is not covered.

## Deployment and operational limitations

`scripts/build_release.ps1` creates a private archive and embeds its payload and environment in `FIX/fix.php`. `scripts/deploy_via_ssh.ps1` uploads and runs that installer. SprintHost authentication may still require an interactive password and confirmation code.

Known risks requiring hardening before a production-grade update:

- backups and the installer currently live below `public_html/FIX`, protected by permissions and `.htaccess` but still inside the public tree;
- deployment replaces public files before all Python setup and checks complete, so rollback is manual;
- database export is an operational prerequisite rather than an automated step;
- demo creation has no explicit rate limit and cleanup is triggered opportunistically unless a cron job is configured;
- the release process still needs an artifact-level check that source maps are absent after the configured `sourcemap: false` build.

No production deployment is part of the current development phase without explicit approval.

## Verification status on 2026-11-02

- Django system check passed.
- Migration drift check reported no changes.
- All 26 backend tests passed on SQLite.
- Frontend typecheck and production build passed; `npm audit --omit=dev` reported zero vulnerabilities.
- The rebuilt static bundle contains no `.map` files.
- Existing navigation/analytics journeys passed on the configured viewports.
- P013 mutation passed on mobile and desktop; landing motion/WebGL fallback checks passed on desktop.

PostgreSQL concurrency verification and production package inspection remain explicit release gates. No production deployment was performed.

