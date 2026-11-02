# RouteGuard future architecture (P2)

Updated: 2026-11-02.

This document describes extension points after the demonstration MVP is stable. None of these capabilities is required for P0/P1 and none should be represented in the UI as working before a real integration exists.

## Architectural boundary

The current Django/DRF application remains the system of coordination for agreed organisational route steps. Future integrations must pass through explicit adapters and domain commands rather than writing RouteGuard tables directly.

External systems may supply an approved plan, appointment state or communication result. They must not cause RouteGuard to diagnose, prescribe, reinterpret clinical information or silently change a clinician-approved route.

## MIS integration

Purpose:

- import an already approved patient-route plan;
- receive identifiers and organisational statuses for appointments/results;
- send back coordination status where a contract permits it.

Proposed boundary:

- versioned adapter per vendor/protocol;
- explicit mapping from external identifiers to workspace-owned records;
- idempotent inbound event key and immutable import audit;
- validation/staging before an imported plan becomes active;
- reconciliation report for rejected or ambiguous records.

No MIS connector should bypass workspace scoping or create medical decisions from free text.

## Telephony, SMS and email

Telephony and messaging should be optional providers behind a communication interface. Store provider message/call identifiers and delivery state separately from `ContactResult`: an attempted external call is not automatically a confirmed coordinator result.

Required controls:

- recipient consent and approved templates;
- minimal payloads without clinical conclusions;
- retry and deduplication keys;
- delivery webhooks authenticated and scoped to a workspace;
- retention limits and an audit of who initiated communication;
- provider outage must not block manual coordination.

## 1C and Bitrix24

These integrations should exchange narrowly defined business records through adapters, not mirror the full RouteGuard database.

- 1C: organisational/billing references only when a concrete pilot defines the contract.
- Bitrix24: task or lead synchronization only with an explicit ownership and conflict-resolution policy.
- RouteGuard remains authoritative for route-step completion, coordination tasks and its own audit history.
- Every outbound/inbound mapping requires stable external IDs, idempotency and a reconciliation screen/log.

## Optional generative helper

A future language-model helper may draft an organisational message or summarize already visible coordination history. It must remain optional: the deterministic call assistant and all core actions work without an API key.

Privacy and safety constraints:

- no medical data is sent to an external model by default;
- use de-identified/minimized context only after a documented legal and security review;
- never generate diagnoses, treatment, examinations or route changes;
- label generated text and require human review before use;
- record model/provider/version and user confirmation without storing hidden reasoning;
- provider failure falls back to deterministic templates.

## Patient portal

A patient-facing portal is a separate security boundary, not an extra coordinator screen. Before implementation it requires:

- verified patient identity and account recovery;
- explicit consent and delegated-access rules;
- a patient-safe projection of route data;
- notification preferences and privacy controls;
- protection against cross-patient access;
- legal review of which clinical/organisational information may be displayed.

The portal should call dedicated patient-scoped APIs rather than reuse staff endpoints.

## Predictive analytics

Prediction of route non-completion is postponed until there is a lawful, representative and quality-controlled dataset. Initial work should remain descriptive and explainable.

Any later predictive feature requires:

- documented target and evaluation protocol;
- bias, drift and subgroup analysis;
- explainable factors and human override;
- separation from clinical decision-making;
- monitoring and rollback;
- no training on synthetic demo data presented as evidence of real-world accuracy.

## Privacy boundaries

Before real patient data or external integrations:

- complete a data-flow and threat model;
- define controller/processor responsibilities and retention;
- encrypt transport and backups, rotate secrets and restrict operator access;
- add audit export, incident response and deletion/correction procedures;
- separate demo, test and production environments;
- prohibit production data in screenshots, fixtures, analytics development or external AI prompts.

## Why SprintHost WSGI is not a background-worker platform

The current SprintHost X-4 layout is request/response WSGI under Apache/uWSGI. A long-running queue worker, ASGI event loop, telephony listener or reliable scheduler cannot be assumed to stay alive on ordinary shared hosting. Web requests are unsuitable for durable retries and delayed jobs because the process may be recycled and request time is bounded.

Integrations that require background delivery, webhook processing, scheduled reconciliation or model calls therefore need separate proven infrastructure, for example:

- a managed queue plus worker service;
- a scheduler/cron with idempotent short-lived management commands for limited workloads;
- a dedicated application host where worker lifecycle and monitoring are controlled.

Until such infrastructure is approved, RouteGuard must keep synchronous WSGI actions short, expose manual fallbacks and avoid claiming reliable asynchronous integrations.
