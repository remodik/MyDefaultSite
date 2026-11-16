# remod3 Portfolio Website

Сайт-визитка с системой авторизации, проектами, чатом и админ-панелью.

## Технологии

### Frontend
- **Vanilla JavaScript** (ES6 modules) - без фреймворков!
- Tailwind CSS (CDN)
- Prism.js - подсветка синтаксиса кода
- marked.js - рендеринг Markdown
- KaTeX - математические формулы
- Font Awesome - иконки
- SPA роутер на чистом JavaScript

### Backend
- FastAPI (Python)
- SQLite + SQLAlchemy (асинхронная)
- WebSocket для чата в реальном времени
- JWT для аутентификации
- Bcrypt для хеширования паролей
- SMTP (Gmail) для отправки email

## Функционал

### Публичные страницы
- **Главная** (`/`) - визитка с информацией о пользователе
- **Услуги** (`/services`) - список предоставляемых услуг
- **Контакты** (`/contact`) - форма обратной связи
- **Вход** (`/login`) - авторизация
- **Регистрация** (`/register`) - создание аккаунта
- **Восстановление пароля** (`/password-reset`)

### Для авторизованных пользователей
- **Проекты** (`/projects`) - список проектов с файлами
- **Чат** (`/chat`) - WebSocket чат в реальном времени

### Для администраторов
- **Админ панель** (`/admin`) - управление пользователями и запросами
- CRUD для услуг
- CRUD для проектов и файлов

## Структура проекта

```
/app/
├── index.html              # Главный HTML файл (SPA)
├── assets/
│   ├── css/
│   │   └── app.css        # Все стили
│   ├── js/
│   │   ├── app.js         # Главный файл, инициализация
│   │   ├── router.js      # SPA роутер
│   │   ├── auth.js        # Управление авторизацией
│   │   ├── api.js         # HTTP/WebSocket клиент
│   │   ├── utils.js       # Утилиты
│   │   ├── components/
│   │   │   ├── navbar.js  # Навигационная панель
│   │   │   └── modal.js   # Модальные окна
│   │   └── pages/         # Страницы SPA
│   │       ├── home.js
│   │       ├── login.js
│   │       ├── register.js
│   │       ├── password-reset.js
│   │       ├── projects.js
│   │       ├── project-detail.js
│   │       ├── services.js
│   │       ├── contact.js
│   │       ├── chat.js
│   │       ├── admin-panel.js
│   │       └── not-found.js
│   └── images/
│       └── blue_avatar.png
└── backend/
    ├── server.py           # FastAPI сервер
    ├── database.py         # Модели SQLAlchemy
    ├── requirements.txt
    ├── .env
    └── scripts/
        ├── create_admin.py
        ├── create_demo_services.py
        └── create_demo_project.py
```

## Установка и запуск

### Backend

Из корня репозитория:

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt

# Для новой базы. Скрипт запросит пароль.
python scripts/create_admin.py my-admin

python -m uvicorn server:app --host 127.0.0.1 --port 8001
```

### Frontend

Для локальной проверки отдавайте `index.html` и `assets/` статическим сервером с SPA fallback. Например, из корня репозитория:

```bash
preview_dir=$(mktemp -d)
cp -R index.html assets "$preview_dir/"
npx serve "$preview_dir" -l tcp://127.0.0.1:3000 -s
```

Откройте `http://127.0.0.1:3000/vault`. Установка frontend-зависимостей и сборка не требуются.

## Vault

Войдите как администратор и откройте `/vault`. Поиск использует SQLite FTS5. На телефоне список, редактор и связи открываются отдельными вкладками, а граф по умолчанию показывает соседей заметки. Кнопка с ключом открывает токены, ожидающие запросы и журнал Git.

- Markdown-файлы и история Git лежат в `VAULT_DIR` (по умолчанию `backend/data/vault`). Относительные пути считаются от `backend/`. Для коммитов используется Dulwich, поэтому на хосте не нужен исполняемый файл `git`. Неизменившийся текст не создаёт коммит.
- SQLite хранит индекс, токены и решения по запросам. Сохраняйте **оба** хранилища, каталог vault вместе с `.git` и файл БД. Для пересборки только индекса остановите backend и выполните из `backend/` команду `python scripts/reindex_vault.py --full` с тем же окружением. На старте таблицы создаются существующим `init_models()`, FTS5 и сверка индекса запускаются отдельно. Для установок с Alembic в репозитории есть две ревизии vault.
- Изменения на диске подхватывает watchfiles. При сбое используется опрос каталога. SSE посылает heartbeat каждые 15 секунд. Используйте один процесс uvicorn, чтобы блокировки записи, лимиты и подписки на события обслуживались одним процессом.

### MCP

В настройках vault выпустите токен `read-write` для `agent/` и `inbox/` и скопируйте его при создании. Префиксы чувствительны к регистру и ограничивают чтение, поиск и запись. Префикс `/` даёт доступ ко всему vault. Для перемещения, корзины и записи за пределами разрешённых папок агент с правом записи получает ID запроса на одобрение. Администратор проверяет операцию и актуальную версию заметки. Токен можно отозвать в любой момент. Содержимое заметок передаётся как недоверенный текст и не управляет правами.

Укажите Streamable HTTP URL `https://remod3.ru/mcp` (или напрямую `https://licensing.remod3.ru/mcp`) и заголовок `Authorization: Bearer <токен>` в клиенте, который поддерживает пользовательский bearer-токен. Например, конфигурация Codex читает значение из окружения:

