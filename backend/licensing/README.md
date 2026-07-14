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
| `client_routes.py` | Public endpoints (`/api/v1/project/*`). |
| `admin_routes.py` | Admin API (JWT admin auth) + serves the panel. |
| `deps.py` | Admin auth dependency. |
| `static/admin.html` | Self-contained admin panel (no build step). |

## Setup

1. **Migrate** (creates the `lic_*` tables):

   ```bash
   alembic upgrade head
   ```

   The tables are also auto-created by `init_models()` on startup (matching the
   rest of this app), so a fresh DB works without a separate Alembic run.

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
  audit-only.

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
