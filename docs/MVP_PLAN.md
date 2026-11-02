# RouteGuard 2.0 MVP plan

Updated: 2026-11-02.

## Objective

Deliver a stable demonstration MVP that proves one complete organisational flow: an agreed multi-step route develops a problem, RouteGuard creates one actionable coordinator task, the coordinator records a contact and continuation, required steps complete in order, and factual analytics change accordingly.

## Work phases and dependencies

```text
Context and baseline
        ↓
P0 domain invariants and truthful history
        ↓
P0 API isolation, idempotency and regression tests
        ↓
P1 task/contact/analytics API contracts
        ↓
P1 route card, queue and dashboard UI
        ↓
Mutation browser journey and release verification
        ↓
Private release package (no automatic production deployment)
```

## P0 — stability and data integrity

### P0.1 Truthful multi-event history

- Seed auditable events that correspond to the actual synthetic route, steps, appointments, documents and completion state.
- Preserve event ordering and existing records.
- Add regression tests for seeded multi-step history and several sequential live actions.

Acceptance:

- P019 exposes multiple truthful events, not one decorative summary.
- New actions append events and never remove prior history.
- API returns events in deterministic reverse chronological order.

### P0.2 Route transition guards

- Reject step booking/completion for non-active routes.
- Reject completing a later required step while an earlier required step is incomplete.
- Keep repeat completion of an already completed step harmless.
- Prevent creation of an unusable route without an agreed step plan; either require validated step input or remove the unsupported public operation.

Acceptance: draft, cancelled and completed routes cannot be mutated through ordinary step commands; P013 cannot close early.

### P0.3 Tasks for deviations without duplicates

- Create or reuse one open follow-up task after cancellation or no-show.
- Resolve the relevant follow-up task when a replacement appointment is booked.
- Reuse/update an open callback task instead of creating infinite duplicates.
- Reject callback dates in the past.

Acceptance: repeated actions leave one current task and an intact audit trail.

### P0.4 Visible contact results

- Serialize contact outcome, note, employee, callback time and creation time.
- Show structured contact attempts in the route card.
- Give the call assistant the latest organisational contact context.

Acceptance: a coordinator can reload the page and recover what happened and what must happen next.

### P0.5 Workspace and API regression protection

- Add API tests for foreign route, step, slot, appointment, task and employee IDs.
- Test CSRF/session behaviour and safe error responses.
- Define permission rules for persistent admin/coordinator roles without blocking the writable demo.

### P0.6 Deployment correctness

- Decode URI components in `DATABASE_URL` and test special-character credentials.
- Document and then harden backup location, installer cleanup and rollback behaviour.
- Preserve migrations, existing PostgreSQL data and the current WSGI layout.

## P1 — complete demonstrable MVP

### P1.1 Coordinator task lifecycle

Introduce only the states required by the UX: new/open, in progress, waiting, repeat contact, done and closed for another reason. Add a migration and explicit transition rules only after P0 task deduplication is stable.

### P1.2 Factual dashboard and analytics

Document and implement formulas for:

- total, active and completed routes;
- completion rate;
- overdue active routes;
- cancelled and missed appointments;
- open/due coordinator tasks;
- completed coordinator actions.

Metrics must be workspace-scoped and derived from stored data. Demo-date advancement must produce consistent queue and dashboard results.

### P1.3 Route queue and main route card

- Add explicit sorting by priority, due date and assignee.
- Make current step, deviation, current task and next action visible together.
- Present separate typed history for events, appointments, contacts, comments and documents.
- Keep desktop, tablet and mobile flows usable.

### P1.4 Appointment continuation

Implement a server-side atomic reschedule command or label and test the existing two-step process honestly until atomic replacement is available.

### P1.5 Reproducible end-to-end scenario

Automate and demonstrate:

1. agreed multi-step route;
2. first step complete;
3. next appointment missed;
4. one follow-up task appears;
5. coordinator records the contact;
6. callback or replacement booking is stored;
7. remaining required steps complete in order;
8. route completes;
9. history and analytics reflect every real action.

## P2 — documented extension points only

- MIS and approved-plan import;
- telephony, SMS and email;
- 1C and Bitrix24 integration;
- optional generative text assistance without medical decisions;
- patient portal;
- predictive analytics;
- production processing of real medical data.

These do not block the MVP and must not displace P0/P1 stability.

## Agent responsibility map

| Role | Primary responsibility |
|---|---|
| Lead architect | integration, shared contracts, commits and final verification |
| Product analyst | lifecycle, user stories and acceptance criteria |
| Python backend | services, API, migrations and history correctness |
| Frontend/UI | route card, queue, dashboard, responsive presentation |
| Workflow/AI | task rules, contacts and deterministic call assistant |
| QA | regression matrix, API isolation and browser mutation journey |
| DevOps/security | SprintHost WSGI, release safety, secrets and rollback |

Parallel edits are allowed only for non-overlapping files. Backend API contracts are integrated before dependent frontend changes.

## Release gates

- All P0 acceptance tests pass on SQLite.
- Migration check reports no missing migrations.
- Frontend typecheck, build and audit pass.
- Playwright mutation journey passes at representative desktop and mobile widths.
- PostgreSQL-specific tests pass before claiming concurrency safety.
- Release package contains no tracked secrets.
- Production update requires a separate explicit approval and a current backup.

## Principal risks

- Remote `main` is an obsolete PHP implementation.
- Current production data and exact PostgreSQL state cannot be inferred from local files.
- SprintHost SSH may require interactive confirmation.
- Deployment is not yet fully atomic.
- Scope can expand beyond MVP; P2 remains documentation only.

