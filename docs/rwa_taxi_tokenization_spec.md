# RWA Токенизация Автомобиля для Такси (Solana) — Техническое Задание

## 1. Общее описание

Платформа для токенизации автомобиля, используемого в такси, с возможностью:

- покупки долей (токенов) инвесторами
- получения дохода от эксплуатации автомобиля
- прозрачного учета и распределения прибыли через Solana

---

## 2. Цели MVP

- Запустить токенизацию 1 автомобиля
- Реализовать покупку долей (Token-2022)
- Организовать сбор средств (fundraising)
- Реализовать распределение дохода (claim model)
- Ограничить доступ через whitelist (KYC)
- Обеспечить прозрачность выплат

---

## 3. Архитектура

```text
[Frontend] → [Backend API] → [Solana Program]
                      ↓
             [PostgreSQL DB]
                      ↓
             [Data Ingestion Layer]
                      ↓
              [Taxi / Operator APIs]
```

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
| **Transfer Hook** | Mint | При каждом переводе токенов вызывается отдельная on-chain программа — проверяет, что оба адреса (отправитель и получатель) есть в whitelist. Без KYC — перевод невозможен на уровне протокола |
| **Default Account State (Frozen)** | Mint | Новый токен-аккаунт инвестора создаётся в состоянии `frozen`. Токены получить можно, но перевести — нет до прохождения KYC. Разморозка через Freeze Authority после одобрения |
| **Permanent Delegate** | Mint | Платформа всегда может перевести или сжечь токены любого держателя. Необходимо для сценария `refund`: токены изымаются, SOL возвращается. Также для принудительного выкупа при нарушении условий |
| **Transfer Fee** | Mint | При каждом вторичном переводе токенов автоматически удерживается fee (например 1%). Комиссия накапливается и может направляться в резервный фонд или распределяться между держателями |
| **Token Metadata + Metadata Pointer** | Mint | Метаданные автомобиля хранятся прямо на минте: VIN, марка, год, стоимость, страховка, лицензия такси. Не требует отдельной программы метаданных (Metaplex) |
| **Memo Transfer** | Account | Все входящие переводы на токен-аккаунт обязаны содержать memo. Создаёт on-chain аудиторский след: "Revenue Q1 2025", "Refund", "Token Sale" |

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

---

## 5. Off-chain компоненты

### Backend (Node.js / NestJS)

- Users + KYC
- Asset Service
- Investment Service
- Payout Engine
- Data Ingestion
- Reporting

### Database (PostgreSQL)

Основные таблицы:

- users
- assets
- projects
- investments
- revenue_periods
- payouts

---

## 6. Бизнес-логика

### Fundraising

- инвесторы отправляют SOL
- если достигнут min_raise → finalize
- иначе → refund

### Формула прибыли

Profit = Revenue - Expenses - Reserve

### Выплаты

- backend считает прибыль
- депонирует SOL
- инвесторы делают claim

---

## 7. Frontend

- Каталог машин
- Страница актива
- Инвестирование
- Dashboard
- История выплат

---

## 8. Безопасность

- Multisig
- Whitelist (enforced on-chain via Transfer Hook)
- Default Account State (Frozen) — защита до прохождения KYC
- Permanent Delegate — возможность изъятия токенов при нарушении условий
- Валидация данных

---

## 9. Ограничения MVP

- 1 автомобиль
- whitelist-only
- централизованный oracle

---

## 10. Итог

On-chain:

- Token-2022 токен с расширениями
- Solana program
- Transfer Hook program
- payout logic

Off-chain:

- backend
- база данных
- ingestion
- payout engine

Блокчейн управляет долями и выплатами,
реальный доход формируется off-chain.
