# RouteGuard: instructions for coding agents

## Product boundary

RouteGuard is a coordination system for completing patient routes. It tracks agreed organisational steps, deadlines, appointments, coordinator tasks, contacts and audit history. It does not diagnose, prescribe treatment or replace a medical information system. Demo and test data must remain synthetic.

The current local Python application is the source of truth. The remote `main` branch contains the retired PHP prototype and must never be copied over the Python implementation. Preserve working behaviour and make incremental, evidence-based changes.

## Current architecture

- Backend: Python 3.11 target, Django 5.2 LTS, Django REST Framework 3.16.
- Frontend: React 19, TypeScript, Vite; production receives prebuilt static assets.
- Database: PostgreSQL 14 in production; SQLite is only a fast local test/development fallback.
- Runtime: WSGI under SprintHost Apache/uWSGI. Do not introduce a required ASGI process, Node.js server, worker daemon or queue without proving SprintHost X-4 support.
- Deployment: private release payload embedded in `FIX/fix.php`, uploaded and executed through SSH. Never deploy production without explicit user approval.

Important modules:

- `core/models.py`: workspace-scoped domain entities and database constraints.
- `core/services.py`: transactional domain commands and audit creation.
- `core/views.py`: API boundary; every workspace-owned lookup must be scoped.
- `core/demo.py`: deterministic synthetic scenarios P001-P020.
- `core/call_assistant.py`: deterministic organisational call scripts, not generative AI.
- `frontend/src/App.tsx`: authenticated/demo application flow.
- `frontend/src/landing/`: presentation landing and WebGL experience.
- `deploy/sprinthost/`, `scripts/`: packaging and hosting automation.

## Domain invariants

1. Every operational record belongs to exactly one `Workspace`.
2. Never accept an object ID without also filtering it by the current workspace.
3. GET requests must not mutate data.
4. Domain mutations belong in transactional service functions, not serializers or presentation components.
5. Required route steps complete in sequence. A draft, cancelled or completed route must not accept ordinary step mutations.
6. A route completes only when every required step is complete and every required confirmation exists.
7. Audit events, coordinator comments, contact results and appointment history are different records. Do not replace one with fabricated entries from another.
8. Repeated commands must not create duplicate active appointments or coordinator tasks.
9. Demo time and real event timestamps are distinct concepts.

## Code conventions

- Follow the existing Django/DRF service-oriented structure and TypeScript component style.
- Prefer small, explicit domain helpers over a second parallel backend implementation.
- Validate state transitions server-side even when the UI hides an action.
- Use ORM queries and database constraints; do not assemble SQL from user input.
- Return safe public error messages. Do not expose tracebacks, secrets or internal paths.
- Add a migration for every schema change. Migrations must preserve existing rows and be safe to rerun through `migrate`.
- Do not add a dependency unless the existing stack cannot solve the requirement simply.

## Security and data

- Never commit `.env`, database credentials, SSH material, owner credentials, FIX tokens or release archives.
- Keep CSRF enforcement for authenticated and guest demo sessions.
- Preserve secure cookie, HTTPS, HSTS and workspace-isolation settings.
- Persistent workspace permissions and demo permissions must be considered separately.
- Never use real patient or clinical data in fixtures, screenshots, tests or demos.
- External AI is optional and must never receive medical data by default. Template logic must be labelled as template logic.

## Required checks

Run checks proportional to the change. Before a release, run at least:

```text
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test core.tests -v 2
cd frontend
npm run typecheck
npm audit --omit=dev
npm run build
npx playwright test
```

PostgreSQL-specific locking and constraint behaviour must be tested on PostgreSQL before claiming production concurrency guarantees. Report skipped or unavailable checks explicitly.

## Git and existing work

- Work from the current Python branch, never from the legacy PHP `main` content.
- Do not use `reset --hard`, `clean`, force push or destructive checkout operations.
- Preserve unrelated user changes. At the start of this work, modified screenshot files are user-owned and must not be staged unless explicitly requested.
- Use logical commits. Do not merge into `main` automatically.
- Do not deploy production automatically.

## Multi-agent coordination

- The lead agent owns architecture, integration, shared files and final verification.
- Begin specialist work with read-only audits when scopes overlap.
- Assign non-overlapping files before allowing parallel edits. Never let two agents edit the same file concurrently.
- Backend changes precede dependent frontend and browser-test changes.
- QA verifies actual commands and distinguishes passed, failed and unavailable checks.
- DevOps may inspect packaging locally but may not contact or mutate production without approval.
- Each specialist must report concrete files, evidence, limitations and acceptance criteria. Never simulate an agent or invent a test result.

