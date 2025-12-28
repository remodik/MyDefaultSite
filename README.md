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

```bash
cd /app/backend

# Установка зависимостей
pip install -r requirements.txt

# Создание администратора
python scripts/create_admin.py

# Создание демо-данных
python scripts/create_demo_services.py
python scripts/create_demo_project.py

# Запуск сервера
uvicorn server:app --host 0.0.0.0 --port 8001
```

### Frontend

```bash
cd /app
python -m http.server 3000
# или
npx serve . -l 3000 -s
```

## Учётные данные

### Администратор
- **Username:** remodik
- **Password:** domer123
- **Email:** slenderzet@gmail.com

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
