# Frontend — Очередь задач и промпты (v2)

> **Как пользоваться:** Открываешь новую вкладку AI-чата → копируешь нужный промпт целиком → вставляешь → работаешь.
> Каждый промпт самодостаточный и содержит весь необходимый контекст.

> **Архитектура v2:** Вся бизнес-логика и состояние — on-chain. Frontend читает PDAs напрямую из Solana RPC. Единственный backend-вызов — `GET /telemetry/latest/:project_id` (данные Yandex Pro). Нет JWT, нет сессий, нет БД.

---

## Общий статус

| # | Задача | Фаза | US | Статус |
|---|--------|------|----|--------|
| 1 | Scaffold Next.js + RPC Client | Phase 1 | — | ⬜ |
| 2 | Wallet Adapter + Layout Shell | Phase 1 | US-F01 | ⬜ |
| 3 | On-chain Client Layer + Types | Phase 1 | — | ⬜ |
| 4 | Каталог автомобилей | Phase 2 | US-F03 | ⬜ |
| 5 | Страница актива | Phase 2 | US-F04 | ⬜ |
| 6 | Whitelist Check + KYC CTA | Phase 2 | US-F02 | ⬜ |
| 7 | Invest Flow | Phase 3 | US-F05 | ⬜ |
| 8 | TX Confirmation Feedback | Phase 3 | US-F06 | ⬜ |
| 9 | Dashboard + Portfolio | Phase 3 | US-F07 | ⬜ |
| 10 | Live Telemetry Widget | Phase 3 | US-F07b | ⬜ |
| 11 | Claim Revenue | Phase 3 | US-F08 | ⬜ |
| 12 | RPC Error Handling | Phase 3 | US-F12 | ⬜ |
| 13 | Payout History | Phase 4 | US-F09 | ⬜ |
| 14 | Admin Panel | Phase 4 | US-F10 | ⬜ |
| 15 | Mobile Responsive | Phase 4 | US-F11 | ⬜ |
| 16 | Security Headers + Sanitization | Phase 5 | US-F13 | ⬜ |
| 17 | Component Tests | Phase 5 | — | ⬜ |
| 18 | Staging Deploy + Smoke Test | Phase 6 | — | ⬜ |

---

## Дизайн-контекст (вставлять НЕ НУЖНО — он уже в каждом промпте)

Каждый промпт содержит блок `## Дизайн` со следующими ключевыми принципами:
- Apple-like минимализм, light theme по умолчанию
- Primary: Cyan `#06B6D4`, text: `#1D1D1F`, secondary bg: `#F5F5F7`
- Pill кнопки (980px radius), Inter font, 17px body, минимальные тени
- Полная дизайн-система в `frontend/DESIGN_SYSTEM.md` и `frontend/design-tokens.json`

---

## Phase 1: Foundation

---

### Задача 1 — Scaffold Next.js + RPC Client

```
Ты — Senior Frontend Developer, специализирующийся на Next.js и Solana Web3.

## Контекст проекта
AXEL — платформа токенизации реальных активов (RWA) на Solana. Инвесторы покупают Token-2022 токены, представляющие доли в автомобиле такси, получают доход от эксплуатации и делают claim через блокчейн.

КЛЮЧЕВАЯ АРХИТЕКТУРА: Весь стейт живёт on-chain. Frontend читает данные НАПРЯМУЮ из Solana через RPC (PDAs). Единственный backend-вызов — GET /telemetry/latest/:project_id (данные Yandex Pro). Нет JWT, нет сессий, нет базы данных.

## Задание
Инициализируй Next.js проект со следующим стеком:

### Техстек:
- Next.js 14+ (App Router)
- TypeScript (strict mode)
- Tailwind CSS v3
- ESLint + Prettier

### Структура папок:
```
src/
├── app/                    # App Router pages
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Landing / Catalog
│   ├── assets/
│   │   └── [id]/
│   │       └── page.tsx    # Asset detail
│   ├── dashboard/
│   │   └── page.tsx        # Investor dashboard
│   ├── payouts/
│   │   └── page.tsx        # Payout history
│   └── admin/
│       └── page.tsx        # Admin panel
├── components/
│   ├── ui/                 # Button, Card, Badge, Modal, ProgressBar, Skeleton, Toast
│   ├── layout/             # Navbar, Footer
│   ├── wallet/             # Wallet-specific UI
│   ├── catalog/            # AssetCard
│   ├── asset/              # AssetHeader, FundingProgress, InvestButton
│   ├── invest/             # InvestModal
│   ├── dashboard/          # PortfolioSummary, HoldingsTable, TelemetryWidget, ClaimButton
│   ├── payouts/            # PayoutHistoryTable
│   └── admin/              # AdminGuard, AdminMetrics, DepositRevenueForm
├── hooks/                  # Custom React hooks
├── lib/
│   ├── solana/             # RPC helpers, PDA derivation, instruction builders
│   └── api/                # Telemetry API client (единственный backend call)
├── types/                  # TypeScript interfaces
├── providers/              # WalletProvider, QueryProvider, ToastProvider
└── styles/                 # Global styles
```

### Требования:
1. `.env.local.example`:
   - NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
   - NEXT_PUBLIC_SOLANA_NETWORK=devnet
   - NEXT_PUBLIC_PROGRAM_ID=<program_id_after_deploy>
   - NEXT_PUBLIC_TELEMETRY_API_URL=http://localhost:3001
2. `tsconfig.json` с path aliases (@/components, @/hooks, @/lib, etc.)
3. Tailwind с палитрой из дизайн-системы:
   - Light theme по умолчанию (bg: #FFFFFF, text: #1D1D1F, secondary bg: #F5F5F7)
   - Primary: Cyan #06B6D4 (hover: #0891B2)
   - Semantic: success #34C759, warning #FF9F0A, error #FF3B30, info #007AFF
   - Apple-like neutrals: border #D2D2D7, secondary text #6E6E73, tertiary #86868B
   - Border radius: pill (980px) для кнопок, 18px для карточек, 12px для inputs
   - Font: Inter (17px body default)
4. Создай `src/lib/solana/connection.ts`:
   - Экспортирует Connection с endpoint из env и commitment 'confirmed'
   - Helper для error wrapping (RPC errors → user-friendly messages)
5. Каждая страница — заглушка с заголовком
6. НЕ устанавливай wallet adapter пока — это задача 2

Проверь что `npm run dev` работает ; echo "DONE"
```

