# Slack LMS Operations Runbook

This runbook covers initial setup and incident response for the Slack + Google Apps Script + Google Sheets onboarding system.

## 1) Initial setup

### 1.1 Create the Google Sheet and required tabs

1. Create a new Google Sheet for the environment (for example, `slack-lms-prod`).
2. Create the core tabs used by the app:
   - `Users`
   - `Cohorts`
   - `Tracks`
   - `Lessons`
   - `Lesson_Content`
   - `Enrollments`
   - `Progress`
   - `Deliveries`
   - `Reminders`
   - `Approvals`
   - `Queue`
   - `Settings`
   - `Workflow_Rules`
   - `Message_Templates`
   - `Audit_Log`
   - `Error_Log`
   - `Admin_Actions`
3. Add header rows per schema used by your Apps Script modules.
4. Share the sheet with least privilege:
   - Runtime/service account or deployment owner: **Editor**
   - Ops/admin users: **Editor** for ops tabs and read-only where possible for audit tabs.
5. Record the spreadsheet ID in your deployment notes.

### 1.2 Set Apps Script Script Properties

1. Open Apps Script project linked to your deployment.
2. Navigate to **Project Settings → Script Properties**.
3. Set the following required properties:
   - `SLACK_SIGNING_SECRET` = value from Slack app **Basic Information → Signing Secret**
   - `SLACK_BOT_TOKEN` = `xoxb-...` token from **OAuth & Permissions**
4. Set any additional project-specific properties (sheet IDs, environment labels, admin allowlists).
5. Save and validate:
   - Confirm there are no extra spaces/newlines in secrets.
   - Confirm production uses production credentials (not dev/test tokens).

### 1.3 Deploy the Apps Script Web App

1. In Apps Script, select **Deploy → New deployment**.
2. Deployment type: **Web app**.
3. Execute as: deployment owner (or dedicated automation owner).
4. Access: restrict to the expected caller model for Slack webhook traffic.
5. Deploy and copy the generated Web App URL.
6. Update deployment notes with:
   - deployment ID
   - Web App URL
   - deployer account
   - deploy timestamp

### 1.4 Install time-driven triggers

Create/install the following triggers in **Triggers** for the production deployment:

1. **Queue processor trigger**
   - Function: queue processing entrypoint (for example `processQueueTrigger`)
   - Type: time-driven
   - Cadence: every 1 minute (or the lowest safe interval)
2. **Scheduler trigger**
   - Function: scheduler entrypoint (for example `runSchedulerTrigger`)
   - Type: time-driven
   - Cadence: every 5–15 minutes depending on volume
3. **Reminder trigger** (if split from scheduler)
   - Function: reminder entrypoint
   - Type: time-driven
   - Cadence: hourly or per policy
4. Confirm each trigger shows as active and owned by the correct service/deployment account.

### 1.5 Configure Slack app manifest and interactivity

1. Open Slack app config.
2. Under **Basic Information**, verify Signing Secret is present and matches Script Properties.
3. Under **OAuth & Permissions**:
   - Ensure required bot scopes exist (for example `chat:write`, `commands`, `im:write`, `users:read`).
   - Reinstall app after scope changes.
4. Under **Slash Commands**:
   - Set each command Request URL to your Web App URL.
5. Under **Event Subscriptions** (if used):
   - Enable events.
   - Set Request URL to your Web App URL.
   - Subscribe only to required bot events.
6. Under **Interactivity & Shortcuts**:
   - Enable interactivity.
   - Set Interactivity Request URL to your Web App URL.
7. If using app manifest as source of truth:
   - Commit manifest updates in source control.
   - Apply manifest to workspace and verify no drift.

### 1.6 Verify first onboarding flow (smoke test)

Run this smoke test immediately after deployment:

