# Vutadex web: proposed production deployment runbook (staging first)

**Status: deployment preparation ONLY. Not approved, deployed, or production policy.** Everything below is a **proposed operational default requiring owner review and explicit approval**, including region, machine count, volume capacity, snapshot retention, health checks, monitoring, credential handling, and rollback/restore operations. Do not use this as a record of completed staging acceptance. This runbook applies only to the NEW Fly app **vutadex-web**; **vutadex-app** is an unrelated legacy backend and must not be changed.

## Proposed deployment boundary and preflight (M10.1, M10.2, M10.3)

The app runs Express + React on one Node 26 process. Its database is the embedded node:sqlite file at /data/vutadex-web.db in WAL mode. Uploaded media blobs are in that same SQLite database; there is no external storage service. The server checks an exact request Origin against APP_ORIGIN and uses secure, HTTP-only production cookies. Fly terminates HTTPS; the app does not enable Express trust proxy. **Only when Fly's runtime FLY_APP_NAME environment variable is set** does the authentication IP rate limiter honor a valid Fly-Client-IP ingress header; otherwise (including ordinary local runs and tests) the header is ignored and the socket IP is used. This prevents forged proxy headers from changing the throttle key outside Fly. **Ingress trust boundary:** Fly Proxy overwrites client-supplied Fly-Client-IP on public ingress, so a public client cannot spoof the value used by the limiter. Fly private Machine-to-Machine networking is IPv6-only; Fly recommends binding the server exclusively to IPv4 (`HOST=0.0.0.0` **exactly**, never `HOST=::` or `HOST=[::]`) so private IPv6 peers cannot bypass Fly Proxy and inject headers. `FLY_APP_NAME` still prevents off-Fly runtimes from trusting that header; it is not an independent proof of proxy ingress. This design assumes organization members with private-network or `flyctl` access are trusted operators; treat changes to networking, server host binding or operator access as security-sensitive. See [Fly support's ingress guidance](https://community.fly.io/t/security-guidance-verifying-fly-proxy-socket-peers-and-forwarded-headers/28891) and [Fly request headers](https://fly.io/docs/networking/request-headers/).

Before doing anything on Fly, the owner should approve these **proposals**: Fly app name vutadex-web, region iad, exactly one Machine, one volume named vutadex_data, no additional Machine/replica/region, auto-stop on idle with zero minimum running Machines for staging, TLS enforcement, 30-second HTTP health checks, and initial volume size/budget. A single-machine design has availability limitations and no automatic failover.

Preflight sequence **for a future owner-authorized staging operation only**:

1. From the repository root, pin a reviewed commit and verify npm ci, npm run web:check and npm run terminal:check. Record its full SHA and all CI conclusions. Build context must be the repository root (the Dockerfile is at apps/web/Dockerfile). Docker and Fly commands below are **examples only**; none were executed in this PR.
2. After owner authorization, create **vutadex-web** as a new Fly app (never adopt/reuse vutadex-app) and create **one** encrypted volume named vutadex_data in iad, with an approved capacity. Keep one attached Machine only. Confirm the Fly config and resulting Machine count; do not use Fly scale-out or cloning for ordinary deployments.
3. Configure APP_ORIGIN and the SES credentials as **Fly secrets**, never committed in fly.toml, code, or Docker layers. APP_ORIGIN must match the exact browser origin including https:// and hostname (for example https://vutadex-web.fly.dev if that is the chosen staging URL; no trailing slash). The production sender must be verified in the selected SES region, the account must have SES production access for the intended recipients, and the IAM principal must have ses:SendEmail. AWS_REGION, SES_FROM_EMAIL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and optionally AWS_SESSION_TOKEN are server-only. Example after approval:

   ~~~sh
   fly secrets set --app vutadex-web \
     APP_ORIGIN=https://<approved-hostname> \
     AWS_REGION=<approved-region> \
     SES_FROM_EMAIL=<verified-sender> \
     AWS_ACCESS_KEY_ID=<access-key> \
     AWS_SECRET_ACCESS_KEY=<secret-key>
   # Include AWS_SESSION_TOKEN only when using temporary credentials.
   ~~~

   Do not put real secrets in shell history, PR comments, logs or shared screenshots; prefer an approved secure injection workflow. An empty or incorrect APP_ORIGIN is a launch blocker.
4. Confirm HOST=0.0.0.0 **exactly** (never `::` or `[::]`), PORT=3001, NODE_ENV=production and VUTADEX_DB=/data/vutadex-web.db from fly.toml. The container entrypoint automatically starts briefly as root to `chown` the mounted /data volume, then uses `runuser` to execute the server as non-root `node`. The CI Docker smoke verifies this with a **fresh root-owned bind mount**, HTTP 200, an actual node-owned /data/vutadex-web.db file, and an IPv4-only fly.toml check. In staging verify /data is the real attached volume, SQLite -wal/-shm are writable, and data survives a Machine restart. Without the mount, the in-container /data path is ephemeral and is **not an acceptable launch state**.
5. For the authorized staging release, build/deploy from the repo root with the checked-in fly.toml (for example, fly deploy -c fly.toml -a vutadex-web --ha=false --strategy rolling), and verify the reviewed SHA/image digest. Confirm the platform does not seed a second Machine; do not use canary or bluegreen for this volume-backed single writer. No command in this document authorizes deployment.
6. Check the public HTTPS /api/v1/health response is 200 with status ok. Check Fly health check results, request correlation via x-request-id, Pino application logs, and a minimal set of alerts for failed starts, repeated 5xx, full disk, snapshot failure and SES delivery errors. Monitor without logging tokens, links, credentials, note content or media bytes. A health response alone does not prove full DB or SES health; test both separately. Select an owner-approved alert channel before production.
7. Confirm request Origin checks still reject writes from the wrong origin, production session cookies are Secure/HttpOnly/SameSite=Lax, direct HTTP redirects to HTTPS, invalid/replayed/expired magic links fail, and logout revokes the session. Keep internal port 3001 unreachable except through Fly ingress.

## Staging acceptance: execute and record evidence (M10.4, M10.5)

Use disposable accounts and non-sensitive media. On every item, record **pass/fail**, release digest, account/test device, date, the relevant request ID for failures, and an issue link; never record magic links, session cookies or private notes in evidence.

- [ ] **Actual email, two platforms:** On a physical phone and a desktop browser, request separate real SES-delivered sign-in emails and follow each magic link over HTTPS. Confirm the right account, persistent session after refresh and restart, no dev inbox/Debug sender reliance, one-time link use and expiry.
- [ ] **Deck create/edit and read:** Create a deck on desktop with a recognizable title/description, observe it in Home/Decks, then open it on phone under the *same verified account*. Attempt to edit the deck title/description and verify the edit across both devices. **The current API does not expose a deck-update route; record this as a failed acceptance item/product gap rather than pretending it passed or adding an undeclared feature to this deployment-prep PR.** A different account must not be able to read the deck.
- [ ] **Note create and edit:** Create basic and advanced-type notes with tags using Add Cards; check preview and generated cards. Edit a note on phone, verify the updated fields on desktop, and confirm the generated card IDs/scheduling history are stable when appropriate.
- [ ] **Atomic failures / media:** Use invalid input to verify failed create/edit/import does not partially save. Upload a test image, create an image-occlusion note, reveal it during review, export the portable deck backup, and verify ownership-restricted media retrieval.
- [ ] **Study loop:** Start a deck study session, reveal, rate **Again**, confirm the retry remains in the saved session and is offered after its required wait; use an interval preview, another rating, and **Undo**. Refresh to confirm exactly one committed review for each accepted operation, and confirm undo reverses the intended result.
- [ ] **Cross-device resume:** Pause/leave the study on desktop. Open the active session from the phone signed into the same account, resume its existing queue (not a new queue), rate, and confirm desktop catches up. Try a concurrent stale rating; it must conflict rather than duplicate the review.
- [ ] **Change feeds / offline interruption:** Temporarily interrupt the phone network, edit an unsaved draft, reconnect and verify the UI labels it unsaved/conflicted until an explicit resolution. Verify server-saved notes and study progress eventually converge; do not claim general offline-first sync.
- [ ] **Stats and time:** Verify Home due count, review count, streak, retention sample size and Stats change only for real committed history, with undo and account timezone handled correctly. Do not approve the mature-retention eligibility policy by implication; that policy is a separate owner decision.
- [ ] **Logout and revocation:** Logout on desktop and ensure protected routes/APIs require login; revoke another active session via the session controls, confirm that device loses API access, and verify tab/session switching does not continue fetching another user's private data.
- [ ] **Responsive, keyboard and UX:** Check phone/desktop navigation, focus visibility, tab order, touch target accessibility, image alt text, long card content and the Bongo design. Review accessibility and performance measurements plus the Chromium/Firefox/WebKit CI runs.
- [ ] **Operational:** Restart the single Machine, verify cards, review events, users, sessions and images survive; inspect logs/health/alerts. Perform a **disposable-data** snapshot restore drill using the procedure below; confirm no second live writer.
- [ ] **Exit gate:** Preserve a signed checklist with unresolved defects, restore results, owner decision on defaults, and final release go/no-go. Staging success alone does not authorize production deployment or migration.

## Proposed volume snapshots, restore, and recovery (M10.4)

Fly's current **platform defaults** for new volumes are automatic daily snapshots and **five-day retention**, subject to configuration and ongoing Fly changes. **Proposal for owner review, not an approved retention policy:** start staging with these defaults, explicitly verify that scheduled snapshots are enabled, and later decide whether longer retention, independent off-platform backups and a tested point-in-time recovery objective are needed. Daily snapshots are *not* continuous backups or high availability; potential data loss is up to the chosen recoverable snapshot, and snapshots can expire. Review this limitation before production.

### Verify the backup

1. Inspect the one attached volume and record its ID, region, capacity, snapshot schedule and ownership using fly volumes list -a vutadex-web. Do not infer a snapshot exists immediately after creating the volume.
2. After at least one scheduled snapshot, list with fly volumes snapshots list <volume-id> -a vutadex-web. Record a snapshot ID and timestamp; validate the observed cadence and expiry rather than assuming the default. Optionally capture one manually for a controlled pre-change restore drill after owner approval.
3. The volume contains **vutadex-web.db**, SQLite's related WAL/SHM files, account/session/review data and **media_blobs**. A volume snapshot protects the database and uploaded images together at a crash-consistent point. Do not manually copy only the live main .db file while WAL is active or equate a snapshot with a verified logical SQLite backup.
4. Periodically rehearse an independent restore with disposable data. Open the recovered DB and run SQLite PRAGMA integrity_check, then inspect representative decks, review events, auth sessions and one uploaded image. Record recovery time, snapshot age and any integrity failure.

### Restore to a **fresh volume** (operator-only, downtime, no overwrite)

1. Obtain explicit approval; announce downtime and stop writes. Identify the existing Machine and old volume IDs; **stop the old Machine** before attaching/starting any replacement. Preserve the original volume as a fallback until the restore is verified.
2. List snapshots and choose a known-good pre-incident snapshot. Create a **new** volume named vutadex_data (same iad region, **at least** the snapshot's original size) from its snapshot ID:

   ~~~sh
   fly volumes list -a vutadex-web
   fly volumes snapshots list <old-volume-id> -a vutadex-web
   fly volumes create vutadex_data -a vutadex-web -r iad \
     --snapshot-id <snapshot-id> --size <size-in-GB-at-least-original>
   ~~~

3. Record the **new** volume ID from the output. Clone/create a *replacement* Machine from the approved image, explicitly attaching the **restored** volume at /data. For example, after inspecting the current Fly CLI options:

   ~~~sh
   fly machine clone <stopped-old-machine-id> -a vutadex-web -r iad \
     --attach-volume <new-restored-volume-id>:/data
   ~~~

   Do **not** start the old Machine in parallel. Verify the replacement is the **only running instance**, mounts the new volume, has the correct secrets/config and serves the pinned build. Do not remove the original Machine/volume yet.
4. Verify HTTPS and the health endpoint, run SQLite PRAGMA integrity_check, and repeat sign-in, note, media retrieval and a study/undo smoke test with disposable data. Compare restored records against the expected snapshot age. If invalid, stop the replacement and follow the owner-approved fallback path without switching both Machines on.
5. Only after owner sign-off should the old Machine be decommissioned and volume cleanup considered; never delete the original data as part of an automatic rollback. Document the lost-write interval and update the recovery incident record.

## Proposed previous-image rollback (M10.6)

A **code/image rollback does not restore SQLite data or reverse DB schema migrations**. Before deploying a build that changes schema, take a verified snapshot and confirm the old image can read the new schema; if not, use an explicitly reviewed data-restore plan rather than a blind image rollback.

1. Identify the last known-good **image digest** and release ID from fly releases --image -a vutadex-web. Save that digest in the staging change record.
2. After approval, redeploy the prior **exact image** while preserving the reviewed fly.toml, same one-machine topology, mounted /data volume and active secrets:

   ~~~sh
   fly deploy -a vutadex-web -c fly.toml --image <previous-registry-image-by-digest>
   ~~~

3. Confirm exactly one Machine, HTTP health, HTTPS login, existing deck reads, media access and preserved study state. Monitor Pino logs and rollback/availability metrics. If a change in Fly secrets, network config or SQLite schema caused the failure, reverting the image alone cannot fix it; resolve those separately with approval.
4. Record cause, selected image digest, schema/volume compatibility, smoke results and any data loss. Do not proceed to production until the rollback and volume-restore drills have passed in staging.

## Migration decision (owner, November 1, 2026)

**Owner decision, November 1, 2026:** the existing hosted legacy Vutadex app's data does **not** need preservation or migration into the new `vutadex-web` service. Start the new service with a **fresh, empty SQLite database** on its own volume. Do not alter, delete or reuse the unrelated legacy `vutadex-app` deployment. This removes the legacy-hosted-data migration requirement; existing optional CLI content-import and migration utilities remain available for users and are **not** removed or changed. This decision does not authorize deployment.

## Resolved by design; owner decisions still open

- **Exactly one app Machine:** the embedded node:sqlite database uses one local, persisted file and a WAL. Fly volumes cannot be shared between Machines. No concurrent writers, additional app Machines, scaling across regions, read replicas or zero-downtime multi-instance rollouts without changing the database/architecture. Operator must enforce one instance; this TOML alone does not establish distributed safety.
- **Media is inside SQLite:** the validated uploaded image bytes are in media_blobs in /data/vutadex-web.db, so a complete volume snapshot includes the media along with notes/history; there is no separate image bucket or credential.
- **Email adapter is already built:** production uses the existing SES adapter and SigV4. It needs a verified sender/domain, SES production sending access, AWS region and an IAM principal with ses:SendEmail. The adapter and the secret names are documented, but no account, credentials, DNS or sending access has been configured.
- **Proposed staging-only operating defaults:** iad, one Machine, auto-stop with zero minimum running, one volume, daily snapshots/five-day retention, basic HTTP health checks and log/alert baseline. The owner must approve or revise every default before production.
- **Remaining outside this PR:** create and pay for the new Fly app and volume, approve volume capacity/backup retention/monitoring, set Fly secrets and manage credentials, SES verification and production access, configure DNS/HTTPS hostname, conduct actual phone+desktop staging acceptance and restore drills, decide retention eligibility policy separately, and grant final production go/no-go.
- **Explicit non-actions:** no deployment, secrets, Fly resources, DNS changes, CLI changes, main branch changes or policy approvals occurred here.

References for review: Fly app configuration, volume management/snapshot restore, and release image rollback guidance in the Fly.io documentation.