---

### Задача 2 — Wallet Adapter + Layout Shell

```
Ты — Senior Frontend Developer, Solana Web3 + Next.js.

## Контекст проекта
AXEL — RWA токенизация такси на Solana. On-chain first: весь стейт в PDAs, frontend читает напрямую через RPC. Нет backend для данных.
Проект инициализирован: Next.js 14, TypeScript, Tailwind. Структура: src/app/, src/components/, src/lib/solana/.

## Дизайн
Apple-like минимализм. Полная система в файле `frontend/DESIGN_SYSTEM.md`.
- Light theme: bg #FFFFFF, text #1D1D1F, secondary bg #F5F5F7, border #D2D2D7
- Primary: Cyan #06B6D4 (единственный акцентный цвет)
- Font: Inter (17px body, -0.022em tracking)
- Pill кнопки (border-radius: 980px), weight 400
- Navbar: 52px height, frosted glass (backdrop-blur 20px, saturate 180%, opacity 0.72)

## Задание

### 1. Установи зависимости:
- @solana/web3.js
- @solana/wallet-adapter-base
- @solana/wallet-adapter-react
- @solana/wallet-adapter-react-ui
- @solana/wallet-adapter-wallets (Phantom, Backpack)

### 2. WalletProvider (`src/providers/WalletProvider.tsx`):
- Подключение к devnet (из env NEXT_PUBLIC_SOLANA_RPC_URL)
- Поддержка Phantom и Backpack
- Обёрнутый в ConnectionProvider и WalletProvider
- autoConnect: true

### 3. Navbar (`src/components/layout/Navbar.tsx`):
- Apple-style: 52px height, sticky top-0
- Frosted glass: bg rgba(255,255,255,0.72), backdrop-blur(20px), saturate(180%)
- Тончайшая border-bottom: 0.5px solid #D2D2D7 (видна при скролле через scroll listener)
- Слева: "AXEL" (Inter, weight 600, 21px, color #1D1D1F, без логотипа)
- Центр: Catalog · Dashboard · Payouts (12px uppercase, letter-spacing 0.08em, weight 400, color #6E6E73, hover: #1D1D1F)
- Справа: wallet chip
  - Не подключен: "Connect" как cyan text link
  - Подключен: pill chip (#F5F5F7 bg) с truncated address (Axx…xxB, JetBrains Mono 14px) + SOL balance
  - Click на chip → dropdown: Full address (copyable) + Disconnect
- Если кошелёк не установлен: "Install Phantom" link → phantom.app
- Mobile: hamburger → slide-in drawer

### 4. Footer (`src/components/layout/Footer.tsx`):
- "Built on Solana" текст, color #86868B, 13px weight 400
- Ссылки: Solana Explorer, docs (заглушка)

### 5. Root Layout (`src/app/layout.tsx`):
- Обернуть в WalletProvider
- Подключить Inter font через Google Fonts
- Light theme (bg: #FFFFFF)
- Navbar + main (min-height calc) + Footer

### 6. Хук `useWalletInfo` (`src/hooks/useWalletInfo.ts`):
- Возвращает: connected, publicKey, balance (SOL), truncatedAddress (4+4)
- Подтягивает баланс через connection.getBalance()
- Refetch при подключении/отключении

Проверь что npm run dev работает и кошелёк подключается ; echo "DONE"
Весь код полностью рабочий, без плейсхолдеров.
```

---

### Задача 3 — On-chain Client Layer + Types

```
Ты — Senior Frontend Developer, TypeScript, Solana Anchor.

## Контекст проекта
AXEL — RWA токенизация на Solana. Весь стейт on-chain в PDAs. Frontend читает напрямую через RPC.
Стек: Next.js 14, TypeScript, Tailwind, Wallet Adapter (уже подключен).
Единственный backend endpoint: GET /telemetry/latest/:project_id

## On-chain PDAs (структуры которые фронтенд будет читать):
- ProjectState — параметры проекта, статус, суммы, admin pubkey
- InvestorRecord — sol_invested, tokens_minted per investor
- RevenuePeriod — total_deposited, token_supply_snapshot, period_label
- ClaimRecord — факт claim за конкретный период + wallet
- WhitelistEntry — approved: boolean для кошелька
- TelemetryRecord — data_hash, oracle_signature, solana_tx_signature

## Задание

### 1. TypeScript типы (`src/types/`):

#### `src/types/project.ts`:
```ts
export type ProjectStatus = 'initializing' | 'fundraising' | 'finalized' | 'active' | 'paused' | 'closed';

export interface ProjectState {
  admin: string;           // pubkey
  mint: string;            // Token-2022 mint pubkey
  escrowVault: string;     // SOL vault
  revenueVault: string;    // revenue vault
  status: ProjectStatus;
  totalTokenSupply: number;
  tokensRemaining: number;
  pricePerToken: number;   // lamports
  minInvestment: number;   // lamports
  maxInvestment: number;   // lamports
  solRaised: number;       // lamports
  minRaise: number;        // lamports
  maxRaise: number;        // lamports
  deadline: number;        // unix timestamp
  investorCount: number;
  // Token metadata (from Token-2022 extension)
  carMake: string;
  carModel: string;
  carYear: number;
  vin: string;
  licensePlate: string;
  imageUrl: string;
}
```

#### `src/types/investor.ts`:
```ts
export interface InvestorRecord {
  wallet: string;
  projectPda: string;
  solInvested: number;    // lamports
  tokensMinted: number;
}
```

#### `src/types/revenue.ts`:
```ts
export interface RevenuePeriod {
  index: number;
  projectPda: string;
  periodLabel: string;
  totalDeposited: number;   // lamports
  tokenSupplySnapshot: number;
  depositTxSignature: string;
  createdAt: number;        // unix timestamp
}

