# Frontend — Очередь задач и промпты (v2)

> **Как пользоваться:** Открываешь новую вкладку AI-чата → используешь workflow `/feature-cycle`, либо копируешь нужный промпт целиком → вставляешь → работаешь.
> Каждый промпт самодостаточный и содержит весь необходимый контекст и требуемые скиллы.
> **Архитектура v2:** Вся бизнес-логика и состояние — on-chain. Frontend читает PDAs напрямую из Solana RPC. Единственный backend-вызов — `GET /telemetry/latest/:project_id`. Нет JWT, нет сессий, нет БД.

---

## Общий статус

| # | Задача | US | Статус |
|---|--------|----|--------|
| 1 | Scaffold Next.js + RPC Client | — | ✅ |
| 2 | Wallet Adapter + Layout Shell | US-F01 | ✅ |
| 3 | On-chain Client Layer + Types | — | ✅ |
| 4 | Мультиязычность (i18n) | — | ✅ |
| 5 | Каталог автомобилей | US-F03 | ⬜ |
| 6 | Страница актива | US-F04 | ⬜ |
| 7 | Whitelist Check + KYC CTA | US-F02 | ⬜ |
| 8 | Invest Flow | US-F05 | ⬜ |
| 9 | TX Confirmation Feedback | US-F06 | ⬜ |
| 10 | Dashboard + Portfolio | US-F07 | ⬜ |
| 11 | Live Telemetry Widget | US-F07b | ⬜ |
| 12 | Claim Revenue | US-F08 | ⬜ |
| 13 | RPC Error Handling | US-F12 | ⬜ |
| 14 | Payout History | US-F09 | ⬜ |
| 15 | Admin Panel | US-F10 | ⬜ |
| 16 | Mobile Responsive | US-F11 | ⬜ |
| 17 | Security Headers + Sanitization | US-F13 | ⬜ |
| 18 | E2E Testing & Test Coverage | — | ⬜ |
| 19 | Staging Deploy + Smoke Test | — | ⬜ |

---

## Задачи

### Задача 1 — Scaffold Next.js + RPC Client

```text
Ты — Senior Frontend Developer, специализирующийся на Next.js и Solana Web3.

## Рекомендуемые инструменты и скиллы
- @setup-project (если применимо)
- @vercel-react-best-practices
- @vercel-composition-patterns

## Контекст проекта
AXEL — платформа токенизации реальных активов (RWA) на Solana. Инвесторы покупают Token-2022 токены, получают доход от эксплуатации и делают claim через блокчейн. КЛЮЧЕВАЯ АРХИТЕКТУРА: Весь стейт живёт on-chain. Frontend читает данные НАПРЯМУЮ из Solana.

## Задание
Инициализируй Next.js проект со следующим стеком: Next.js 14+ (App Router), TypeScript, Tailwind CSS v3, ESLint + Prettier.
- Создай базовую структуру папок (`src/app`, `src/components`, `src/hooks`, `src/lib`, `src/types`, `src/providers`).
- Настрой `.env.local.example`.
- Настрой Tailwind с палитрой из дизайн-системы (Light theme, Primary: Cyan #06B6D4).
- Создай `src/lib/solana/connection.ts`.

## Тестирование
- ОБЯЗАТЕЛЬНО: Настрой инфраструктуру для тестирования (Vitest, React Testing Library).

Проверь что `npm run dev` работает и тесты запускаются ; echo "DONE"
```

---

### Задача 2 — Wallet Adapter + Layout Shell

