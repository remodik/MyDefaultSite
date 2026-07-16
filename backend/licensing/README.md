# Licensing subsystem (server + admin panel)

Backend for distributing licensed Python projects to client bots, plus the
admin panel. Client library: [`../../licensed_loader/`](../../licensed_loader/README.md).

Two modes (see the task priorities — **Mode A is the primary, fully-supported
path**; Mode B is an optional, deliberately-simple extension):

- **Mode A (`/api/v1/project/fetch`)** — returns an encrypted archive of the
  project's files; the client decrypts and runs them locally.
- **Mode B (`/api/v1/project/execute`)** — runs `entrypoint(**args)` on the
  server in an in-memory virtual package and returns only the JSON result.

All tables use the `lic_` prefix (they do **not** touch the site's existing
`projects` / `files` / `licenses` tables).

## Layout

| File | Responsibility |
|---|---|
| `models.py` | SQLAlchemy models (`lic_*`). |
| `schemas.py` | Pydantic request/response models. |
| `crypto.py` | At-rest + transport encryption, key gen/hash (crypto is isolated here). |
| `service.py` | Shared queries: license resolution, effective-file computation, validity rules, logging. |
| `virtual_package.py` | In-memory `importlib` loader (natural package mount) for Mode B. |
| `executor.py` | Execution sandbox (thread+timeout default; `ProcessExecutor` for POSIX hardening). |
| `runtime.py` | Mode B engine: cache, entrypoint resolution, timed execution. |
| `security.py` | Auto-suspend triggers (scrape / leaked key / failure bursts) + webhook alerts. |
| `client_routes.py` | Public endpoints (`/api/v1/project/*`) — the bot API. |
| `admin_routes.py` | Admin API (JWT admin auth) + serves the panel. |
| `portal_routes.py` | Client self-service portal (`/api/v1/licensing/portal/*`) + serves the portal page. |
| `deps.py` | Admin auth + client-portal auth dependencies. |
| `static/admin.html` | Self-contained admin panel (no build step). |
| `static/portal.html` | Self-contained client portal (no build step). |

## Setup

1. **Schema.** Nothing to run: `init_models()` creates the `lic_*` tables on
   startup, matching the rest of this app.

   Migration files exist under `alembic/versions/` for reference, but this repo
   ships **no `alembic.ini`**, so `alembic upgrade head` will not run as-is.
   Because `create_all()` never alters an existing table, columns added after a
   table already shipped are applied by idempotent `ALTER`s in `init_models()`
   (see `database.py`) — that is how the billing columns reach a deployed DB.
   **Adding a column to an existing `lic_*` table means adding it there too**,
   otherwise production silently keeps the old schema.

2. **Environment variables:**

   | Var | Required | Purpose |
   |---|---|---|
   | `LICENSING_MASTER_KEY` | **prod** | Key for at-rest encryption of file content. Falls back to `SECRET_KEY` in dev with a warning — **set it explicitly in production** (rotating it makes existing stored files undecryptable). |
   | `SECRET_KEY` | yes | Reused for admin JWT (same as the rest of the site). |
   | `LICENSING_ALERT_WEBHOOK` | no | Discord/Slack webhook; posted to on auto-suspend. |
   | `LICENSING_EXEC_TIMEOUT` | no | Mode B per-call timeout, seconds (default 5). |
   | `LICENSING_RUNTIME_CACHE_TTL` | no | Mode B source cache TTL, seconds (default 300). |
   | `LICENSING_RATE_LIMIT_MAX` / `_WINDOW` | no | Hard per-key rate limit (default 60 / 60s). |
   | `LICENSING_SCRAPE_MAX` / `_WINDOW` | no | Auto-suspend on request floods (default 200 / 60s). |
   | `LICENSING_MULTI_FP_MAX` / `_WINDOW` | no | Auto-suspend on N fingerprints per key (default 2 / 300s). |
   | `LICENSING_FAILURE_MAX` / `_WINDOW` | no | Auto-suspend on failure bursts (default 12 / 120s). |

3. **Admin panel:** open `/licensing/admin`. Log in with a site account whose
   `role == "admin"`. Screens: Dashboard, Projects (file tree, drag-n-drop /
   folder upload, per-file enable, diff-before-save), Clients & Licenses
   (create license → one-time key, suspend/revoke/reactivate/unlocked, extend,
   per-client module toggles), Security events, Access logs (filters +
   pagination).