export interface ClaimRecord {
  wallet: string;
  periodIndex: number;
  amountClaimed: number;    // lamports
  claimTxSignature: string;
  claimedAt: number;        // unix timestamp
}
```

#### `src/types/whitelist.ts`:
```ts
export interface WhitelistEntry {
  wallet: string;
  approved: boolean;
}
```

#### `src/types/telemetry.ts`:
```ts
export interface TelemetryData {
  projectId: string;
  date: string;             // ISO date
  dailyRevenue: number;     // тенге
  mileageKm: number;
  tripsCount: number;
  carStatus: 'active' | 'maintenance' | 'inactive';
  dataHash: string;
  oracleSignature: string;
  solanaTxSignature: string;
  stale: boolean;
  available: boolean;
}
```

### 2. PDA Derivation (`src/lib/solana/pda.ts`):
- deriveProjectState(programId, projectSeed) → PDA
- deriveInvestorRecord(programId, projectPda, walletPubkey) → PDA
- deriveWhitelistEntry(programId, projectPda, walletPubkey) → PDA
- deriveRevenuePeriod(programId, projectPda, periodIndex) → PDA
- deriveClaimRecord(programId, periodPda, walletPubkey) → PDA
- Каждая функция использует PublicKey.findProgramAddressSync с правильными seeds
- ВАЖНО: seeds пока заглушки (TODO комментарий) — реальные seeds придут от Dev B

### 3. On-chain читалки (`src/lib/solana/readers.ts`):
- fetchProjectState(connection, projectPda) → ProjectState | null
- fetchInvestorRecord(connection, pda) → InvestorRecord | null
- fetchWhitelistEntry(connection, pda) → WhitelistEntry | null
- fetchAllRevenuePeriods(connection, programId, projectPda) → RevenuePeriod[]
- fetchClaimRecord(connection, pda) → ClaimRecord | null
- fetchAllClaimRecords(connection, programId, wallet) → ClaimRecord[]
- Все функции: обрабатывают null (account not found), ошибки RPC, десериализацию
- ВАЖНО: десериализация пока заглушка (TODO) — реальный layout придёт с IDL от Dev B
- Пока возвращают mock data для разработки UI

### 4. Instruction builders (`src/lib/solana/instructions.ts`):
- buildInvestInstruction(params) → TransactionInstruction
- buildClaimRevenueInstruction(params) → TransactionInstruction
- buildDepositRevenueInstruction(params) → TransactionInstruction (admin)
- buildPauseProjectInstruction(params) → TransactionInstruction (admin)
- Все — заглушки с TODO комментарием, возвращают placeholder TransactionInstruction
- Реальные инструкции будут построены когда IDL доступен

### 5. Telemetry API client (`src/lib/api/telemetry.ts`):
- fetchLatestTelemetry(projectId: string) → TelemetryData
- Base URL из env NEXT_PUBLIC_TELEMETRY_API_URL
- Error handling: timeout, network error → fallback { available: false }

### 6. React Query hooks (`src/hooks/`):
- Установи @tanstack/react-query
- Создай QueryProvider в providers/
- useProjectState(projectPda) — reads ProjectState PDA
- useInvestorRecord(projectPda, wallet) — reads InvestorRecord PDA
- useWhitelistStatus(projectPda, wallet) — reads WhitelistEntry PDA
- useRevenuePeriods(projectPda) — reads all RevenuePeriod PDAs
- useClaimRecords(wallet) — reads all ClaimRecord PDAs
- useTelemetry(projectId) — calls GET /telemetry/latest
- Все с правильным staleTime (10s для on-chain, 60s для telemetry), enabled условиями

### 7. Mock data (`src/lib/mock-data.ts`):
- 3 проекта разных статусов (fundraising, active, closed)
- 2 investorRecord
- 5 revenuePeriods (3 claimed, 2 unclaimed)
- 1 telemetry record
- Хуки используют mock когда RPC недоступен

Весь код рабочий, без плейсхолдеров. Экспорты через index.ts файлы.
```

---

## Phase 2: Catalog + Asset Pages

---

### Задача 4 — Каталог автомобилей (US-F03)