```text
Ты — Senior Frontend Developer, Solana Web3 + Next.js.

## Рекомендуемые инструменты и скиллы
- @ui-ux-pro-max
- @frontend-design
- @test-driven-development (ОБЯЗАТЕЛЬНО писать тесты!)

## Контекст проекта
AXEL — RWA токенизация на Solana. On-chain first. Проект инициализирован.

## Дизайн + i18n
> **ВАЖНО:** ВЕЗДЕ используй `next-intl` для текстов! Никаких захардкоженных строк. Apple-like минимализм.
- Ссылайся на `frontend/DESIGN_SYSTEM.md`. Light theme, Primary #06B6D4, pill кнопки, frosted glass Navbar.

## Задание
1. Установи Wallet Adapter зависимости.
2. Создай `WalletProvider` (devnet, Phantom, Backpack).
3. Создай `Navbar` (Apple-style 52px, wallet chip с state: Connect / Address+SOL balance) и `Footer`.
4. Обнови Root Layout (шрифты Inter, провайдеры).
5. Создай хук `useWalletInfo` для вывода баланса и адреса.

## Тестирование
- ОБЯЗАТЕЛЬНО НАПИШИ ТЕСТЫ для `Navbar`, `Footer`, `useWalletInfo` с моком Wallet Adapter!
- Используй @test-driven-development подход.

Проверь что npm run dev работает, кошелёк подключается, тесты зеленые ; echo "DONE"
```

---

### Задача 3 — On-chain Client Layer + Types

```text
Ты — Senior Frontend Developer, TypeScript, Solana Anchor.

## Рекомендуемые инструменты и скиллы
- @test-driven-development (ОБЯЗАТЕЛЬНО писать тесты!)
- @systematic-debugging

## Контекст проекта
AXEL — RWA токенизация на Solana. Весь стейт on-chain в PDAs. 

## Задание
1. Определи TypeScript типы в `src/types/` (ProjectState, InvestorRecord, RevenuePeriod, ClaimRecord, WhitelistEntry, TelemetryData).
2. Реализуй PDA Derivation (`src/lib/solana/pda.ts`) через `PublicKey.findProgramAddressSync`.
3. Реализуй on-chain читалки (`src/lib/solana/readers.ts`).
4. Задай instruction builders (`src/lib/solana/instructions.ts`) как заглушки.
5. Создай Telemetry API client (`src/lib/api/telemetry.ts`).
6. Создай React Query хуки (`useProjectState`, `useInvestorRecord` и т.д.).
7. Напиши mock data для разработки UI.

## Тестирование
- НАПИШИ ТЕСТЫ: Unit-тесты для функций деривации PDA (`pda.ts`), читалок, и хуков React Query (мокая on-chain вызовы).

Весь код рабочий, без плейсхолдеров. Экспорты через index.ts файлы. Прогони тесты ; echo "DONE"
```

---

### Задача 4 — Мультиязычность (i18n)

```text
Ты — Senior Frontend Developer, Next.js App Router expert.

## Рекомендуемые инструменты и скиллы
- @vercel-react-best-practices
- @test-driven-development (ОБЯЗАТЕЛЬНО писать тесты!)

## Контекст проекта
AXEL — RWA платформа на Solana. Внедряем строгую мультиязычность `next-intl` (EN и RU).

## Задание
1. Установи структуру `next-intl` (`middleware.ts`, `i18n.ts`, динамический сегмент `[locale]`).
2. Создай словари (messages/en.json, messages/ru.json) с неймспейсами (Common, Navigation, Web3Errors, Dashboard, Asset).
3. Интегрируй в App Router (оберни RootLayout в NextIntlClientProvider, переведи харкдод строки в `useTranslations()`).
> **ПРАВИЛО ДЛЯ ВСЕХ ПОСЛЕДУЮЩИХ ЗАДАЧ:** ВЕСЬ новый UI должен писаться с использованием `next-intl`.

## Тестирование
- Напиши тесты: Проверь, что смена локалей отрабатывает корректно и словари загружаются.

Проверь что приложение собирается без ошибок и открывается по `/en` и `/ru` ; echo "DONE"
```

---

### Задача 5 — Каталог автомобилей

