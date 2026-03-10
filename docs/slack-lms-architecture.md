# Production-Ready Slack LMS Architecture

**Stack:** Slack App + Google Apps Script + Google Sheets  
**Constraint:** Minimal, maintainable, production-ready, no external workflow/server stack

## 1) Architectural vision

This architecture uses:

- **Slack** as the learner and manager experience layer,
- **Google Sheets** as the control plane and auditable system of record,
- **Google Apps Script** as the orchestration and business-logic layer.

The approach is intentionally "lean": it optimizes for operational simplicity, transparent data, and quick admin iteration over maximal throughput.

### Core design principles

1. **Acknowledge-first:** Slack interactions must be acknowledged quickly (target <3 seconds), then heavy work is queued.
2. **Sheet-as-truth:** durable state transitions are written to Sheets before/alongside external side effects.
3. **Workflow-first orchestration:** Slack handles interaction UX; Apps Script handles data logic, sequencing, and validation.
4. **Idempotent processing:** retries and duplicate deliveries do not create duplicate sends or state corruption.
5. **Recoverable operations:** failures flow to retry/dead-letter paths with clear admin replay controls.

## 2) Logic distribution matrix

| Functional area | Primary component | Why it lives there |
|---|---|---|
| Learner onboarding UX | Slack (forms/modals/workflows) | Native low-latency interaction and admin-editable user experience |
| Onboarding state writes | Apps Script + Sheets | Controlled validation and persisted enrollment/progress state |
| Lesson delivery scheduling | Apps Script triggers + Queue | Deterministic scheduling, retries, throttling, and dedupe |
| Progression/prerequisites | Apps Script modules | Centralized business rules away from Slack UI concerns |
| Admin bulk operations | Sheets + Apps Script | Human-verifiable input and batched processing |
| Reminders and escalations | Apps Script triggers | Time-based automation without user initiation |
| Reporting dashboards | Sheets rollups | Low-friction visibility for non-technical operators |

## 3) End-to-end runtime flow

1. Slack sends command/event/interaction to Apps Script web endpoint.
2. `Auth.gs` verifies Slack signature + timestamp freshness.
3. `Router.gs` dispatches to command/event/modal handler.
4. Handler performs minimal synchronous logic and writes queue jobs.
5. Queue processor claims jobs under lock, executes business actions.
6. `Slack.gs` sends DMs/modals/messages and captures response metadata.
7. State is written to `Progress`, `Deliveries`, `Approvals`, `Audit_Log`, `Error_Log`.

## 4) Google Sheets data layer (system of record)

### Core tabs

- **Operational:** `Users`, `Cohorts`, `Tracks`, `Lessons`, `Lesson_Content`, `Enrollments`, `Progress`, `Deliveries`, `Reminders`, `Approvals`, `Queue`
- **Configuration:** `Settings`, `Workflow_Rules`, `Message_Templates`
- **Operations/reporting:** `Audit_Log`, `Error_Log`, `Admin_Actions`, dashboard tabs

### ID and relationship strategy

Use stable unique IDs (examples):

- `USR-0001`, `COH-2026-APR-A`, `TRK-ONBOARD-01`, `LES-M01-W01-D01`, `ENR-000245`, `DLV-001274`, `Q-000822`

Primary relations:

- `Users 1:M Enrollments`
- `Tracks 1:M Lessons`
- `Cohorts 1:M Enrollments`
- `Enrollments 1:M Progress`
- `Lessons 1:M Progress`
- `Progress 1:M Deliveries/Reminders/Approvals`

### Recommended minimum columns

**Users**  
`UserID, SlackUserID, Email, FullName, RoleType, ManagerSlackUserID, TimeZone, IsActive, CreatedAt, UpdatedAt`

**Lessons**  
`LessonID, TrackID, LessonSequence, ReleaseType, ReleaseOffsetDays, Title, ContentTemplateID, RequiresApproval, IsActive`

**Enrollments**  
`EnrollmentID, UserID, SlackUserID, CohortID, TrackID, StartDate, EnrollmentStatus, CurrentLessonID, CurrentSequence, PausedAt, CompletedAt`