```
Ты — Senior Frontend Developer, UI/UX, финтех.

## Контекст проекта
AXEL — RWA токенизация на Solana. On-chain first.
Стек: Next.js 14, TypeScript, Tailwind, React Query, Wallet Adapter.
Данные каталога: читаются из ProjectState PDAs через getProgramAccounts (без backend).
Хук useProjectState() уже есть. Типы в src/types/project.ts. Mock data в src/lib/mock-data.ts.

## Дизайн
Apple-like минимализм. Light theme: bg #FFFFFF, secondary #F5F5F7, text #1D1D1F, primary #06B6D4.
Pill кнопки. Minimal shadows. Inter font (17px body). Подробности: frontend/DESIGN_SYSTEM.md

## Задание
Реализуй главную страницу каталога (`src/app/page.tsx`).

### UI компоненты:

#### Badge (`src/components/ui/Badge.tsx`):
- Pill shape (border-radius: 980px), padding 4px 10px, font 12px weight 500
- fundraising: bg rgba(255,159,10,0.10), text #FF9F0A, пульсирующая точка ●
- active: bg rgba(52,199,89,0.10), text #34C759
- paused: bg rgba(255,159,10,0.10), text #FF9F0A (без точки)
- closed: bg rgba(110,110,115,0.10), text #6E6E73

#### ProgressBar (`src/components/ui/ProgressBar.tsx`):
- Track: #E8E8ED, 6px height, pill shape
- Fill: solid #06B6D4 (без градиента)
- Animation: width 800ms ease-out
- Label под баром: "XX% funded" (13px, #6E6E73)

#### Card (`src/components/ui/Card.tsx`):
- bg #FFFFFF, border-radius 18px
- На белом фоне: border 1px solid #E8E8ED
- На сером (#F5F5F7): без border
- Hover: box-shadow 0 2px 8px rgba(0,0,0,0.04), transition 250ms
- НЕ translateY, НЕ glow

#### Skeleton (`src/components/ui/Skeleton.tsx`):
- bg #E8E8ED, shimmer animation 1.5s infinite

#### AssetCard (`src/components/catalog/AssetCard.tsx`):
- Принимает: ProjectState
- Placeholder фото (светло-серый #F5F5F7 bg, иконка Car из lucide-react)
- Марка / Модель / Год (Title 3: 19px, weight 600)
- Status Badge (pill)
- ProgressBar (sol_raised / max_raise * 100)
- Цена за токен в SOL (JetBrains Mono для числа)
- Hover: мягкая тень
- Клик → /assets/[id]

#### Страница каталога (`src/app/page.tsx`):
- Hero: белый фон, "Invest in Real-World Assets" (Display Large: 56px, weight 700, tracking -0.005em, color #1D1D1F), подзаголовок 21px weight 400 #6E6E73 ("Tokenized taxi assets on Solana. Transparent. On-chain."), pill CTA "Explore Assets" (cyan fill, white text)
- Каталог секция: на #F5F5F7 bg, белые карточки. Grid: 1 col < 734px, 2 col < 1068px, 3 col 1068px+
- Фильтр: pill chips (All | Fundraising | Active | Closed). Активный = cyan fill, остальные = ghost
- Loading: grid скелетонов
- Empty: "No assets available yet" (Headline 28px) + subtext #6E6E73
- Fade-in одной анимацией (opacity 0→1, 300ms)
- Max-width: 980px

Весь код рабочий. Используй mock data. npm run dev должен показать страницу ; echo "DONE"
```

---

### Задача 5 — Страница актива (US-F04)

```
Ты — Senior Frontend Developer. Финтех, Web3.

## Контекст проекта
AXEL — RWA на Solana. On-chain first. Данные читаются из ProjectState PDA + Token-2022 TokenMetadata extension.
Стек: Next.js 14, TypeScript, Tailwind, React Query, Wallet Adapter.
Каталог готов, карточки кликают на /assets/[id]. Хуки useProjectState(), useWhitelistStatus() готовы.

## Дизайн
Apple минимализм. Light theme. Primary #06B6D4. Подробности: frontend/DESIGN_SYSTEM.md
Все числа SOL — JetBrains Mono. Labels — #6E6E73. Values — #1D1D1F. Dividers — #E8E8ED.

## Задание
Реализуй `src/app/assets/[id]/page.tsx`.

### Компоненты:

#### CountdownTimer (`src/components/ui/CountdownTimer.tsx`):
- deadline (unix timestamp) → DD:HH:MM:SS (JetBrains Mono)
- Обновление каждую секунду
- < 24h: цвет #FF3B30. Expired: текст "Expired"

#### AddressLink (`src/components/ui/AddressLink.tsx`):
- Truncated address (JetBrains Mono 14px), цвет #06B6D4
- Иконка ↗ (ExternalLink, 12px). Клик → Solana Explorer (devnet)

#### AssetHeader (`src/components/asset/AssetHeader.tsx`):
- Фото (border-radius 18px, placeholder: #F5F5F7 bg + иконка)
- Марка/Модель/Год (Headline 28px) + Badge (pill)
- VIN, License Plate (Subheadline 15px, #6E6E73)

#### FundingProgress (`src/components/asset/FundingProgress.tsx`):
- ProgressBar: solRaised / maxRaise
- "XXX / YYY SOL raised" (JetBrains Mono) + "ZZ tokens remaining"
- CountdownTimer до deadline

#### InvestmentDetails (`src/components/asset/InvestmentDetails.tsx`):
- Key-value table: label #6E6E73, value #1D1D1F
- Price per token, Min/Max investment, Total/Remaining tokens
- Dividers: 1px #E8E8ED
- On-chain addresses: mint + program (AddressLink)

#### RevenueProjection (`src/components/asset/RevenueProjection.tsx`):
- Формула: Revenue − Expenses − Reserve = Profit
- Horizontal bars (CSS): fill #06B6D4, bg #F5F5F7

#### InvestButton (`src/components/asset/InvestButton.tsx`):
- Pill (980px). Weight 400 (как Apple!)
- Не подключен: "Connect Wallet" (secondary — text cyan)
- Не whitelisted: "Complete KYC to Invest" (secondary) — клик → внешняя Sumsub форма (заглушка URL)
- Whitelisted: "Invest Now" (primary — cyan fill, white text)
- Дизайн: min-height 44px

#### Страница:
- Desktop: 2 колонки (60% content / 40% invest panel, sticky)
- Mobile: одна колонка, invest panel = sticky bottom bar
- Loading: skeleton. 404: "Asset not found" (Headline)
- Max-width: 980px

Весь код рабочий. Mock data ; echo "DONE"
```

---

### Задача 6 — Whitelist Check + KYC CTA (US-F02)

