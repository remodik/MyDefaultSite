# licensed_loader

Client library for **licensed, server-gated Python projects**. You (the owner)
sell custom bots; the sensitive logic of each bot lives as a *project* on your
server. This library lets a client's bot pull that logic under a license key,
in one of two modes:

- **Mode A — `local`** (recommended, the primary path): the server hands the
  bot an **encrypted archive** of the project's files; the library decrypts it
  in memory and runs it locally. Low latency, works offline between
  revalidations. Ideal for the common ~500–1000 line project.
- **Mode B — `remote`** (optional): the bot sends a call (`entrypoint` + args)
  to the server, the code runs **on the server**, and only the JSON result
  comes back. The source never leaves the server. Higher latency; use it when
  "the whole project lives on my server" matters more than speed.

The same `LicensedProject` object supports both — you change one argument.

> This is normal IP protection for custom software you sell. It is not hidden
> from, nor hostile to, the bot's end users. It cannot make Python
> un-reverse-engineerable; its job is to raise the bar and give you an instant
> kill switch plus an audit trail.

---

## Install

The library is a single package with two dependencies (`httpx`,
`cryptography`). Copy the `licensed_loader/` folder next to your bot, or install
it:

```bash
pip install httpx cryptography
# then vendor the licensed_loader/ directory into your project, or:
pip install ./licensed_loader   # uses the included pyproject.toml
```

Python 3.10+.

---

## Building a ready-made file for your client (recommended)

Instead of making the client write the boilerplate below, generate a **single
self-contained `.py`** for them with the builder. It bakes in their
`license_key`, `server_url` and `project_slug`, and embeds the whole
`licensed_loader` runtime — so the client only needs
`pip install httpx cryptography` and one file.

Pick the type that matches how they'll use it:

```bash
# 1) Plain importable module
python -m licensed_loader.builder \
    --key LL_xxxxxxxx --server https://example.ru --slug economy-bot \
    --type module --out dist/economy.py

# 2) Discord extension for bot.load_extension("economy")
python -m licensed_loader.builder \
    --key LL_xxxxxxxx --server https://example.ru --slug economy-bot \
    --type extension --out dist/economy.py
```

**`--type module`** — the client does:

```python
import economy

pkg = await economy.load()                 # fetch + decrypt + mount
pkg.core.calculate_reward(user_id=1)
economy.core.calculate_reward(user_id=1)   # same thing, after load()
await economy.call("core.calculate_reward", user_id=1)   # mode-agnostic
await economy.close()
```

**`--type extension`** — the client does just:

```python
bot.load_extension("economy")        # py-cord
await bot.load_extension("economy")  # discord.py 2.x
```

The extension loads the project and calls **`setup(bot)`** inside your
licensed code, where you register cogs/commands as usual. So the project must
export a `setup(bot)` (and optionally `teardown(bot)`) — by default the builder
finds it in any top-level module; pin it with `--entry core` if you prefer.
Both sync (py-cord) and async (discord.py 2.x) `setup` are supported.

### Builder options

| Флаг | По умолчанию | Назначение |
|---|---|---|
| `--type` | `module` | `module` или `extension`. |
| `--mode` | `local` | `local` (код исполняется у клиента) или `remote` (на сервере). `extension` поддерживает только `local` — объект `bot` нельзя передать на сервер. |
| `--entry` | автопоиск | Для `extension`: модуль проекта, где искать `setup(bot)`. |
| `--revalidate` | `900` | Интервал перепроверки лицензии, сек. `0` — выключить. |
| `--no-embed` | — | Не встраивать рантайм (клиенту понадобится `pip install licensed_loader`). |
| `--no-fingerprint` | — | Не отправлять hardware fingerprint. |
| `--deny-message` | «⛔ Модуль недоступен: требуется оплата…» | Что ответит бот на команду выключенного модуля. |
| `--stale-after` | `60` | Через сколько секунд перепроверять лицензию при вызове команды — задержка реакции на переключатель в панели. |
| `--no-guard` | — | Не блокировать команды выключенных модулей. |
| `--out` | stdout | Куда записать файл. |