**Progress**  
`ProgressID, EnrollmentID, UserID, LessonID, LessonSequence, Status, AssignedAt, DueDate, SentAt, CompletedAt, ApprovedAt, ReminderCount, LastReminderAt`

**Deliveries**  
`DeliveryID, EnrollmentID, UserID, LessonID, DeliveryType, ChannelID, MessageTS, DeliveredAt, DeliveryStatus, RetryCount, RequestFingerprint, IsResend, ParentDeliveryID`

**Queue**  
`QueueID, JobType, EntityType, EntityID, PayloadJSON, Status, Priority, AvailableAt, AttemptCount, MaxAttempts, LastError, LockedBy, LockedAt, CreatedAt, UpdatedAt`

## 5) Apps Script module architecture

- `Code.gs`: `doPost`, `doGet`, trigger entrypoints
- `Config.gs`: constants, tab names, status enums
- `Auth.gs`: signature verification, replay checks
- `Router.gs`: request parsing and dispatch
- `Slack.gs`: Slack API wrappers (messages, modals, responses)
- `Sheets.gs`: batched DAL (`getValues` / `setValues`), header maps, row mappers
- `Onboarding.gs`, `LessonDelivery.gs`, `Progress.gs`, `Reminders.gs`, `Approvals.gs`
- `Commands.gs`, `Events.gs`, `Modals.gs`, `Admin.gs`
- `Queue.gs`: enqueue/claim/process/retry/dead-letter handling
- `Scheduler.gs`: periodic job generation
- `Templates.gs`, `Utils.gs`

## 6) Core workflow design

### A) New learner onboarding

Admin command/shortcut → verify admin auth → upsert `Users` → create `Enrollments` → seed first `Progress` row (or full track rows) → welcome DM → enqueue first lesson.

### B) Daily lesson release

Trigger → enqueue `SEND_LESSON` candidates → process eligible enrollments → dedupe with delivery fingerprint → send lesson → write `Deliveries` + set `Progress.SentAt` and status.

### C) Mark complete

Learner button → verify signature and idempotency key → update `Progress` to completed → append `Audit_Log` → enqueue next lesson or manager approval.

### D) Reminders

Trigger → find overdue active progress rows → apply cadence from `Workflow_Rules` → send reminder → update counters/timestamps → optional escalation.

### E) Approval path

Milestone completion → create approval request row → manager action in Slack → update `Approvals` and `Progress`/`Enrollments`.

## 7) Lesson delivery engine rules

### Eligibility

A learner is eligible when all are true:

- enrollment status is active,
- learner is not paused/dropped/completed,
- prerequisites satisfied,
- release window reached,
- no unresolved approval gate blocks delivery,
- no existing active delivery for same fingerprint.

### Duplicate prevention

Use three guards:

1. **Inbound idempotency key** (Slack retry protection)
2. **Queue dedupe key** (`JobType + EntityID + window`)
3. **Delivery fingerprint** (`EnrollmentID|LessonID|DeliveryType|Window`)

### Failed send behavior

On Slack failure, update delivery status, increment retry counters, compute next `AvailableAt`, and requeue until `MaxAttempts`; then dead-letter for admin replay.

## 8) Queue, scheduler, and concurrency design

### Job types

`SEND_WELCOME, SEND_LESSON, SEND_REMINDER, PROCESS_COMPLETION, REQUEST_APPROVAL, RETRY_DELIVERY, COHORT_START, SYNC_DASHBOARD`

### Processing model

- Claim small batches under `LockService`.
- Keep processor runtime bounded (short loops + checkpointing).
- Backoff retries; honor Slack `Retry-After` on 429s.
- Separate high-priority learner actions from background rollups.

### Locking strategy

Apply lock protection for:

- queue claim/update,
- critical progression writes,
- delivery dedupe checks,
- scheduler singleton runs.

## 9) Security and compliance baseline