```
Ты — Senior Frontend Developer. Web3 UX.

## Контекст проекта
AXEL — RWA на Solana. Whitelist проверяется ON-CHAIN: читаем WhitelistEntry PDA для кошелька.
Если PDA существует и approved === true → можно инвестировать.
Если PDA не существует → показать ссылку на Sumsub KYC форму (внешний URL).
Нет backend вызова для whitelist — только getAccountInfo на PDA.

Хук useWhitelistStatus(projectPda, wallet) уже готов. InvestButton уже проверяет статус.

## Дизайн
Apple минимализм. Pill кнопки. Primary #06B6D4. frontend/DESIGN_SYSTEM.md

## Задание

### 1. Modal (`src/components/ui/Modal.tsx`):
- Backdrop: rgba(0,0,0,0.4), backdrop-blur(20px)
- Content: bg #FFFFFF, border-radius 22px, padding 32px, shadow-xl
- Animation: scale(0.97→1) + opacity, 250ms ease
- Close: Escape + backdrop click
- Focus trap. Max-width: 480px

### 2. KycPrompt (`src/components/wallet/KycPrompt.tsx`):
- НЕ модалка а inline component (встраивается на страницу актива вместо invest кнопки)
- Заголовок: "Verification Required" (Title 2: 21px, #1D1D1F)
- Текст: "To invest, complete identity verification through our KYC partner." (#6E6E73, 17px)
- Кнопка: "Start Verification →" (pill, cyan fill) — ведёт на внешний Sumsub URL (env: NEXT_PUBLIC_KYC_URL, пока заглушка)
- Статусы:
  - PDA не существует: показать KYC CTA
  - PDA exist, approved: false: "Verification in progress..." с subtle spinner
  - PDA exist, approved: true: не показывать (рендерить InvestButton)

### 3. WhitelistGate (`src/components/wallet/WhitelistGate.tsx`):
- Wrapper компонент. Принимает children.
- Не подключен: "Connect your wallet to continue" (centered text + Connect pill button)
- Whitelist check loading: subtle skeleton
- Not whitelisted: KycPrompt
- Whitelisted: рендерит children
- Re-check на каждый page focus (window focus event → refetch hook)

### 4. Обнови InvestButton:
- Обернуть в WhitelistGate
- Статус обновляется без reload

Весь код рабочий, без плейсхолдеров ; echo "DONE"
```

---

## Phase 3: Investment + Dashboard

---

### Задача 7 — Invest Flow (US-F05)

```
Ты — Senior Frontend Developer. Solana, Anchor transactions.

## Контекст проекта
AXEL — RWA на Solana. Инвестор отправляет invest instruction напрямую on-chain (без backend pre-validation!).
Client-side preflight: все проверки читаются из on-chain PDAs.
Anchor instruction: `invest` — принимает SOL, создаёт/обновляет InvestorRecord PDA.

## Всё что нужно проверить client-side (из on-chain):
- Wallet SOL balance >= amount + estimated fee (~0.01 SOL)
- amount >= ProjectState.minInvestment
- amount <= ProjectState.maxInvestment
- InvestorRecord.solInvested + amount <= per-investor cap
- ProjectState.status === 'fundraising' && deadline не прошёл

## Дизайн
Apple минимализм. Pill buttons (980px), weight 400. frontend/DESIGN_SYSTEM.md

## Задание

### 1. InvestModal (`src/components/invest/InvestModal.tsx`):
- Открывается по клику на "Invest Now"
- Modal (border-radius 22px, max-width 480px)
- SOL input (type number, font-size 17px, border-radius 12px)
- Реальтайм: "You will receive X tokens" (tokens = floor(amount / pricePerToken))
- Inline валидация под полем:
  - "Minimum investment is X SOL"
  - "Maximum investment is X SOL"
  - "Insufficient balance (you have X SOL)"
  - "Per-investor cap reached"
  - "Fundraising is closed"
- Кнопка "Invest" — pill, cyan, disabled до валидации
- Summary перед подтверждением: SOL amount, token count, estimated fee

### 2. useInvest (`src/hooks/useInvest.ts`):
- Состояния: idle → preflight → awaiting_wallet → confirming → success → error
- Логика:
  1. Client-side preflight (on-chain reads через хуки)
  2. Построить Anchor invest instruction (из src/lib/solana/instructions.ts — заглушка)
  3. Отправить через wallet.sendTransaction
  4. connection.confirmTransaction (confirmed commitment)
  5. Вернуть txSignature
- На каждом этапе — обновление состояния

### 3. Error decoder (`src/lib/solana/errors.ts`):
- Маппинг Anchor error codes в читаемые сообщения:
  - "Your wallet is not whitelisted. Please complete KYC."
  - "Investment exceeds maximum per investor."
  - "Fundraising period has ended."
  - "Insufficient tokens remaining."
  - etc.
- fallback: "Transaction failed. Please try again."

### 4. InvestModal — показывать этапы:
- Preflight: text status
- Awaiting: "Approve in your wallet..." (subtle spinner)
- Confirming: "Confirming on Solana..." (spinner + tx link)
- Success: "Investment confirmed!" (✓) + tx Explorer link + "View Dashboard" link
- Error: decoded message + "Try again" button

Весь код рабочий ; echo "DONE"
```

---

### Задача 8 — TX Confirmation Feedback (US-F06)

```
Ты — Senior Frontend Developer. Web3 UX.

## Контекст
AXEL — Next.js 14 на Solana. Invest и Claim отправляют on-chain tx. Нужна unified feedback-система.

## Дизайн
Apple notifications style. Toasts: top center (не top-right). Slide down, spring easing.
Primary #06B6D4. Success #34C759. Error #FF3B30. frontend/DESIGN_SYSTEM.md

## Задание

### 1. Toast + ToastProvider (`src/components/ui/Toast.tsx`, `src/providers/ToastProvider.tsx`):
- Position: fixed top center
- Slide down + fade, 350ms spring (cubic-bezier 0.25, 1, 0.5, 1)
- Border-radius: 14px, shadow-md, left accent 4px solid [semantic color]
- Variants: success (#34C759), error (#FF3B30), info (#007AFF)
- Dismiss (×), auto-dismiss 5s
- Clickable → Solana Explorer (если txSignature передан)
- Stack вниз (последний сверху)
- useToast() → { showToast(type, message, txSignature?) }

### 2. TransactionStatus (`src/components/ui/TransactionStatus.tsx`):
- Inline компонент (встраивается в modals)
- idle: ничего
- submitting: spinner + "Approve in wallet..."
- confirming: spinner + "Confirming on Solana..." + tx link (truncated, cyan)
- confirmed: ✓ + "Confirmed" + full tx link
- error: subtle red text + decoded message + "Try again" link
- Transitions: opacity, 250ms

### 3. useTransactionConfirmation (`src/hooks/useTransactionConfirmation.ts`):
- Принимает: txSignature
- Polls connection.confirmTransaction (confirmed commitment)
- Timeout: 60s → "Transaction may have failed — check Explorer"
- Возвращает: status, confirmationTime

### 4. Интеграция:
- ToastProvider в root layout
- Success invest → green toast с tx link
- Error → red toast с decoded error
- TransactionStatus внутри InvestModal

Весь код рабочий ; echo "DONE"
```