```text
Ты — Senior Frontend Developer, UI/UX, финтех. Начинай с команды `/feature-cycle`.

## Рекомендуемые инструменты и скиллы
- @ui-ux-pro-max
- @frontend-design
- @test-driven-development (ОБЯЗАТЕЛЬНО писать тесты!)

## Контекст проекта
Каталог (src/app/page.tsx). Читается из ProjectState PDAs через хук `useProjectState()`. Mock data доступна.

## Дизайн + i18n
> **ВАЖНО:** ВЕЗДЕ `next-intl`! Apple минимализм, Light theme, Secondary #F5F5F7, Primary #06B6D4.

## Задание
Реализуй главную страницу каталога.
1. `Badge.tsx`: Pill shape, статусы (fundraising, active, paused, closed) с пульсацией где применимо.
2. `ProgressBar.tsx`: Pill shape, animation 800ms.
3. `Card.tsx` и `Skeleton.tsx`.
4. `AssetCard.tsx`: Рендерит данные Project, Badge статуса, ProgressBar, Цену.
5. Страница каталога: Hero блок ("Invest in Real-World Assets"), Фильтрация (pill chips), Скилетоны для Loading, Empty state. Max-width 980px.

## Тестирование
- НАПИШИ ТЕСТЫ для всех UI компонентов (`Badge`, `ProgressBar`, `Card`, `AssetCard`) используя RTL.

Используй mock data. npm run dev + npm run test ; echo "DONE"
```

---

### Задача 6 — Страница актива

```text
Ты — Senior Frontend Developer. Финтех, Web3. Начинай с `/feature-cycle`.

## Рекомендуемые инструменты и скиллы
- @ui-ux-pro-max
- @frontend-design
- @test-driven-development (ОБЯЗАТЕЛЬНО писать тесты!)

## Контекст проекта
Детальная страница актива (`src/app/assets/[id]/page.tsx`). Чтение из ProjectState PDA.

## Задание
1. `CountdownTimer.tsx`: DD:HH:MM:SS, update 1s. <24h red #FF3B30. 
2. `AddressLink.tsx`: Truncated address, external link icon.
3. `AssetHeader.tsx`: Рендер фото, Марка/Модель, Badge статуса, VIN.
4. `FundingProgress.tsx`: ProgressBar SOL raised, Tokens remaining, CountdownTimer.
5. `InvestmentDetails.tsx`: Key-value table (Price per token, Min/max, addresses).
6. `RevenueProjection.tsx`: Horizontal CSS bars (Revenue - Expenses - Reserve = Profit).
7. `InvestButton.tsx`: Интеграция с KYC и Wallet state (Connect Wallet / Complete KYC / Invest Now).
8. Сборка страницы: 2 столбца десктоп, 1 на мобиле Sticky.

## Тестирование
- Unit-тесты для `CountdownTimer` (моковая дата), `AssetHeader`, `InvestButton` стейтов.

Весь код рабочий + с тестами ; echo "DONE"
```

---

### Задача 7 — Whitelist Check + KYC CTA

```text
Ты — Senior Frontend Developer. Web3 UX. Начинай с `/feature-cycle`.

## Рекомендуемые инструменты и скиллы
- @ui-ux-pro-max
- @test-driven-development (ОБЯЗАТЕЛЬНО писать тесты!)
- @systematic-debugging

## Контекст проекта
Whitelist проверяется ON-CHAIN (WhitelistEntry PDA). Если нет PDA → KYC форма. Хук `useWhitelistStatus` готов.

## Задание
1. `Modal.tsx`: Backdrop-blur(20px), scale animation, focus trap.
2. `KycPrompt.tsx`: Inline компонент для Asset page. CTA "Start Verification" ссылается на внешний URL.
3. `WhitelistGate.tsx`: Компонент-обертка. Проверяет Wallet, затем PDA. Показывает Skeleton, KycPrompt, или children (если whitelisted).

## Тестирование
- Тесты для `WhitelistGate` с разными стейтами: (не подключен кошелек, не whitelist, whitelisted, загрузка).

Весь код рабочий, покрыт тестами ; echo "DONE"
```