- Verify Slack request signature on every inbound call.
- Reject stale timestamps to prevent replay attacks.
- Store secrets in Script Properties; avoid hardcoding.
- Restrict admin actions by role mapping/allowlist in `Users`/`Settings`.
- Sanitize all inbound payload fields before use.
- Never authorize based on UI text labels.
- Append audit records for admin overrides and sensitive transitions.
- Use correlation IDs across queue/delivery/audit rows for traceability.

### Slack signature verification recipe

1. Read `X-Slack-Signature` and `X-Slack-Request-Timestamp`.
2. Reject if timestamp drift exceeds tolerance.
3. Build `v0:timestamp:rawBody`.
4. Compute HMAC-SHA256 with signing secret.
5. Compare computed signature to header; reject on mismatch.

## 10) Reliability and performance guardrails

- Prefer full-range batched I/O over cell-by-cell calls.
- Use `SpreadsheetApp.flush()` only when immediate consistency is required before dependent actions.
- Archive old `Deliveries`, `Reminders`, and logs to archive tabs.
- Keep write-heavy operational tabs formula-light.
- Use scheduled rollup tables for dashboards at scale.
- Stagger large cohort sends by priority/time window.

## 11) Slack app setup guidance

### Recommended scopes (minimum practical set)

- `chat:write`
- `commands`
- `im:write`
- `users:read` (plus `users:read.email` only if required)

Add channel scopes only if cohort channel delivery is required.

### Commands and interactions

- Learner: `/learn`, `/progress`, `/lesson`, `/complete`
- Admin: `/onboard`, `/admin`, `/cohort`, `/resend`
- Use buttons/modals for completion, approval, pause/resume, resend.

## 12) Admin operating model

Non-technical operators should handle day-to-day work via Sheets and Slack admin tools:

- manage lessons and templates,
- configure reminder/release rules,
- enroll/pause/resume learners,
- resend lessons,
- monitor queue and error logs,
- replay dead-letter jobs,
- track dashboards by learner/cohort/lesson.

## 13) Fit boundaries and risk profile

### Strong fit

- internal onboarding and cohort learning,
- microlearning with reminders and approvals,
- low-to-medium complexity training operations.

### Weak fit / migration triggers

- very high concurrency and write throughput,
- complex analytics and external reporting demands,
- strict transaction guarantees and multi-tenant segregation,
- large public learner portals.

As programs grow to sustained high activity (large concurrent cohorts + dense daily interactions), plan migration to a managed DB + dedicated backend.

## 14) MVP phased implementation plan

1. **Foundation:** Slack app, request verification, base schema, onboarding welcome flow.
2. **Core LMS:** lesson release engine, completion actions, learner progress view.
3. **Operations:** reminders, approvals, pause/resume, resend actions.
4. **Observability:** dashboards, error logging, dead-letter replay.
5. **Hardening:** batching optimization, archival jobs, config hardening, scale tuning.


## 15) Pre-production manual test runbook (Apps Script editor)

Before each production rollout, operators should run the lightweight script tests in `apps_script/tests.gs` from the Apps Script editor.

### Operator steps

1. Open the Apps Script project bound to the production candidate.
2. Add or sync `apps_script/tests.gs` into the project.
3. In the function selector, run `runAllPreflightTests` first.
4. Run each targeted test function individually if needed:
   - `testSlackSignatureVerificationEdgeCases`
   - `testNextLessonResolutionWithSequenceGaps`
   - `testQueueRetryBackoffCalculation`
   - `testIdempotentDuplicateRejection`
5. Open **Execution log** and verify each test prints a `PASS ...` entry and no exception stack traces.
6. If any test fails, block rollout, fix logic/configuration, and rerun all tests before approving release.

### Expected outcomes

- Signature checks reject stale/future/tampered requests and accept valid signed requests.
- Next-lesson resolution correctly advances across inactive/missing sequence numbers.
- Retry backoff grows exponentially, caps safely, and honors `Retry-After` when present.
- Duplicate fingerprints are rejected while unseen fingerprints are accepted.

## Final recommendation

This stack is production-viable for a Slack-native internal LMS when queueing, idempotency, validation, auditability, and disciplined sheet operations are treated as non-negotiable engineering requirements.