---

### Задача 9 — Dashboard + Portfolio (US-F07)

```
Ты — Senior Frontend Developer. Финтех dashboard.

## Контекст
AXEL — RWA на Solana. Dashboard читает ВСЁ on-chain:
- InvestorRecord PDA → SOL invested, tokens minted
- Token account balance → current tokens held
- RevenuePeriod PDAs → all revenue periods
- ClaimRecord PDAs → which periods already claimed
Единственный backend call: GET /telemetry/latest (задача 10, пока заглушка)

## Дизайн
Apple минимализм. Light theme. Метрики: крупные числа (Headline 28px, JetBrains Mono), labels мелко (#6E6E73).
White cards на #F5F5F7 bg. Pill badges. frontend/DESIGN_SYSTEM.md

## Задание

### PortfolioSummary (`src/components/dashboard/PortfolioSummary.tsx`):
- 3 metric cards на #F5F5F7 bg:
  - Total Value (SOL, JetBrains Mono, Headline 28px)
  - Tokens Held (количество)
  - Unclaimed Revenue (SOL к получению)
- Каждая: число крупно, label 13px #6E6E73, иконка lucide 20px
- Cards: white, border-radius 18px, subtle shadow

### HoldingsTable (`src/components/dashboard/HoldingsTable.tsx`):
- Колонки: Asset, Tokens, Value (SOL), Status (badge), Actions
- Actions: "View" (cyan link) → /assets/[id]
- Mobile: card layout
- Dividers: 1px #E8E8ED

### RevenuePeriodsCard (`src/components/dashboard/RevenuePeriodsCard.tsx`):
- Список периодов из on-chain PDAs:
  - Period label, total deposited, my share (calculated), status
  - Claimed ✓ (#34C759) / Unclaimed (с Claim pill button, задача 11)
  - Claimable = (my_tokens / period.supply_snapshot) × period.total_deposited
- Empty: "No revenue periods yet"

### useDashboard (`src/hooks/useDashboard.ts`):
- Собирает: useInvestorRecord + token balance + useRevenuePeriods + useClaimRecords
- Вычисляет: totalValue, unclaimedRevenue
- Возвращает: holdings, metrics, periods with claim status

### Страница `/dashboard/page.tsx`:
- Не подключен: CTA по центру — "Connect your wallet" (Display Small 40px) + pill button
- Loading: skeleton
- Empty: "No investments yet" + cyan link на каталог
- Title: "Dashboard" (Headline 28px)
- PortfolioSummary + HoldingsTable + RevenuePeriodsCard
- Max-width: 980px

Mock data. Весь код рабочий ; echo "DONE"
```

---

### Задача 10 — Live Telemetry Widget (US-F07b)

```
Ту — Senior Frontend Developer.

## Контекст
AXEL — RWA такси на Solana. Инвесторы видят живую статистику работы автомобиля.
Данные: GET /telemetry/latest/:project_id → TelemetryData.
Это ЕДИНСТВЕННЫЙ backend call во всём приложении. Всё остальное on-chain.

Тип TelemetryData (уже в src/types/telemetry.ts):
{ dailyRevenue (тенге), mileageKm, tripsCount, carStatus, solanaTxSignature, stale, available }

## Дизайн
Apple минимализм. frontend/DESIGN_SYSTEM.md

## Задание

### TelemetryWidget (`src/components/dashboard/TelemetryWidget.tsx`):
- Встраивается на Dashboard между PortfolioSummary и RevenuePeriodsCard
- Заголовок: "Today's Activity" (Title 2: 21px)
- Карточка (white, 18px radius):
  - Car status badge (pill):
    - "In Service" — success green (#34C759)
    - "Maintenance" — warning amber (#FF9F0A)
    - "Inactive" — error red (#FF3B30)
  - Метрики в ряд (3 columns):
    - Revenue: "12 400 ₸" (JetBrains Mono, Title 1: 24px, bold)
    - Mileage: "187 km" (JetBrains Mono)
    - Trips: "14 trips" (JetBrains Mono)
  - Footer: "Verified on Solana ✓" — cyan link → Solana Explorer для solanaTxSignature
- stale === true: label "As of yesterday" (#FF9F0A) под метриками
- available === false: "Telemetry data not yet available" (empty state, muted text)
- Loading: skeleton card

### Обнови Dashboard page:
- Добавить TelemetryWidget между PortfolioSummary и RevenuePeriodsCard
- useTelemetry(projectId) hook уже готов

Весь код рабочий ; echo "DONE"
```

---

### Задача 11 — Claim Revenue (US-F08)

```
Ты — Senior Frontend Developer. Solana transactions.

## Контекст
AXEL — RWA на Solana. Claim = on-chain transaction (claim_revenue instruction).
RevenuePeriod PDAs и ClaimRecord PDAs читаются через getProgramAccounts.
Если ClaimRecord PDA для (period, wallet) существует → уже claimed.
Claimable amount = (my_tokens / period.tokenSupplySnapshot) × period.totalDeposited

## Задание

### useClaim (`src/hooks/useClaim.ts`):
- Принимает: periodIndex, projectPda
- States: idle → awaiting_wallet → confirming → success → error
- Логика:
  1. Build claim_revenue instruction (заглушка из instructions.ts)
  2. wallet.sendTransaction
  3. confirmTransaction
  4. Invalidate React Query cache для periods + claims
  5. showToast(success/error)

### ClaimButton (`src/components/dashboard/ClaimButton.tsx`):
- "Claim X.XX SOL" (pill, cyan, weight 400)
- Disabled: already claimed, nothing to claim, tx in progress
- Confirm dialog: "Claim X.XX SOL from [period]?" (Modal)
- During TX: TransactionStatus inline
- After: "Claimed ✓" + date + tx link

### ClaimAllButton (`src/components/dashboard/ClaimAllButton.tsx`):
- "Claim All" — sequential claim of all unclaimed periods
- Progress: "Claiming 2/5..."
- Pill, cyan

### Обнови RevenuePeriodsCard:
- ClaimButton per period
- Status: Unclaimed (cyan button) / Claimed ✓ (green text) / Not Eligible (grey)

Весь код рабочий ; echo "DONE"
```