4. **Client portal:** send clients to `/licensing/portal`. They sign in with
   the **license key you gave them** — no accounts, no passwords. They see
   every project tied to them, its status, its price, and (once you've
   confirmed payment) can browse and download the sources.

## Client portal & payment

The portal is the client-facing half of the panel. Payment is **manual and
out of band** — nothing here touches money or a payment gateway. "Paid" is
your assertion, made after *you* verified the funds arrived.

| Step | Who | Result |
|---|---|---|
| Set a price on a license (Licenses → Оплата) | you | `payment_status: unpaid`; the client sees the amount + your payment details |
| Pay, then press "Я оплатил" | client | `payment_status: pending` + webhook alert to you |
| Verify the money, press "Подтвердить оплату и выдать" | you | `payment_status: paid`, `status: unlocked` |
| Browse / download the sources | client | ZIP of the license's effective files |

Notes:

- **Confirming is a one-way door.** It sets `unlocked`, which is terminal —
  the server rejects any later attempt to suspend or revoke that license (see
  *License statuses*). Use "Отклонить заявку" if the money never showed up.
- **Downloads require `unlocked`**, nothing less. A `pending` claim grants
  nothing.
- **The portal respects module toggles**: a file disabled globally or for that
  license is absent from the listing *and* the ZIP, and can't be read by id.
- Pending claims surface on the admin dashboard, so the webhook is a
  convenience rather than the only channel. Set `LICENSING_ALERT_WEBHOOK` to
  get the ping.
- Portal sessions are JWTs marked `typ: lic_portal`, valid 7 days. They are
  rejected by the admin API, and site/admin tokens are rejected by the portal.
- Login is rate-limited per IP (10/min) and every attempt — including a wrong
  key — is written to `lic_access_logs` with `mode: portal`.

**Amounts are whole currency units** (`15000` = 15 000 ₽), matching the site's
existing `donations.amount` / `purchases.amount` convention.

## Typical workflow

1. **Create a project** and upload its `.py` files (paths preserved, e.g.
   `economy/core.py`). Re-uploading a path bumps its version.
2. **Create a client**, then **create a license** (client + project + plan) →
   copy the key shown **once**.
3. Hand the client the key; they drop it into `licensed_loader`.
4. Manage over time: toggle individual modules per license, suspend/revoke
   instantly, review access logs, act on security events. Move a license to
   **`unlocked`** when you've delivered the code permanently — it then validates
   forever as a final "delivered" marker.

## License statuses

- `active` — normal.
- `suspended` — temporarily blocked (manual or auto). Reversible.
- `revoked` — blocked, treated as permanent (needs a new license to restore).
- `unlocked` — **delivered for good.** Validates permanently, ignoring expiry
  and fingerprint; the server is no longer the gatekeeper. Manual, final,
  audit-only. **Enforced as terminal**: once set, the API rejects any status
  change with 409, so a delivered license can never be quietly suspended or
  revoked. It also unlocks source download in the client portal.

Payment state (`payment_status`) is tracked *separately* from access status,
because money and access are different questions: `none` → `unpaid` →
`pending` → `paid`. A license can be `active` (the bot works) while still
`unpaid` (a trial), and `paid` is what justifies going `unlocked`.

## Security notes & limitations

- **Mode B sandbox is intentionally simple.** `ThreadExecutor` bounds execution
  by time but cannot force-kill a runaway thread and gives no memory isolation.
  It runs the **owner's own** trusted code, so this is about resource
  containment, not defending against hostile code. For sensitive workloads,
  swap in `ProcessExecutor` (POSIX: separate process + hard kill + `resource`
  limits) or a container/worker pool — the `Executor` protocol makes this a
  one-line change. Mode B executions are serialised (natural package names are
  process-global) and the mount is torn down after each call.
- **License keys** are stored as SHA-256 hash + last 4 chars only; the plaintext
  is shown once at creation. The client sends the key on each request, so the
  server can verify (hash compare) and derive the Mode A transport key without
  ever persisting the plaintext.
- **Anomaly detection is per-process** (in-memory windows). Enforcement (the
  persisted license status) is authoritative across workers, so an auto-suspend
  still takes effect on the next request everywhere; only the *detection*
  thresholds are per-worker. For multi-worker precision, back the counters with
  Redis.
- This is IP protection, not DRM against a determined reverse-engineer with the
  machine — as the task states. The value is the instant kill switch and the
  audit trail.