### Выключение модуля на лету (kill switch для команд)

Расширение само ставит в бота проверку лицензии, поэтому **выключение модуля в
панели действует на уже запущенного бота** — перезапуск не нужен:

1. Вы снимаете тумблер у файла (или у конкретной лицензии) в админке.
2. В течение `--stale-after` секунд бот это замечает (проверка идёт лениво, при
   вызове команды, — сервер не долбится вхолостую).
3. Команда из этого модуля больше не выполняется, а пользователю уходит
   `--deny-message` (для слэш-команд — эфемерным сообщением).

Работает и для статуса лицензии целиком: `suspended` / `revoked` / истёкший
срок блокируют все модули проекта.

Что именно перехватывается:

| Взаимодействие | Как блокируется |
|---|---|
| Префиксные команды | глобальный `add_check` |
| Слэш / user / message команды | `add_app_command_check` (disnake), `tree.interaction_check` (discord.py) |
| **Кнопки и селекты** | обёртка диспетчера `ui.View` |
| **Модальные окна** | обёртка диспетчера `ui.Modal` |

Кнопки важны отдельно: они идут **мимо** проверок команд — библиотека вызывает
callback компонента напрямую из `View`. Поэтому без этого перехвата старое
сообщение с кнопками продолжало бы работать после выключения модуля.

Как расширение понимает, что блокировать: у каждого callback'а есть
`__module__`, а загрузчик монтирует файлы проекта под их натуральными именами —
значит команда или `View` из `premium.py` видна как модуль `premium`. **Команды
и кнопки самого бота (не из проекта) проверка не трогает.**

Поддерживаются disnake, py-cord и discord.py 2.x. Если нужен свой ответ вместо
текста:

```python
project.attach_discord(bot, on_denied=lambda target, module: target.send(
    f"Модуль {module} отключён — напишите в поддержку"))
```

Проверить состояние вручную можно всегда:

```python
project.status                       # 'active' / 'suspended' / 'revoked'
project.module_allowed("premium")    # False, если выключен
```

> Встроенный рантайм монтируется в память (на диск ничего не пишется). Если
> `licensed_loader` уже установлен в окружении клиента, используется он.

Всё, что ниже, — ручная интеграция, если вы не хотите пользоваться билдером.

---

## Quickstart — Mode A (code runs in the bot)

```python
from licensed_loader import LicensedProject

project = LicensedProject(
    license_key="LL_xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    server_url="https://example.ru",
    project_slug="economy-bot",
    mode="local",
)

pkg = await project.load()          # fetch + decrypt + mount (in memory)
reward = pkg.core.calculate_reward(user_id=123)   # call it like a normal module
```

`pkg` exposes the project's top-level modules as attributes. Imports **between**
the project's own files work exactly as in a normal package
(`from economy.helpers import bonus`), because the files are mounted under their
natural package names.

You can also resolve by dotted path:

```python
core = pkg.import_module("economy.core")
reward = core.calculate_reward(user_id=123)
```

## Quickstart — Mode B (code runs on the server)

```python
project = LicensedProject(
    license_key="LL_...",
    server_url="https://example.ru",
    project_slug="economy-bot",
    mode="remote",
)

# The bot never receives the code — only the result of the call.
reward = await project.call("core.calculate_reward", user_id=123)
```

The entrypoint is `"module.function"`; keyword args are passed through. The
function's return value must be JSON-serialisable (a *declarative* result: what
the bot should do — e.g. `{"action": "give_coins", "amount": 50}`).

---

## Integrating into a py-cord bot