```toml
[mcp_servers.vault]
url = "https://remod3.ru/mcp"
bearer_token_env_var = "VAULT_AGENT_TOKEN"
```

Проверка после подключения: вызовите `create_note` для `agent/first.md`. Заметка появится в открытой странице vault, а в журнале будет коммит `agent:<имя токена>`. Вызов для другой папки появится среди запросов и не создаст файл до одобрения. Для `update_note` передайте `expected_hash` из `read_note`.

### Pterodactyl, Cloudflare Tunnel и Vercel

1. Укажите в лаунчере `SITE_DIR` с путём к этому репозиторию, `SITE_PORT=8001` и `SITE_BIND_HOST=127.0.0.1`. Лаунчер установит `backend/requirements.txt` и запустит `server:app` из `backend/`. Настройте `backend/.env` по примеру. Задайте постоянный случайный `SECRET_KEY`, а для SQLite удалите строку с примером PostgreSQL `DATABASE_URL`, чтобы сохранить текущий `backend/projects.db`. При использовании прежнего опубликованного пароля смените его до выдачи токенов.
2. Public Hostname для backend в Cloudflare Tunnel должен указывать на **`http://127.0.0.1:8001`**. Подставьте свой `SITE_PORT`. При использовании `localhost` cloudflared может обратиться к IPv6 `::1` и получить 502. Включайте `VAULT_TRUST_PROXY_HEADER=always` только при доступе к backend исключительно через доверенный Tunnel. Это позволяет учитывать `CF-Connecting-IP` в лимитах входа и MCP.
3. Оставьте статический frontend на Vercel. `vercel.json` направляет `/vault` в SPA, а `/mcp` в действующий backend `licensing.remod3.ru`. Браузер обращается к backend напрямую, включая SSE. Для другого backend измените `window.APP_CONFIG.API_URL` в `index.html` и адреса rewrites в `vercel.json`. Укажите публичный origin фронтенда в `CORS_ORIGINS` и, для MCP-клиентов, которые отправляют `Origin`, добавьте разрешённые значения в `VAULT_MCP_ORIGINS`. На Cloudflare выключите кеширование `/api/vault/*` и `/mcp`.
4. Держите `VAULT_DIR` и БД на постоянном томе. Для резервного Docker-запуска примонтируйте каталог в `/app/backend/data`, задайте `VAULT_DIR=/app/backend/data/vault` и `DATABASE_URL=sqlite+aiosqlite:////app/backend/data/projects.db`. Если cloudflared работает на хосте, опубликуйте порт контейнера через `-p 127.0.0.1:8001:8001`. Для существующей установки перенесите файл SQLite на примонтированный том до запуска контейнера.

Локальный прогон из корня репозитория после установки backend-зависимостей:

```bash
backend/.venv/bin/python -m pip install pytest
backend/.venv/bin/python -m pytest -q backend/tests
```

## API Endpoints

### Авторизация
- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `GET /api/auth/me` - Текущий пользователь
- `POST /api/auth/password-reset-request` - Запрос сброса пароля
- `POST /api/auth/password-reset` - Сброс пароля

### Проекты
- `GET /api/projects` - Список проектов
- `GET /api/projects/{id}` - Проект с файлами
- `POST /api/projects` - Создать проект (admin)
- `PUT /api/projects/{id}` - Обновить проект (admin)
- `DELETE /api/projects/{id}` - Удалить проект (admin)

### Файлы
- `GET /api/files/{id}` - Получить файл
- `POST /api/files` - Создать файл (admin)
- `POST /api/files/upload` - Загрузить файл (admin)
- `PUT /api/files/{id}` - Обновить файл (admin)
- `DELETE /api/files/{id}` - Удалить файл (admin)

### Услуги
- `GET /api/services` - Список услуг
- `POST /api/services` - Создать услугу (admin)
- `PUT /api/services/{id}` - Обновить услугу (admin)
- `DELETE /api/services/{id}` - Удалить услугу (admin)

### Чат
- `WebSocket /api/ws/chat?token={jwt}` - WebSocket чат

### Контакты
- `POST /api/contact` - Отправить сообщение

### Админ
- `GET /api/admin/users` - Список пользователей
- `PUT /api/admin/users/{id}/role` - Изменить роль
- `POST /api/admin/reset-password/{id}` - Сброс пароля
- `GET /api/admin/reset-requests` - Запросы на сброс

## Поддерживаемые типы файлов

### С подсветкой синтаксиса
- Python (.py)
- JavaScript (.js)
- TypeScript (.ts)
- HTML (.html)
- CSS (.css)
- JSON (.json)
- SQL (.sql)
- YAML (.yml)
- XML (.xml)
- и другие...

### Markdown (.md)
- GitHub Flavored Markdown
- Математические формулы (KaTeX)
- Таблицы
- Task lists
- Блоки кода с подсветкой

### Медиафайлы
- Изображения: PNG, JPG, GIF, WebP
- Видео: MP4, AVI, MOV, WebM

## Особенности

- ✅ SPA без перезагрузки страницы
- ✅ Адаптивный дизайн (desktop + mobile)
- ✅ Тёмная тема в стиле Discord/GitHub
- ✅ JWT авторизация с ролями
- ✅ WebSocket чат в реальном времени
- ✅ Подсветка синтаксиса кода (Prism.js)
- ✅ Рендеринг Markdown с формулами
- ✅ Отправка email через Gmail SMTP
- ✅ Без npm/webpack - только чистые файлы + CDN
