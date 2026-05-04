import {isAuthenticated} from '../auth.js';
import {router} from '../router.js';
import {meApi, projectsApi, resolveApiUrl, servicesApi} from '../api.js';

let scrollObserver = null;
let typingInterval = null;

const TYPING_STRINGS = [
    'Discord-боты',
    'Веб-панели',
    'FastAPI backend',
    'API-интеграции',
    'Python системы',
];

export function render() {
    return `
        <div class="home-v2" id="home-v2-root">

            <div class="hv2-noise" aria-hidden="true"></div>

            <div class="hv2-glow hv2-glow-1" aria-hidden="true"></div>
            <div class="hv2-glow hv2-glow-2" aria-hidden="true"></div>
            <div class="hv2-glow hv2-glow-3" aria-hidden="true"></div>

            <section class="hv2-hero">
                <div class="hv2-hero-inner">
                    <div class="hv2-hero-left hv2-reveal" style="--d:0ms">
                        <div class="hv2-avatar-ring">
                            <div class="hv2-avatar-ring-spin" aria-hidden="true"></div>
                            <div class="hv2-avatar-wrap" id="hero-avatar-wrap">
                                <div class="hv2-avatar-fallback">R</div>
                            </div>
                            <div class="hv2-avatar-decoration" id="hero-avatar-decoration" aria-hidden="true"></div>
                            <span class="hv2-status-dot" aria-label="онлайн"></span>
                        </div>
                        <div class="hv2-hero-chip">
                            <span class="hv2-chip-dot"></span>
                            доступен для проектов
                        </div>
                    </div>

                    <div class="hv2-hero-center">
                        <div class="hv2-hero-eyebrow hv2-reveal" style="--d:80ms">
                            Python Developer · Discord Bots · Web Apps
                        </div>
                        <h1 class="hv2-hero-name hv2-reveal" style="--d:160ms">
                            <span class="hv2-name-accent">re</span>mod3
                        </h1>
                        <div class="hv2-hero-typing hv2-reveal" style="--d:240ms">
                            создаю&nbsp;<span class="hv2-typed" id="hv2-typed-text"></span><span class="hv2-cursor" aria-hidden="true">|</span>
                        </div>
                        <p class="hv2-hero-desc hv2-reveal" style="--d:320ms">
                            Создаю сложные системы для Discord&#8209;серверов,
                            рейтинговые системы, кланы, модерацию и веб&#8209;панели.
                        </p>
                        <div class="hv2-hero-actions hv2-reveal" style="--d:400ms">
                            <a href="/projects" class="hv2-btn hv2-btn-primary">
                                <i class="fas fa-folder-open"></i>
                                Проекты
                            </a>
                            <a href="/contact" class="hv2-btn hv2-btn-ghost">
                                <i class="fas fa-paper-plane"></i>
                                Написать
                            </a>
                        </div>
                    </div>

                    <div class="hv2-hero-right hv2-reveal" style="--d:200ms">
                        <div class="hv2-stat-card" id="stat-projects">
                            <span class="hv2-stat-value">—</span>
                            <span class="hv2-stat-label">проектов</span>
                        </div>
                        <div class="hv2-stat-card">
                            <span class="hv2-stat-value">2+</span>
                            <span class="hv2-stat-label">года опыта</span>
                        </div>
                        <div class="hv2-stat-card">
                            <span class="hv2-stat-value">24/7</span>
                            <span class="hv2-stat-label">онлайн</span>
                        </div>
                    </div>

                </div>

                <div class="hv2-scroll-hint hv2-reveal" style="--d:600ms" aria-hidden="true">
                    <div class="hv2-scroll-line"></div>
                    <span>scroll</span>
                </div>
            </section>

            <div class="hv2-marquee-wrap" aria-hidden="true">
                <div class="hv2-marquee-track">
                    ${[
                        'Python', 'FastAPI', 'Discord.py', 'SQLAlchemy',
                        'PostgreSQL', 'WebSockets', 'JWT', 'REST API',
                        'JavaScript', 'Vanilla JS', 'Tailwind CSS', 'Docker',
                        'Python', 'FastAPI', 'Discord.py', 'SQLAlchemy',
                        'PostgreSQL', 'WebSockets', 'JWT', 'REST API',
                        'JavaScript', 'Vanilla JS', 'Tailwind CSS', 'Docker',
                    ].map(s => `<span class="hv2-marquee-item"><span class="hv2-marquee-dot"></span>${s}</span>`).join('')}
                </div>
            </div>

            <section class="hv2-section hv2-about-section">
                <div class="hv2-section-inner">

                    <div class="hv2-section-label hv2-reveal">/ обо мне</div>

                    <div class="hv2-about-grid">
                        <div class="hv2-about-text hv2-reveal" style="--d:100ms">
                            <h2 class="hv2-section-title">
                                Привет, меня зовут <span class="hv2-accent">Илья</span>
                            </h2>
                            <p>
                                Мне 18 лет. Занимаюсь разработкой на&nbsp;Python —
                                специализируюсь на&nbsp;Discord-ботах: системы рейтингов,
                                управление кланами, HR-инструменты для&nbsp;модерации.
                            </p>
                            <p>
                                Также строю фулстек-веб-приложения на&nbsp;<strong>FastAPI + Vanilla&nbsp;JS</strong> —
                                именно то, что ты сейчас смотришь.
                            </p>
                            <div class="hv2-about-tags">
                                <span class="hv2-tag">Python</span>
                                <span class="hv2-tag">FastAPI</span>
                                <span class="hv2-tag">discord.py</span>
                                <span class="hv2-tag">SQLAlchemy</span>
                                <span class="hv2-tag">JavaScript</span>
                                <span class="hv2-tag">PostgreSQL</span>
                            </div>
                        </div>

                        <div class="hv2-skills-bars hv2-reveal" style="animation-delay:200ms">
                            ${[
                                { label: 'Python', pct: 65, color: '#5865f2' },
                                { label: 'Discord API', pct: 75, color: '#7289da' },
                                { label: 'JavaScript', pct: 45, color: '#f0b232' },
                                { label: 'FastAPI / SQL', pct: 55, color: '#23a559' },
                            ].map(({ label, pct, color }) => `
                                <div class="hv2-skill-row">
                                    <div class="hv2-skill-meta">
                                        <span>${label}</span>
                                        <span class="hv2-skill-pct">${pct}%</span>
                                    </div>
                                    <div class="hv2-skill-track">
                                        <div class="hv2-skill-fill" data-pct="${pct}" data-color="${color}"></div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </section>

            <section class="hv2-section hv2-services-section">
                <div class="hv2-section-inner">
                    <div class="hv2-section-label hv2-reveal">/ что делаю</div>
                    <h2 class="hv2-section-title hv2-reveal" style="--d:80ms">Услуги</h2>

                    <div class="hv2-services-grid" id="hv2-services-grid">
                        <div class="hv2-services-loading">
                            <div class="spinner"></div>
                        </div>
                    </div>

                    <div class="hv2-section-more hv2-reveal">
                        <a href="/services" class="hv2-btn hv2-btn-ghost">
                            Все услуги <i class="fas fa-arrow-right"></i>
                        </a>
                    </div>
                </div>
            </section>

            <section class="hv2-section hv2-projects-section">
                <div class="hv2-section-inner">
                    <div class="hv2-section-label hv2-reveal">/ последние работы</div>
                    <h2 class="hv2-section-title hv2-reveal" style="--d:80ms">Проекты</h2>

                    <div class="hv2-projects-grid" id="hv2-projects-grid">
                        <div class="hv2-services-loading"><div class="spinner"></div></div>
                    </div>

                    ${isAuthenticated() ? `
                        <div class="hv2-section-more hv2-reveal">
                            <a href="/projects" class="hv2-btn hv2-btn-ghost">
                                Все проекты <i class="fas fa-arrow-right"></i>
                            </a>
                        </div>
                    ` : `
                        <div class="hv2-section-more hv2-reveal">
                            <p class="hv2-auth-hint">
                                <a href="/login" class="hv2-link">Войдите</a>, чтобы просматривать проекты
                            </p>
                        </div>
                    `}
                </div>
            </section>

            <section class="hv2-cta-section hv2-reveal">
                <div class="hv2-cta-glow" aria-hidden="true"></div>
                <div class="hv2-cta-inner">
                    <div class="hv2-cta-label">готов к новым проектам</div>
                    <h2 class="hv2-cta-title">Есть идея? <span class="hv2-accent">Давай сделаем</span></h2>
                    <div class="hv2-cta-actions">
                        <a href="/contact" class="hv2-btn hv2-btn-primary hv2-btn-lg">
                            <i class="fas fa-paper-plane"></i>
                            Написать мне
                        </a>
                        <a href="https://t.me/remod3" target="_blank" rel="noopener" class="hv2-btn hv2-btn-ghost hv2-btn-lg">
                            <i class="fab fa-telegram"></i>
                            Telegram
                        </a>
                    </div>
                </div>
            </section>

        </div>

        <style>
        .home-v2 {
            position: relative;
            min-height: 100vh;
            overflow-x: hidden;
            background: #0d0e11;
            color: #c8ccd4;
            font-family: "Segoe UI", system-ui, sans-serif;
        }

        .hv2-noise {
            pointer-events: none;
            position: fixed;
            inset: 0;
            z-index: 0;
            opacity: .028;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
            background-size: 180px;
        }

        .hv2-glow {
            pointer-events: none;
            position: fixed;
            border-radius: 50%;
            filter: blur(120px);
            opacity: .18;
            z-index: 0;
            transition: opacity 1s;
        }
        .hv2-glow-1 {
            width: 600px; height: 600px;
            background: var(--user-accent, #5865f2);
            top: -200px; left: -150px;
            animation: glow-drift-1 18s ease-in-out infinite alternate;
        }
        .hv2-glow-2 {
            width: 500px; height: 500px;
            background: #23a559;
            bottom: 20vh; right: -100px;
            animation: glow-drift-2 22s ease-in-out infinite alternate;
            opacity: .1;
        }
        .hv2-glow-3 {
            width: 350px; height: 350px;
            background: #eb459e;
            top: 55vh; left: 40vw;
            animation: glow-drift-3 26s ease-in-out infinite alternate;
            opacity: .07;
        }

        @keyframes glow-drift-1 {
            from { transform: translate(0,0) scale(1); }
            to   { transform: translate(80px, 60px) scale(1.15); }
        }
        @keyframes glow-drift-2 {
            from { transform: translate(0,0) scale(1); }
            to   { transform: translate(-60px, -80px) scale(1.2); }
        }
        @keyframes glow-drift-3 {
            from { transform: translate(0,0) scale(1); }
            to   { transform: translate(40px, 60px) scale(.9); }
        }

        .hv2-reveal {
            opacity: 0;
            transform: translateY(22px);
            transition: opacity .55s ease calc(var(--d, 0ms)),
                        transform .55s ease calc(var(--d, 0ms));
        }
        .hv2-reveal.is-visible {
            opacity: 1;
            transform: translateY(0);
        }

        .hv2-hero {
            position: relative;
            z-index: 1;
            min-height: calc(100vh - 64px);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 80px 24px 60px;
        }

        .hv2-hero-inner {
            width: 100%;
            max-width: 1200px;
            display: grid;
            grid-template-columns: 220px 1fr 180px;
            gap: 48px;
            align-items: center;
        }

        .hv2-hero-left {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
        }

        .hv2-avatar-ring {
            position: relative;
            width: 160px;
            height: 160px;
        }

        .hv2-avatar-ring-spin {
            position: absolute;
            inset: -4px;
            border-radius: 50%;
            background: conic-gradient(
                var(--user-accent, #5865f2) 0%,
                transparent 35%,
                #23a559 60%,
                transparent 80%,
                var(--user-accent, #5865f2) 100%
            );
            animation: ring-spin 5s linear infinite;
            opacity: .85;
        }

        @keyframes ring-spin {
            to { transform: rotate(360deg); }
        }

        .hv2-avatar-wrap {
            position: absolute;
            inset: 4px;
            border-radius: 50%;
            overflow: hidden;
            background: #1a1c21;
            border: 3px solid #0d0e11;
        }

        .hv2-avatar-wrap img {
            width: 100%; height: 100%;
            object-fit: cover;
        }

        .hv2-avatar-decoration {
            position: absolute;
            inset: -18px;
            border-radius: 50%;
            background: no-repeat center / contain;
            pointer-events: none;
            z-index: 2;
        }

        .hv2-avatar-fallback {
            width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            font-size: 52px; font-weight: 800;
            color: var(--user-accent, #5865f2);
            background: linear-gradient(135deg, rgba(88,101,242,.15), rgba(88,101,242,.05));
        }

        .hv2-status-dot {
            position: absolute;
            bottom: 8px; right: 8px;
            width: 18px; height: 18px;
            border-radius: 50%;
            background: #23a559;
            border: 3px solid #0d0e11;
            box-shadow: 0 0 10px #23a55980;
            animation: status-pulse 2.5s ease-in-out infinite;
        }

        @keyframes status-pulse {
            0%, 100% { box-shadow: 0 0 10px #23a55980; }
            50% { box-shadow: 0 0 20px #23a559cc; }
        }

        .hv2-hero-chip {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 6px 14px;
            border-radius: 999px;
            border: 1px solid rgba(35, 165, 89, .4);
            background: rgba(35, 165, 89, .08);
            color: #23a559;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: .5px;
        }

        .hv2-chip-dot {
            width: 6px; height: 6px;
            border-radius: 50%;
            background: #23a559;
            animation: status-pulse 2s ease-in-out infinite;
        }

        .hv2-hero-center {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .hv2-hero-eyebrow {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: #6b7280;
        }

        .hv2-hero-name {
            font-size: clamp(3rem, 6vw, 5.5rem);
            font-weight: 900;
            line-height: .95;
            letter-spacing: -.02em;
            color: #f2f3f5;
            margin: 0;
        }

        .hv2-name-accent {
            color: var(--user-accent, #5865f2);
        }

        .hv2-hero-typing {
            font-size: 1.1rem;
            color: #8b92a0;
            height: 1.6em;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .hv2-typed {
            color: #f2f3f5;
            font-weight: 600;
        }

        .hv2-cursor {
            color: var(--user-accent, #5865f2);
            animation: cursor-blink .8s step-end infinite;
        }

        @keyframes cursor-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
        }

        .hv2-hero-desc {
            font-size: .97rem;
            line-height: 1.7;
            color: #7c8494;
            max-width: 480px;
            margin: 0;
        }

        .hv2-hero-actions {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            margin-top: 8px;
        }

        .hv2-hero-right {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .hv2-stat-card {
            background: rgba(255,255,255,.04);
            border: 1px solid rgba(255,255,255,.07);
            border-radius: 12px;
            padding: 16px 20px;
            display: flex;
            flex-direction: column;
            gap: 2px;
            backdrop-filter: blur(10px);
            transition: border-color .2s, background .2s;
        }

        .hv2-stat-card:hover {
            border-color: rgba(88,101,242,.4);
            background: rgba(88,101,242,.06);
        }

        .hv2-stat-value {
            font-size: 1.8rem;
            font-weight: 800;
            color: #f2f3f5;
            line-height: 1;
        }

        .hv2-stat-label {
            font-size: .75rem;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: .8px;
        }

        .hv2-scroll-hint {
            position: absolute;
            bottom: 32px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            color: #3d424e;
            font-size: 10px;
            letter-spacing: 2px;
            text-transform: uppercase;
        }

        .hv2-scroll-line {
            width: 1px;
            height: 40px;
            background: linear-gradient(to bottom, transparent, #3d424e);
            animation: scroll-line 1.8s ease-in-out infinite;
        }

        @keyframes scroll-line {
            0%, 100% { transform: scaleY(0); transform-origin: top; }
            50% { transform: scaleY(1); transform-origin: top; }
        }

        .hv2-marquee-wrap {
            position: relative;
            z-index: 1;
            overflow: hidden;
            border-top: 1px solid rgba(255,255,255,.06);
            border-bottom: 1px solid rgba(255,255,255,.06);
            padding: 14px 0;
            background: rgba(255,255,255,.02);
            mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
        }

        .hv2-marquee-track {
            display: flex;
            gap: 0;
            white-space: nowrap;
            animation: marquee-scroll 30s linear infinite;
        }

        @keyframes marquee-scroll {
            from { transform: translateX(0); }
            to   { transform: translateX(-50%); }
        }

        .hv2-marquee-item {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 0 24px;
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            color: #4a5160;
        }

        .hv2-marquee-dot {
            width: 4px; height: 4px;
            border-radius: 50%;
            background: var(--user-accent, #5865f2);
            opacity: .6;
        }

        .hv2-section {
            position: relative;
            z-index: 1;
            padding: 100px 24px;
        }

        .hv2-section-inner {
            max-width: 1200px;
            margin: 0 auto;
        }

        .hv2-section-label {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 3px;
            text-transform: uppercase;
            color: var(--user-accent, #5865f2);
            margin-bottom: 12px;
        }

        .hv2-section-title {
            font-size: clamp(1.8rem, 3vw, 2.8rem);
            font-weight: 800;
            color: #f2f3f5;
            margin: 0 0 48px;
            letter-spacing: -.02em;
        }

        .hv2-section-more {
            margin-top: 48px;
            display: flex;
            justify-content: center;
        }

        .hv2-about-section {
            border-top: 1px solid rgba(255,255,255,.05);
        }

        .hv2-about-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 64px;
            align-items: start;
        }

        .hv2-about-text p {
            margin: 0 0 16px;
            line-height: 1.75;
            color: #8b92a0;
        }

        .hv2-about-text strong {
            color: #c8ccd4;
        }

        .hv2-about-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 24px;
        }

        .hv2-tag {
            padding: 5px 12px;
            border-radius: 6px;
            background: rgba(88,101,242,.1);
            border: 1px solid rgba(88,101,242,.25);
            color: #9aa3ff;
            font-size: 12px;
            font-weight: 600;
        }

        .hv2-skill-row {
            margin-bottom: 20px;
        }

        .hv2-skill-meta {
            display: flex;
            justify-content: space-between;
            margin-bottom: 7px;
            font-size: 13px;
            font-weight: 600;
            color: #c8ccd4;
        }

        .hv2-skill-pct {
            color: #6b7280;
        }

        .hv2-skill-track {
            height: 5px;
            border-radius: 999px;
            background: rgba(255,255,255,.07);
            overflow: hidden;
        }

        .hv2-skill-fill {
            height: 100%;
            width: 0;
            border-radius: 999px;
            background: #5865f2;
            transition: width 1.2s cubic-bezier(.16,1,.3,1) .3s;
        }

        .hv2-services-section {
            border-top: 1px solid rgba(255,255,255,.05);
        }

        .hv2-services-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
        }

        .hv2-service-card {
            position: relative;
            background: rgba(255,255,255,.03);
            border: 1px solid rgba(255,255,255,.07);
            border-radius: 16px;
            padding: 28px;
            transition: border-color .25s, background .25s, transform .25s;
            overflow: hidden;
        }

        .hv2-service-card::before {
            content: '';
            position: absolute;
            inset: 0;
            background: radial-gradient(circle at 0% 0%, rgba(88,101,242,.08), transparent 60%);
            opacity: 0;
            transition: opacity .3s;
        }

        .hv2-service-card:hover {
            border-color: rgba(88,101,242,.35);
            background: rgba(88,101,242,.05);
            transform: translateY(-3px);
        }

        .hv2-service-card:hover::before {
            opacity: 1;
        }

        .hv2-service-icon {
            width: 44px; height: 44px;
            border-radius: 12px;
            background: rgba(88,101,242,.12);
            display: flex; align-items: center; justify-content: center;
            font-size: 20px;
            margin-bottom: 16px;
            color: var(--user-accent, #5865f2);
        }

        .hv2-service-name {
            font-size: 1rem;
            font-weight: 700;
            color: #f2f3f5;
            margin: 0 0 8px;
        }

        .hv2-service-desc {
            font-size: .85rem;
            line-height: 1.6;
            color: #6b7280;
            margin: 0 0 16px;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .hv2-service-price {
            font-size: .85rem;
            font-weight: 700;
            color: #23a559;
        }

        .hv2-services-loading {
            grid-column: 1 / -1;
            display: flex;
            justify-content: center;
            padding: 48px;
        }

        .hv2-projects-section {
            border-top: 1px solid rgba(255,255,255,.05);
        }

        .hv2-projects-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 20px;
        }

        .hv2-project-card {
            background: rgba(255,255,255,.03);
            border: 1px solid rgba(255,255,255,.07);
            border-radius: 16px;
            padding: 28px;
            cursor: pointer;
            transition: border-color .25s, background .25s, transform .25s;
        }

        .hv2-project-card:hover {
            border-color: rgba(88,101,242,.4);
            background: rgba(88,101,242,.05);
            transform: translateY(-4px);
        }

        .hv2-project-icon {
            width: 44px; height: 44px;
            border-radius: 12px;
            background: rgba(88,101,242,.12);
            display: flex; align-items: center; justify-content: center;
            font-size: 18px;
            margin-bottom: 16px;
            color: var(--user-accent, #5865f2);
        }

        .hv2-project-name {
            font-size: 1rem;
            font-weight: 700;
            color: #f2f3f5;
            margin: 0 0 8px;
        }

        .hv2-project-desc {
            font-size: .85rem;
            line-height: 1.6;
            color: #6b7280;
            margin: 0;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .hv2-project-arrow {
            margin-top: 16px;
            font-size: .8rem;
            color: var(--user-accent, #5865f2);
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .hv2-auth-hint {
            color: #6b7280;
            font-size: .9rem;
        }

        .hv2-cta-section {
            position: relative;
            z-index: 1;
            padding: 120px 24px;
            text-align: center;
            border-top: 1px solid rgba(255,255,255,.05);
            overflow: hidden;
        }

        .hv2-cta-glow {
            pointer-events: none;
            position: absolute;
            width: 600px; height: 300px;
            left: 50%; top: 50%;
            transform: translate(-50%, -50%);
            background: radial-gradient(ellipse, rgba(88,101,242,.2), transparent 70%);
            border-radius: 50%;
        }

        .hv2-cta-inner {
            position: relative;
            max-width: 600px;
            margin: 0 auto;
        }

        .hv2-cta-label {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 3px;
            text-transform: uppercase;
            color: var(--user-accent, #5865f2);
            margin-bottom: 16px;
        }

        .hv2-cta-title {
            font-size: clamp(2rem, 4vw, 3.2rem);
            font-weight: 900;
            color: #f2f3f5;
            letter-spacing: -.02em;
            margin: 0 0 40px;
            line-height: 1.1;
        }

        .hv2-cta-actions {
            display: flex;
            gap: 14px;
            justify-content: center;
            flex-wrap: wrap;
        }

        .hv2-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 11px 24px;
            border-radius: 10px;
            font-weight: 600;
            font-size: .9rem;
            text-decoration: none;
            cursor: pointer;
            border: none;
            outline: none;
            transition: all .2s ease;
            letter-spacing: .2px;
        }

        .hv2-btn-primary {
            background: var(--user-accent, #5865f2);
            color: #fff;
            box-shadow: 0 8px 24px rgba(88,101,242,.3);
        }

        .hv2-btn-primary:hover {
            background: #6471ff;
            transform: translateY(-2px);
            box-shadow: 0 12px 32px rgba(88,101,242,.45);
        }

        .hv2-btn-ghost {
            background: rgba(255,255,255,.06);
            border: 1px solid rgba(255,255,255,.1);
            color: #c8ccd4;
        }

        .hv2-btn-ghost:hover {
            background: rgba(255,255,255,.1);
            border-color: rgba(255,255,255,.2);
            color: #f2f3f5;
            transform: translateY(-2px);
        }

        .hv2-btn-lg {
            padding: 14px 32px;
            font-size: 1rem;
        }

        .hv2-accent {
            color: var(--user-accent, #5865f2);
        }

        .hv2-link {
            color: var(--user-accent, #5865f2);
            text-decoration: none;
            font-weight: 600;
        }

        .hv2-link:hover {
            text-decoration: underline;
        }

        @media (max-width: 1024px) {
            .hv2-hero-inner {
                grid-template-columns: 180px 1fr;
                grid-template-rows: auto auto;
            }
            .hv2-hero-right {
                grid-column: 1 / -1;
                flex-direction: row;
                flex-wrap: wrap;
            }
            .hv2-stat-card {
                flex: 1;
                min-width: 120px;
            }
            .hv2-about-grid {
                grid-template-columns: 1fr;
                gap: 40px;
            }
        }

        @media (max-width: 768px) {
            .hv2-hero {
                padding: 60px 20px 60px;
            }
            .hv2-hero-inner {
                grid-template-columns: 1fr;
                text-align: center;
            }
            .hv2-hero-left {
                grid-row: 1;
            }
            .hv2-hero-actions {
                justify-content: center;
            }
            .hv2-hero-desc {
                margin: 0 auto;
            }
            .hv2-avatar-ring {
                width: 130px;
                height: 130px;
            }
            .hv2-hero-name {
                font-size: 3rem;
            }
            .hv2-hero-right {
                grid-column: 1;
            }
            .hv2-scroll-hint {
                display: none;
            }
            .hv2-section {
                padding: 70px 20px;
            }
        }
        </style>
    `;
}

export async function mount() {
    initRevealObserver();
    startTyping();
    await loadAvatar();
    await loadServices();
    if (isAuthenticated()) {
        await loadProjects();
    } else {
        renderProjectsPlaceholder();
    }
    await loadProjectCount();
}

export function unmount() {
    if (scrollObserver) {
        scrollObserver.disconnect();
        scrollObserver = null;
    }
    if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
    }
}

function initRevealObserver() {
    const elements = document.querySelectorAll('.hv2-reveal');

    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');

                if (entry.target.classList.contains('hv2-skills-bars')) {
                    entry.target.querySelectorAll('.hv2-skill-fill').forEach(fill => {
                        const pct = fill.dataset.pct || '0';
                        fill.style.background = fill.dataset.color || '#5865f2';
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                fill.style.width = pct + '%';
                            });
                        });
                    });
                }

                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08 });

    elements.forEach(el => io.observe(el));
    scrollObserver = io;
}

function startTyping() {
    const el = document.getElementById('hv2-typed-text');
    if (!el) return;

    let si = 0, ci = 0, deleting = false;
    const TYPE_SPEED = 80, DELETE_SPEED = 40, PAUSE = 1800;

    function tick() {
        const current = TYPING_STRINGS[si];
        if (!deleting) {
            el.textContent = current.slice(0, ++ci);
            if (ci === current.length) {
                deleting = true;
                typingInterval = setTimeout(tick, PAUSE);
                return;
            }
        } else {
            el.textContent = current.slice(0, --ci);
            if (ci === 0) {
                deleting = false;
                si = (si + 1) % TYPING_STRINGS.length;
            }
        }
        typingInterval = setTimeout(tick, deleting ? DELETE_SPEED : TYPE_SPEED);
    }

    typingInterval = setTimeout(tick, 600);
}

async function loadAvatar() {
    const DECORATION_URL = 'https://cdn.discordapp.com/avatar-decoration-presets/a_cd2c570c5a011190008ee7e34a6dfe87.png?size=160&passthrough=true';
    const decoration = document.getElementById('hero-avatar-decoration');
    if (decoration) {
        decoration.style.backgroundImage = `url("${DECORATION_URL}")`;
    }

    try {
        const profile = await meApi.getProfile();
        if (profile?.avatar_url) {
            const wrap = document.getElementById('hero-avatar-wrap');
            if (wrap) {
                wrap.innerHTML = `<img src="${resolveApiUrl(profile.avatar_url)}" alt="avatar">`;
            }
        }
    } catch {  }
}

async function loadProjectCount() {
    if (!isAuthenticated()) return;
    try {
        const projects = await projectsApi.getAll();
        const el = document.querySelector('#stat-projects .hv2-stat-value');
        if (el) el.textContent = `${projects.length}+`;
    } catch {  }
}

async function loadServices() {
    const grid = document.getElementById('hv2-services-grid');
    if (!grid) return;

    const ICONS = [
        'fa-robot', 'fa-globe', 'fa-plug', 'fa-database',
        'fa-code', 'fa-cogs', 'fa-chart-bar', 'fa-shield-alt',
    ];

    try {
        const services = await servicesApi.getAll();
        if (!services.length) {
            grid.innerHTML = '<p style="color:#6b7280;text-align:center;padding:40px;grid-column:1/-1">Услуги скоро появятся</p>';
            return;
        }

        grid.innerHTML = services.slice(0, 6).map((s, i) => `
            <div class="hv2-service-card hv2-reveal" style="--d:${i * 80}ms">
                <div class="hv2-service-icon">
                    <i class="fas ${ICONS[i % ICONS.length]}"></i>
                </div>
                <div class="hv2-service-name">${escHtml(s.name)}</div>
                <div class="hv2-service-desc">${escHtml(s.description)}</div>
                <div class="hv2-service-price">${escHtml(s.price)}</div>
            </div>
        `).join('');

        grid.querySelectorAll('.hv2-reveal').forEach(el => {
            if (scrollObserver) scrollObserver.observe(el);
        });

    } catch {
        grid.innerHTML = '<p style="color:#6b7280;text-align:center;padding:40px;grid-column:1/-1">Не удалось загрузить услуги</p>';
    }
}

async function loadProjects() {
    const grid = document.getElementById('hv2-projects-grid');
    if (!grid) return;

    try {
        const projects = await projectsApi.getAll();
        if (!projects.length) {
            grid.innerHTML = '<p style="color:#6b7280;text-align:center;padding:40px;grid-column:1/-1">Проектов пока нет</p>';
            return;
        }

        grid.innerHTML = projects.slice(0, 3).map((p, i) => `
            <div class="hv2-project-card hv2-reveal" style="--d:${i * 100}ms" data-id="${p.id}">
                <div class="hv2-project-icon"><i class="fas fa-code"></i></div>
                <div class="hv2-project-name">${escHtml(p.name)}</div>
                <div class="hv2-project-desc">${escHtml(p.description || 'Нет описания')}</div>
                <div class="hv2-project-arrow">Открыть <i class="fas fa-arrow-right"></i></div>
            </div>
        `).join('');

        grid.querySelectorAll('.hv2-project-card').forEach(card => {
            card.addEventListener('click', () => router.navigate(`/projects/${card.dataset.id}`));
        });

        grid.querySelectorAll('.hv2-reveal').forEach(el => {
            if (scrollObserver) scrollObserver.observe(el);
        });

    } catch {
        grid.innerHTML = '<p style="color:#6b7280;text-align:center;padding:40px;grid-column:1/-1">Не удалось загрузить проекты</p>';
    }
}

function renderProjectsPlaceholder() {
    const grid = document.getElementById('hv2-projects-grid');
    if (!grid) return;
    grid.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding: 48px 24px; color:#4a5160;">
            <i class="fas fa-lock" style="font-size:2.5rem; margin-bottom:16px; display:block; opacity:.4"></i>
            <p style="margin:0; font-size:.95rem;">Авторизуйтесь, чтобы просматривать проекты</p>
        </div>
    `;
}

function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