```python
import discord
from licensed_loader import LicensedProject, LicenseError, ServerUnavailable

bot = discord.Bot()

project = LicensedProject(
    license_key="LL_...",
    server_url="https://example.ru",
    project_slug="economy-bot",
    mode="local",                 # or "remote"
    revalidate_interval=900,      # re-check the license every 15 min
    on_revoke=lambda: print("License revoked — economy features disabled"),
)

@bot.event
async def on_ready():
    try:
        await project.load()      # Mode A: load once at startup
    except LicenseError:
        print("License denied — economy module will stay offline")
    except ServerUnavailable:
        print("Licensing server unreachable — will retry on next use")

@bot.slash_command()
async def daily(ctx):
    try:
        # Mode A: call the loaded package directly …
        result = project.package.core.calculate_reward(user_id=ctx.author.id)
        # … or, mode-agnostic, use project.call() (remote-aware):
        # result = await project.call("core.calculate_reward", user_id=ctx.author.id)
    except LicenseError:
        return await ctx.respond("This feature is currently unavailable.")
    await ctx.respond(f"You earned {result['amount']} coins!")

bot.run("DISCORD_TOKEN")
```

Notes:

- **One wrapper, many clients.** The only things that change per client are
  `license_key` and `project_slug`.
- **Graceful degradation.** A network blip does not crash your bot: `load()` and
  `call()` retry with exponential backoff and then raise `ServerUnavailable`,
  which you catch and treat as "feature temporarily off". Only an explicit
  server denial raises `LicenseError`.
- **Periodic revalidation.** A background task re-checks the license every
  `revalidate_interval` seconds. If it comes back **revoked**, the library
  blocks further use (`LicenseRevoked` on the next access) and calls your
  `on_revoke` callback — no restart needed. Transient server outages are
  tolerated (it retries next cycle rather than locking out a paying client).
- **Memory-only.** Decrypted code is never written to disk.

---

## Configuration

| Argument | Default | Meaning |
|---|---|---|
| `mode` | `"local"` | `"local"` (Mode A) or `"remote"` (Mode B). |
| `hardware_fingerprint` | auto | Machine binding. Auto-derived from platform + MAC; pass your own to override. |
| `client_version` | `None` | Reported to the server / access logs. |
| `revalidate_interval` | `900` | Seconds between background revalidations. `0` disables. |
| `http_timeout` | `10.0` | Per-request timeout (seconds). |
| `retries` | `3` | Retries for transient failures (network, 5xx, 429). |
| `verify_ssl` | `True` | TLS verification. Keep `True` in production. |
| `on_revoke` | `None` | Callback invoked when revalidation detects a revoke. |
| `anti_debug` | `True` | Coarse tamper hint (logs a warning if a tracer is attached or an unusually long pause occurs between fetch and first use). Not a security boundary. |

### Errors

```
LicensedLoaderError          # base
├── LicenseError             # server denied (revoked / expired / wrong key …)
│   └── LicenseRevoked       # detected during revalidation
├── ServerUnavailable        # unreachable after retries (transient — retry)
└── DecryptionError          # archive could not be decrypted with this key
```

---

## How the encryption works (Mode A)

1. The server stores each project file **encrypted at rest** with a server
   master key.
2. On `fetch`, the server assembles the license's *effective* files (globally
   enabled **and** not disabled for this license), encrypts the archive with a
   key **derived from your license key** via HKDF-SHA256 + a fresh random salt,
   and returns `{salt, nonce, ciphertext}`.
3. The library re-derives the same key from the license key you hold and
   decrypts in memory. The salt is public by design; the license key is the
   shared secret.

So the code is never sent in the clear, and only the holder of the license key
can open the archive.

---

## Server side (for the owner)

The server component and admin panel live in the site backend under
`backend/licensing/`. See `backend/licensing/README.md` for setup, environment
variables, migrations, and the admin panel. In short:

- Run the Alembic migration to create the `lic_*` tables.
- Open **`/licensing/admin`** (admin login) to manage projects, files, clients,
  licenses, per-client module toggles, security events and access logs.
- Set `LICENSING_MASTER_KEY` (at-rest encryption) and, optionally,
  `LICENSING_ALERT_WEBHOOK` (Discord/Slack alerts on auto-suspend).
