# RWA Токенизация Автомобиля для Такси (Solana) — Техническое Задание

## 1. Общее описание

Платформа для токенизации автомобиля, используемого в такси, с возможностью:

- покупки долей (токенов) инвесторами
- получения дохода от эксплуатации автомобиля
- прозрачного учета и распределения прибыли через Solana

**Ключевой принцип архитектуры:** вся бизнес-логика и состояние хранятся on-chain. Фронтенд читает данные напрямую из Solana RPC. Backend существует только для двух задач, которые физически невозможно перенести в браузер: подписание oracle-данных и получение webhook от KYC-провайдера.

---

## 2. Цели MVP

- Запустить токенизацию 1 автомобиля
- Реализовать покупку долей (Token-2022)
- Организовать сбор средств (fundraising)
- Реализовать распределение дохода (claim model)
- Ограничить доступ через whitelist (KYC)
- Обеспечить прозрачность выплат и телеметрии через Yandex Pro

---

## 3. Архитектура

```text
[Frontend (Next.js)]
  │  читает PDAs напрямую      отправляет транзакции
  ├──────────────────────────────────────→ [Solana Program]
  │                                               ↑
  │  GET /telemetry/latest                        │ record_telemetry
  └──────────→ [Minimal Backend] ────────────────┘
                     │
             [Yandex Pro API]
          (cron: ежедневный сбор данных)
                     │
          [KYC Provider (Sumsub)]
          (webhook → add_to_whitelist)
```

**Нет базы данных. Нет сервера состояния. Состояние = on-chain.**

---

## 4. On-chain компоненты (Solana)

### Token Mint — Token Extensions (Token-2022)

Используем программу **Token-2022** (Token Extensions) вместо классического SPL Token.

- количество токенов = стоимость автомобиля / цена одного токена (например: авто $20 000, токен $100 → 200 токенов)
- фиксированная эмиссия определяется при инициализации проекта
- все расширения задаются **при создании минта** — после изменить нельзя

#### Используемые расширения Token-2022

| Расширение | Уровень | Применение в проекте |
| --- | --- | --- |
| **Transfer Hook** | Mint | При каждом переводе токенов вызывается отдельная on-chain программа — проверяет, что оба адреса есть в whitelist. Без KYC — перевод невозможен на уровне протокола |
| **Default Account State (Frozen)** | Mint | Новый токен-аккаунт создаётся frozen. Разморозка — только после KYC через Freeze Authority |
| **Permanent Delegate** | Mint | Платформа может изъять и сжечь токены при refund или нарушении условий |
| **Transfer Fee** | Mint | 1% fee при вторичных переводах; накапливается в резервный фонд |
| **Token Metadata + Metadata Pointer** | Mint | Метаданные авто прямо на минте: VIN, марка, год, стоимость, лицензия |
| **Memo Transfer** | Account | Все переводы содержат memo — on-chain аудиторский след |

### On-chain аккаунты (PDAs)

Весь стейт проекта хранится в PDAs, доступных для чтения напрямую с фронтенда:

- `ProjectState` — параметры проекта, статус, суммы
- `InvestorRecord` — сколько SOL вложил и токенов получил каждый инвестор
- `RevenuePeriod` — каждый период выплат: сумма, snapshot supply
- `ClaimRecord` — факт выплаты конкретному инвестору за период
- `WhitelistEntry` — одобренные KYC кошельки
- `TelemetryRecord` — ежедневный хеш данных Yandex Pro + oracle-подпись

### Основные инструкции

- initialize_project
- start_raise
- invest
- finalize_raise
- refund
- deposit_revenue
- claim_revenue
- pause_project
- close_project
- add_to_whitelist / remove_from_whitelist
- record_telemetry

---

## 5. Off-chain компоненты

### Minimal Backend (Node.js / NestJS)

**Только то, что физически не может быть в браузере:**

- **Yandex Pro ingestion** — cron-задача: запрашивает API с приватными credentials, вычисляет SHA-256 хеш, подписывает oracle keypair, отправляет `record_telemetry` в Solana
- **KYC webhook** — один endpoint, принимает одобрение от Sumsub; вызывает `add_to_whitelist` on-chain + Freeze Authority для размораживания token account
- **Telemetry read endpoint** — `GET /telemetry/latest/:project_id` отдаёт сырые цифры (выручка, пробег) для дашборда

**Нет базы данных. Нет сессий. Нет бизнес-логики.**

### KYC Provider (Sumsub / Veriff)

Внешний сервис полностью берёт на себя верификацию личности. Backend получает только webhook с результатом.

### Frontend (Next.js) как основной источник состояния

Фронтенд читает всё напрямую из Solana:

- `getAccountInfo(ProjectState PDA)` — статус проекта, параметры, суммы
- `getAccountInfo(InvestorRecord PDA)` — позиция инвестора
- `getProgramAccounts` — все периоды выплат, все claimы конкретного кошелька
- `getTokenAccountBalance` — баланс токенов
- `getAccountInfo(WhitelistEntry PDA)` — статус KYC/whitelist кошелька

---

## 6. Бизнес-логика

### Fundraising

- инвесторы отправляют SOL
- on-chain валидирует: whitelist, лимиты, дедлайн
- если достигнут min_raise → finalize (admin вызывает инструкцию напрямую с фронтенда)
- иначе → refund (инвесторы вызывают сами)

### Формула прибыли

Profit = Revenue - Expenses - Reserve

### Выплаты

- admin считает прибыль и вызывает `deposit_revenue` напрямую с фронтенда (admin panel)
- инвесторы делают claim самостоятельно, вызывая `claim_revenue`
- on-chain хранит полную историю периодов и claim-записей

### KYC / Whitelist flow

1. Инвестор проходит KYC через Sumsub (внешняя форма)
2. Sumsub вызывает `POST /kyc/webhook` на minimal backend
3. Backend вызывает `add_to_whitelist` и размораживает token account
4. Инвестор может инвестировать

---

## 7. Frontend

- Каталог машин (читает ProjectState PDAs через RPC)
- Страница актива (читает ProjectState + телеметрию)
- Инвестирование (preflight на клиенте → on-chain tx)
- Dashboard (токены + RevenuePeriod PDAs + live-телеметрия: «Машина в пути — 12 400 ₸ · 187 км»)
- История выплат (ClaimRecord PDAs напрямую)
- Admin panel (отправляет admin-инструкции прямо из браузера)

---

## 8. Безопасность

- Multisig — все privileged authority (Upgrade, PermanentDelegate, TransferFee harvest, Freeze)
- Whitelist — enforced on-chain via Transfer Hook на каждый перевод
- Default Account State (Frozen) — защита до KYC
- Permanent Delegate — изъятие токенов при нарушении
- Oracle keypair хранится в secrets manager, недоступен из браузера
- KYC credentials (Sumsub API key) — только на minimal backend

---

## 9. Ограничения MVP

- 1 автомобиль
- whitelist-only (KYC через Sumsub)
- централизованный oracle (backend keypair; не децентрализован)
- Yandex Pro API как единственный источник телеметрии
- нет off-chain базы данных — весь стейт on-chain

---

## 10. Итог

On-chain (Solana):

- Token-2022 токен с расширениями
- rwa-taxi program (все инструкции)
- transfer-hook program (whitelist enforcement)
- Весь стейт: проект, инвесторы, выплаты, whitelist, телеметрия

Off-chain (Minimal Backend):

- Yandex Pro cron + oracle signing
- KYC webhook receiver (1 endpoint)
- Telemetry read endpoint (1 endpoint)

Блокчейн является единственным источником истины.
Backend существует только как защищённый proxy для внешних API.