---

### Задача 12 — RPC Error Handling (US-F12)

```
Ту — Senior Frontend Developer. Error states, UX.

## Контекст
AXEL читает ВСЁ из Solana RPC. RPC может быть медленным, таймаутить, возвращать ошибки.
Каждый getAccountInfo / getProgramAccounts должен gracefully handle errors.

## Задание

### 1. RpcErrorBoundary (`src/components/ui/RpcErrorBoundary.tsx`):
- Wrapper. При RPC error показывает:
  - "Could not load on-chain data"
  - "Check your connection and try again."
  - "Retry" pill button (cyan) → refetch
- Не показывает stale data без loading indicator

### 2. Обнови все on-chain хуки:
- useProjectState, useInvestorRecord, useRevenuePeriods, useClaimRecords, useWhitelistStatus
- Добавь retry: 2, retryDelay: 2000
- error state экспортируется из каждого хука
- При timeout: специальное сообщение "Solana RPC is slow. Retrying..."

### 3. Обнови все страницы:
- Catalog: обернуть data fetch в error state
- Asset Detail: show error + retry
- Dashboard: per-section error boundaries (метрики могут загрузиться даже если periods failed)

### 4. Connection status indicator:
- Маленький dot в navbar: green (connected to RPC) / red (RPC error)
- Tooltip: "Connected to devnet" / "RPC unavailable"

Весь код рабочий ; echo "DONE"
```

---

## Phase 4: Payout History + Admin + Mobile

---

### Задача 13 — Payout History (US-F09)

```
Ты — Senior Frontend Developer. Таблицы данных.

## Контекст
AXEL — RWA на Solana. Payout history = чисто on-chain. Читаем RevenuePeriod PDAs + ClaimRecord PDAs.
Нет backend вызова. useRevenuePeriods() и useClaimRecords() уже готовы.

## Дизайн
Apple минимализм. Light theme. frontend/DESIGN_SYSTEM.md

## Задание

### DataTable (`src/components/ui/DataTable.tsx`):
- Generic таблица. Sortable columns (клик по header). Client-side pagination.
- Mobile: card layout (< 734px)
- Loading: row skeletons. Empty state: пропс
- Dividers: 1px #E8E8ED. Header: #6E6E73 uppercase 12px

### PayoutHistoryTable (`src/components/payouts/PayoutHistoryTable.tsx`):
- Columns: Period | Total Deposited (SOL) | My Share (SOL) | My Claim (SOL) | Status | TX Link
- Status: "Claimed ✓" (green pill) / "Unclaimed" (amber pill + Claim button) / "Not Eligible" (grey pill)
- TX Link: AddressLink (truncated, cyan) → Explorer
- Sort by period index descending

### Страница `/payouts/page.tsx`:
- Title: "Payout History" (Headline 28px)
- Summary cards: Total Claimed | Total Unclaimed | Total Periods
- PayoutHistoryTable
- Wallet not connected: CTA
- Empty: "No revenue periods yet"
- Max-width: 980px

Mock data. Весь код рабочий ; echo "DONE"
```

---

### Задача 14 — Admin Panel (US-F10)

```
Ты — Senior Frontend Developer. Admin interfaces, Solana transactions.

## Контекст
AXEL — RWA на Solana. Admin = wallet address === ProjectState.admin (читается on-chain).
Admin actions = on-chain transactions отправляемые НАПРЯМУЮ из браузера через connected wallet.
НЕТ backend для admin. Все действия — Anchor instructions.

## Дизайн
Apple минимализм. frontend/DESIGN_SYSTEM.md

## Задание

### useAdminAccess (`src/hooks/useAdminAccess.ts`):
- Читает ProjectState PDA, сравнивает admin field с connected wallet
- Возвращает: isAdmin, isLoading, projectState

### AdminGuard (`src/components/admin/AdminGuard.tsx`):
- Не подключен: "Connect admin wallet"
- Подключен, не admin: "Access denied" → redirect через 3s на каталог
- Admin: рендерит children

### AdminMetrics (`src/components/admin/AdminMetrics.tsx`):
- Метрики из on-chain ProjectState:
  - Status (большой badge), SOL Raised, Investor Count, Tokens Issued
- Card layout, white cards, #F5F5F7 bg

### DepositRevenueForm (`src/components/admin/DepositRevenueForm.tsx`):
- Форма (border-radius 18px card):
  - Revenue (SOL) — number input
  - Expenses (SOL)
  - Reserve (SOL)
  - Period Label — text (e.g., "Q1 2026")
  - Calculated: Profit = Revenue - Expenses - Reserve (live, JetBrains Mono, bold)
- Валидация: все > 0, profit >= 0
- "Deposit Revenue" — pill button (cyan)
- На submit: builds deposit_revenue instruction → wallet.sendTransaction → TransactionStatus
- Success: toast + "Period created"

### ProjectControls (`src/components/admin/ProjectControls.tsx`):
- "Pause Project" / "Resume Project" — pills with confirm dialog (Modal)
- "Close Project" — danger pill (#FF3B30) с double-confirmation
- Каждая кнопка → on-chain instruction → TransactionStatus feedback

### Страница `/admin/page.tsx`:
- Обёрнуто в AdminGuard
- AdminMetrics + DepositRevenueForm + ProjectControls
- Max-width: 980px

Весь код рабочий ; echo "DONE"
```

---

### Задача 15 — Mobile Responsive (US-F11)