1. Create a test learner in `Users` (or use onboarding command flow).
2. Trigger onboarding via admin command/shortcut (e.g., `/onboard`).
3. Validate outcomes in order:
   - New/updated row in `Users`
   - `Enrollments` row created
   - Initial `Progress` row seeded
   - Queue job(s) added in `Queue`
4. Wait for processor trigger (or run queue processor manually once).
5. Confirm learner receives welcome/first lesson DM in Slack.
6. Verify `Deliveries` status is successful and `Progress.SentAt` is populated.
7. Complete first lesson action from Slack button and verify:
   - completion state update in `Progress`
   - audit entry in `Audit_Log`
   - next lesson/approval path queued as expected
8. Record smoke-test evidence (timestamp, learner ID, queue ID, delivery ID).

---

## 2) Incident procedures

### 2.1 Replay dead-letter jobs

Use this when jobs have reached max attempts and landed in dead-letter state.

1. Identify failed jobs in `Queue` with dead-letter status (and associated `LastError`).
2. Classify root cause before replay:
   - transient Slack/API issue
   - bad payload/data mapping
   - missing permission/scope/secret
3. Fix root cause first.
4. Replay strategy:
   - Preferred: run admin replay action that clones dead-letter job to a new queued record with reset attempts.
   - Manual fallback: create new queue row with same payload and new `QueueID`, `Status=QUEUED`, `AttemptCount=0`, and valid `AvailableAt`.
5. Reprocess via normal queue trigger (or controlled manual run).
6. Verify replay result in `Deliveries`, `Progress`, and `Audit_Log`.
7. Mark original dead-letter row as replayed/resolved with operator + timestamp note.

### 2.2 Rotate signing secret and bot token

Perform rotation during low-traffic window.

1. Announce maintenance window to operators.
2. Create/obtain new credentials in Slack:
   - regenerate Signing Secret (if policy/process supports immediate cutover)
   - rotate/reissue bot token
3. Update Apps Script **Script Properties** with new values:
   - `SLACK_SIGNING_SECRET`
   - `SLACK_BOT_TOKEN`
4. Redeploy Web App if your release process requires deployment refresh for config reads.
5. Immediately test:
   - slash command acknowledgment
   - interactive button submission
   - outbound DM send
6. Monitor `Error_Log` and `Queue` for signature failures or auth errors for 15–30 minutes.
7. Revoke old token/secret per policy after successful validation.
8. Document rotation in ops log with who/when/why and affected deployment ID.

### 2.3 Recover from trigger failures

Symptoms include queue backlog growth, delayed lessons, missing reminders.

1. Detect failure:
   - Trigger execution errors in Apps Script dashboard
   - Rising `Queue` backlog with stale `AvailableAt`
2. Triage:
   - Verify trigger still exists and is enabled
   - Verify trigger owner account still has access to script/sheet
   - Check quota/runtime errors and recent code changes
3. Immediate mitigation:
   - Re-run processor/scheduler manually once to reduce backlog
   - If trigger missing/corrupt, recreate it with standard cadence
4. Backlog recovery:
   - Process queue in controlled batches to avoid rate limits
   - Respect retry backoff and Slack 429 responses
5. Validate recovery:
   - Queue depth trending down
   - New jobs processed on schedule
   - No new spike in `Error_Log`
6. Post-incident follow-up:
   - document root cause and timeline
   - add alert/checklist item for trigger health
   - consider redundant monitoring heartbeat in `Audit_Log`

---

## 3) Operational checklist (quick reference)

- [ ] Sheet tabs exist and schemas are current.
- [ ] `SLACK_SIGNING_SECRET` and bot token are set correctly.
- [ ] Web App URL in Slack matches current deployment.
- [ ] Time-driven triggers are installed and active.
- [ ] Interactivity and command URLs are configured.
- [ ] First onboarding smoke test passed.
- [ ] Dead-letter replay procedure is verified by operators.
- [ ] Credential rotation procedure is documented and tested.
- [ ] Trigger failure recovery steps are known by on-call admins.