---

### Задача 8 — Invest Flow

```text
Ты — Senior Frontend Developer. Solana, Anchor transactions. Начинай с `/feature-cycle`.

## Рекомендуемые инструменты и скиллы
- @vercel-composition-patterns
- @test-driven-development (ОБЯЗАТЕЛЬНО писать тесты!)
- @systematic-debugging

## Контекст проекта
Инвестор отправляет tx. Client-side preflight валидация (balance, min/max, per-investor cap, status).

## Задание
1. `InvestModal.tsx`: Ввод SOL, реалтайм "You will receive X tokens", валидация.
2. `useInvest.tsx` hook: Состояния (idle, preflight, awaiting_wallet, confirming, success, error).
3. `errors.ts`: Декодер ошибок Anchor в i18n строки.
4. Обнови InvestModal, чтобы отображать все стадии транзакции.

## Тестирование
- Тесты для `InvestModal` (валидация инпутов, disable кнопки).
- Тесты для `useInvest` хука (переходы состояний, обработка фейловых транзакций).

Весь код с тестами ; echo "DONE"
```

---

### Задача 9 — TX Confirmation Feedback

```text
Ты — Senior Frontend Developer. Web3 UX. Начинай с `/feature-cycle`.

## Рекомендуемые инструменты и скиллы
- @ui-ux-pro-max
- @test-driven-development (ОБЯЗАТЕЛЬНО писать тесты!)

## Контекст проекта
Unified система обратной связи для транзакций на Solana.

## Задание
1. `Toast.tsx` / `ToastProvider.tsx`: Верхний центр, slide down, Apple feel, авто-закрытие 5c, варианты (success, error, info), clickable explorer link.
2. `TransactionStatus.tsx`: Inline фидбэк для модалок. (spinners, checkmarks).
3. `useTransactionConfirmation.ts`: Поллинг `connection.confirmTransaction`.
4. Интегрируй в Invest Flow.

## Тестирование
- Тест контекста тостов и их рендера, тест `TransactionStatus` визуальных состояний.

Весь код покрыт тестами ; echo "DONE"
```

---

### Задача 10 — Dashboard + Portfolio

```text
Ты — Senior Frontend Developer. Финтех dashboard. Начинай с `/feature-cycle`.

## Рекомендуемые инструменты и скиллы
- @ui-ux-pro-max
- @frontend-design
- @test-driven-development (ОБЯЗАТЕЛЬНО писать тесты!)

## Контекст проекта
Dashboard читает ВСЁ on-chain из хуков.

## Задание
1. `PortfolioSummary.tsx`: Total Value, Tokens Held, Unclaimed Revenue. 
2. `HoldingsTable.tsx`: Asset, Tokens, Value, Status.
3. `RevenuePeriodsCard.tsx`: Список периодов, статус (Claimed/Unclaimed). Расчет claimable доли.
4. `useDashboard.ts`: Собирает метрики из остальных хуков.
5. Страница `/dashboard/page.tsx`: Пустое состояние (No investments), CTA коннекта.

## Тестирование
- Unit-тесты для таблиц, проверка рендеринга пустых и заполненных состояний, тесты математики `useDashboard`.

Весь код рабочий и протестирован ; echo "DONE"
```

---

### Задача 11 — Live Telemetry Widget

```text
Ты — Senior Frontend Developer. Начинай с `/feature-cycle`.

## Рекомендуемые инструменты и скиллы
- @vercel-react-best-practices
- @ui-ux-pro-max
- @test-driven-development (ОБЯЗАТЕЛЬНО писать тесты!)

## Контекст проекта
На Dashboard выводится виджет с API `/telemetry/latest`. Единственный бекенд вызов.

## Задание
1. `TelemetryWidget.tsx`: Статусы (In Service / Maintenance / Inactive). Вывод Daily Revenue, Mileage, Trips.
2. Отработка стейта `stale` и `available: false` (empty state).
3. Интегрируй в `Dashboard` между метриками и payouts.

## Тестирование
- Напиши mock-тесты с помощью MSW или мокая `fetch` для телеметрии (успешный, stale, error состояния).

Код работает + с тестами ; echo "DONE"
```