```
Ты — Senior Frontend Developer. Responsive, mobile-first.

## Контекст
AXEL — Next.js 14, Tailwind. Apple-inspired дизайн. Все страницы готовы.

## Дизайн
Apple breakpoints: Compact < 734px | Medium 734–1068px | Large 1068px+
Touch targets: min 44px. Подробности: frontend/DESIGN_SYSTEM.md

## Задание
Responsive pass по ВСЕМ страницам.

### Navbar:
- < 734px: hamburger → slide-in drawer (backdrop blur)
- Wallet chip: сокращённый (4+4 символа), без SOL balance (видно в drawer)

### Catalog:
- Grid: 1 col / 2 col / 3 col по breakpoints
- Hero: Display text 40px на mobile (вместо 56px)
- Фильтры: horizontal scroll на compact

### Asset Detail:
- < 734px: single column (фото → инфо → invest bar)
- Invest panel: sticky bottom bar на mobile (safe-area-inset-bottom)
- CountdownTimer: уменьшить size

### Dashboard:
- Metrics: 1 col mobile / 3 col desktop
- HoldingsTable: card layout на compact
- TelemetryWidget: stack метрики вертикально на compact

### Payouts:
- DataTable: card layout на compact

### Admin:
- Single column everywhere на compact
- DepositRevenueForm: full-width inputs

Протестируй на 375px, 734px, 1068px ; echo "DONE"
```

---

## Phase 5: Security + Tests

---

### Задача 16 — Security Headers + Sanitization (US-F13)

```
Ту — Senior Frontend Developer. Web Security.

## Контекст
AXEL — Next.js 14, App Router. Единственный connect-src помимо self: Solana RPC + telemetry backend.

## Задание

### 1. Security Headers (`next.config.js` headers):
- CSP: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.devnet.solana.com TELEMETRY_URL; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()

### 2. Sanitization (`src/lib/security/sanitize.ts`):
- sanitizeText(input) — strip HTML, XSS patterns
- validateWalletAddress(address) — Solana base58 format check
- validateSolAmount(amount) — positive number, max precision

### 3. Все on-chain reads:
- Wallet address validated before PDA derivation
- All displayed strings santized (period labels, metadata)

Весь код рабочий ; echo "DONE"
```

---

### Задача 17 — Component Tests

```
Ты — Senior Frontend Developer. Testing, Vitest.

## Контекст
AXEL — Next.js 14, TypeScript. Все компоненты готовы.

## Задание

### 1. Тестовое окружение:
- Vitest + React Testing Library + @testing-library/jest-dom
- vitest.config.ts с path aliases
- Mock: Solana wallet adapter, React Query, RPC connection
- Custom render с providers

### 2. Tests:

#### AssetCard.test.tsx:
- Рендерит данные, правильный badge, клик → /assets/[id], progress bar %

#### InvestModal.test.tsx:
- Валидация min/max, баланса; disabled state; SOL → tokens конвертация

#### PortfolioSummary.test.tsx:
- Рендерит метрики, skeleton, числа

#### ClaimButton.test.tsx:
- Disabled когда claimed; показывает сумму; confirm dialog

#### useInvest.test.ts:
- State transitions, error handling

### 3. E2E Journey (`src/__tests__/e2e-journey.md`):
- Чеклист: connect → catalog → asset → invest → dashboard → telemetry → claim → payouts → admin

npm run test ; echo "DONE"
```

---

## Phase 6: Deploy

---

### Задача 18 — Staging Deploy + Smoke Test

```
Ты — Senior Frontend Developer. DevOps, Vercel.

## Контекст
AXEL — Next.js 14. Всё готово.

## Задание

### 1. vercel.json:
- Build: npm run build
- Env vars: NEXT_PUBLIC_SOLANA_RPC_URL, NEXT_PUBLIC_SOLANA_NETWORK, NEXT_PUBLIC_PROGRAM_ID, NEXT_PUBLIC_TELEMETRY_API_URL, NEXT_PUBLIC_KYC_URL

### 2. .env.staging:
- RPC: https://api.devnet.solana.com
- NETWORK: devnet
- PROGRAM_ID: <from Dev B>
- TELEMETRY_API_URL: <from Dev C staging>
- KYC_URL: <Sumsub form URL>

### 3. SMOKE_TEST.md — чеклист:
- [ ] Wallet connect/disconnect (Phantom, Backpack)
- [ ] Catalog loads from on-chain PDAs
- [ ] Asset detail shows metadata, countdown, progress
- [ ] Whitelist check works (KYC CTA for non-whitelisted)
- [ ] Invest modal validation + tx submission
- [ ] Dashboard: metrics, holdings, telemetry widget
- [ ] Claim button works
- [ ] Payout history loads from on-chain
- [ ] Admin panel: access denied for non-admin, deposit revenue form
- [ ] RPC error handling + retry
- [ ] Mobile 375px — all pages usable
- [ ] Security headers present
- [ ] No console errors

### 4. ONBOARDING.md — гайд для инвестора:
1. Установи Phantom Wallet  2. Получи SOL  3. Подключись к AXEL
4. Пройди KYC (Sumsub)  5. Выбери актив  6. Инвестируй
7. Следи за телеметрией  8. Получай доход через Claim

Весь конфиг рабочий ; echo "DONE"
```

---

## Заметки

> **Зависимости:**
> - Задачи 1-3 — строго последовательно
> - Задачи 4-6 — после Phase 1, параллельно, но 5 лучше после 4
> - Задача 7 — зависит от IDL (Dev B). Без IDL invest instruction — заглушка
> - Задача 10 — зависит от GET /telemetry/latest (Dev C)
> - Задача 14 — admin instructions нужны от Dev B
> - Задача 15 — после всех страниц
> - Задачи 16-17 — после всех фич

> **Ключевое отличие v2:** Нет backend API кроме телеметрии. Все данные из on-chain PDAs.
> Это значит: нет React Query для REST endpoints (кроме telemetry), но есть React Query для RPC calls.

> **Как обновлять статус:** Меняй ⬜ на ✅ в таблице наверху.
