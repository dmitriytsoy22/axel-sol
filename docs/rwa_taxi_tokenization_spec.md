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
[Frontend] → [Backend API] ──────────→ [Solana Program]
                  ↓    ↑                      ↑
           [PostgreSQL DB]          [Oracle TX (signed)]
                  ↓                            ↑
        [Data Ingestion Layer] ────────────────┘
                  ↓
         [Yandex Pro API]
     (mileage, revenue, car status)
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
- **Yandex Pro Data Ingestion**
- **Oracle Service** (подписывает и пушит данные в Solana)
- Reporting

### Yandex Pro Integration (Oracle)

Ключевой механизм доказательства реальности актива — интеграция с Yandex Pro API.

**Что забирается ежедневно:**

- Пробег автомобиля за день (км)
- Выручка за день (тенге / локальная валюта)
- Статус автомобиля: активен / на ремонте / неактивен
- Количество завершённых поездок

**Как работает Oracle:**

1. `@Cron` задача запускается раз в сутки (например, в 01:00)
2. Backend делает запрос к Yandex Pro API с авторизацией по vehicle_id
3. Данные валидируются и сохраняются в таблицу `telemetry_records`
4. Backend подписывает пакет данных своим oracle keypair (Ed25519)
5. Отправляет транзакцию в Solana — инструкция `record_telemetry` с хешем данных и подписью
6. Транзакция создаёт неизменяемую on-chain запись: хеш + timestamp + oracle pubkey
7. Полные данные хранятся off-chain в PostgreSQL; on-chain хранится только хеш (proof)

**Что видят инвесторы на Dashboard:**

> "Машина в пути — заработано сегодня: 12 400 ₸ · Пробег: 187 км · Поездок: 14"

**Таблица `telemetry_records`:**

- `date` — дата записи
- `vehicle_id` — идентификатор авто в Yandex Pro
- `daily_revenue` — выручка в тенге
- `mileage_km` — пробег за день
- `trips_count` — количество поездок
- `car_status` — active / maintenance / inactive
- `data_hash` — SHA-256 хеш пакета данных
- `oracle_signature` — Ed25519 подпись backend'а
- `solana_tx_signature` — подтверждение on-chain записи

### Database (PostgreSQL)

Основные таблицы:

- users
- assets
- projects
- investments
- revenue_periods
- payouts
- **telemetry_records**

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
- Dashboard (включая live-телеметрию: статус авто, выручка за сегодня, пробег)
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
- централизованный oracle (backend keypair; не децентрализован)
- Yandex Pro API как единственный источник данных (один провайдер)

---

## 10. Итог

On-chain:

- Token-2022 токен с расширениями
- Solana program
- Transfer Hook program
- payout logic
- telemetry oracle records (хеш + подпись, ежедневно)

Off-chain:

- backend
- база данных
- Yandex Pro ingestion
- oracle signing service
- payout engine

Блокчейн управляет долями и выплатами,
реальный доход формируется off-chain.