---

### Задача 12 — Claim Revenue

```text
Ты — Senior Frontend Developer. Solana transactions. Начинай с `/feature-cycle`.

## Рекомендуемые инструменты и скиллы
- @systematic-debugging
- @test-driven-development (ОБЯЗАТЕЛЬНО писать тесты!)

## Контекст проекта
Claim = on-chain tx.

## Задание
1. `useClaim.ts`: Хук отправки `claim_revenue` instruction. Invalidate query cache после success. 
2. `ClaimButton.tsx`: Кнопка клейма с конфирмом, статусами в процессе загрузки.
3. `ClaimAllButton.tsx`: Последовательный claim всех доступных периодов.
4. Внедрить в `RevenuePeriodsCard`.

## Тестирование
- Тесты хука клейма и кнопок состояний, UI тесты на ClaimAll (disable logic).

Сделай рабочим с тестами ; echo "DONE"
```

---

### Задача 13 — RPC Error Handling

```text
Ты — Senior Frontend Developer. Error states, UX. Начинай с `/feature-cycle`.

## Рекомендуемые инструменты и скиллы
- @webapp-testing
- @test-driven-development (ОБЯЗАТЕЛЬНО писать тесты!)

## Контекст проекта
Поскольку все идет из Solana RPC, необходимо gracefully handle ошибки.

## Задание
1. `RpcErrorBoundary.tsx`: Fallback UI с кнопкой Retry.
2. Обнови все on-chain хуки (`useProjectState` и тд) добавив retry, timeout error messages.
3. Оберни ключевые зоны (Catalog, Asset Details, Dashboard) в Error Boundary.
4. Добавь Connection status indicator (green/red dot в Navbar).

## Тестирование
- Протестируй рендеринг `RpcErrorBoundary` и вывод правильного UI при ошибке RPC.

Код рабочий и покрыт тестами ; echo "DONE"
```

---

### Задача 14 — Payout History

```text
Ты — Senior Frontend Developer. Таблицы данных. Начинай с `/feature-cycle`.

## Рекомендуемые инструменты и скиллы
- @vercel-composition-patterns
- @ui-ux-pro-max
- @test-driven-development (ОБЯЗАТЕЛЬНО писать тесты!)

## Контекст проекта
Страница `/payouts` — полная история, чисто on-chain.

## Задание
1. `DataTable.tsx`: Generic sortable таблица, client-side pagination.
2. `PayoutHistoryTable.tsx`: Колонки (Period, Deposited, Share, Claim, Status, TX Link). Sort by descending.
3. Страница `/payouts/page.tsx`: Summary cards (Total Claimed, Unclaimed, Periods) и таблица.

## Тестирование
- Тесты для `DataTable` (сортировка, пагинация). Тесты для `PayoutHistoryTable`.

Все с тестами ; echo "DONE"
```

---

### Задача 15 — Admin Panel

```text
Ты — Senior Frontend Developer. Admin interfaces. Начинай с `/feature-cycle`.

## Рекомендуемые инструменты и скиллы
- @systematic-debugging
- @test-driven-development (ОБЯЗАТЕЛЬНО писать тесты!)

## Контекст проекта
Admin интерфейс = прямые транзакции с админского кошелька. Нет бекенд доступов.

## Задание
1. `useAdminAccess.ts`: Читает Pda, сверяет `admin` === wallet.
2. `AdminGuard.tsx`: Если не совпадает -> Redirect + 'Access Denied'.
3. `AdminMetrics.tsx`: Статус, SOL Raised, Investors.
4. `DepositRevenueForm.tsx`: Форма Revenue/Expenses/Reserve, кнопка Deposit, tx sending.
5. `ProjectControls.tsx`: Pause / Resume / Close (danger state) pills.
6. Внедрить на `/admin/page.tsx`.

## Тестирование
- Тесты `AdminGuard` (допуск/недопуск). Тесты `DepositRevenueForm` на валидацию инпутов. 

Покрой тестами ; echo "DONE"
```

---

### Задача 16 — Mobile Responsive

```text
Ты — Senior Frontend Developer. Responsive, mobile-first. Начинай с `/feature-cycle`.

## Рекомендуемые инструменты и скиллы
- @ui-ux-pro-max
- @frontend-design
- @test-driven-development (Тесты для мобильных вариаций UI!)

## Задание
Проверь и настрой Responsive pass по ВСЕМ страницам.
1. Navbar: Drawer menu для <734px.
2. Catalog: Grid адаптация.
3. Asset Detail: Sticky bottom bar для invest на мобиле.
4. Dashboard & Payouts: Смена layout таблиц на карточки для компактных видов.

## Тестирование
- Отрендери RTL тесты с resize окна или проверь классы.

Код должен корректно работать от 375px до 1068px+ ; echo "DONE"
```

---

### Задача 17 — Security Headers + Sanitization

```text
Ты — Senior Frontend Developer. Web Security. Начинай с `/feature-cycle`.

## Рекомендуемые инструменты и скиллы
- @vercel-react-best-practices
- @systematic-debugging
- @test-driven-development

## Задание
1. `next.config.js`: Настрой CSP, X-Frame-Options, Permissions-Policy заголовки.
2. `src/lib/security/sanitize.ts`: strip HTML, wallet validation, positive sols.
3. Оберни парсинг on-chain стрингов в санитизатор.

## Тестирование
- Тесты для всех утилит безопасности в `sanitize.ts`.

Все проверяется тестами ; echo "DONE"
```

---

### Задача 18 — E2E Testing & Test Coverage

```text
Ты — Senior QA / Frontend Developer. Testing, Vitest, Playwright. Начинай с `/feature-cycle`.

## Рекомендуемые инструменты и скиллы
- @webapp-testing
- @test-driven-development

## Задание
Поскольку тесты писались параллельно с фичами, эта задача — результирующая полировка покрытия:
1. Запусти Coverage отчет. Добейся 80%+ покрытия.
2. Добавь E2E Journey (с использованием Playwright) на основной сценарий: Connect -> Catalog -> Asset -> Валидация модалки покупки.
3. Прогони все unit/component тесты для гарантии отсутствия регрессии.

npm run test ; npm run run:e2e ; echo "DONE"
```

---

### Задача 19 — Staging Deploy + Smoke Test

```text
Ты — Senior Frontend Developer. DevOps, Vercel.

## Задание
1. Проверь `vercel.json` и билды.
2. Сконфигурируй `.env.staging` (RPC, TELEMETRY_API_URL, KYC_URL).
3. Проведи финальный Smoke Test по `SMOKE_TEST.md`.
4. Напиши `ONBOARDING.md` для инвесторов.

Убедись, что deploy успешен. ; echo "DONE"
```

---

## Заметки

> **Зависимости:**
> - Задачи 1-3 — строго последовательно (УЖЕ ВЫПОЛНЕНЫ)
> - Задача 8 — зависит от IDL (Dev B). Без IDL invest instruction — заглушка.
> - Задача 11 — зависит от GET `/telemetry/latest` (Dev C).
> - Задача 15 — admin instructions нужны от Dev B.

> **Как обновлять статус:** Находишь себя в этом файле и меняешь ⬜ на ✅ в таблице `Общий статус`. ВЕСЬ НОВЫЙ КОД должен сопровождаться Unit/Component тестами!
