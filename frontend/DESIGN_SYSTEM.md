# AXEL — Design System

> Минималистичная дизайн-система в духе Apple. Типографика и пространство — главные инструменты.
> Один акцентный цвет. Содержание говорит само за себя.

---

## 1. Философия

### Одно правило

> **Если элемент не помогает пользователю принять решение — убери его.**

### Принципы

| # | Принцип | На практике |
|---|---------|-------------|
| 1 | **Content-first** | Типографика = 80% дизайна. Цвет = акцент, не декорация |
| 2 | **Breathing room** | Много whitespace. Секции дышат. Ничего не стоит впритык |
| 3 | **One color, one purpose** | Cyan (#06B6D4) = "действуй". Всё остальное — чёрно-серо-белое |
| 4 | **Quiet confidence** | Без анимаций ради анимаций. Плавность = уважение к пользователю |
| 5 | **Reduce, then reduce again** | Borders → убрать. Shadows → минимальные. Gradients → нет |

### Бенчмарки

- **apple.com** — типографика, whitespace, hierarchy
- **Linear.app** — минимализм в dark mode, мягкие тени
- **Stripe.com** — доверие через чистоту

---

## 2. Цвет

### 2.1 Brand — Один цвет

```
Cyan (Primary)
├── #06B6D4  — primary (CTA, links, active states)
├── #0891B2  — hover
├── #0E7490  — active / pressed
├── #CFFAFE  — light bg (badges, highlights)
├── rgba(6, 182, 212, 0.10) — muted (hover backgrounds)
└── rgba(6, 182, 212, 0.06) — subtle (section tints)
```

**Почему один цвет?** Apple использует один акцент (Blue #0071E3) на весь сайт. Это создаёт clarity — глаз всегда знает, где CTA. Мы делаем то же самое с Cyan.

**Почему Cyan?** Не банковский blue, не DeFi-neon. Cyan = чистая вода, прозрачность, свежесть. Для платформы, где люди инвестируют в реальные активы — это правильная ассоциация.

### 2.2 Semantic Colors (Apple System Colors)

```
Success   #34C759  — Apple Green (active, confirmed, profit, claimed)
Warning   #FF9F0A  — Apple Orange (fundraising, pending, unclaimed)
Error     #FF3B30  — Apple Red (failed TX, errors, declined)
Info      #007AFF  — Apple Blue (tooltips, informational)
```

Используются **только для статусов и фидбека**. Никогда для декорации.

### 2.3 Neutrals

#### Light Theme (default)

```css
--background:           #FFFFFF
--background-secondary: #F5F5F7   /* Apple's signature gray */
--background-tertiary:  #FBFBFD
--text-primary:         #1D1D1F   /* Apple's near-black */
--text-secondary:       #6E6E73
--text-tertiary:        #86868B
--border:               #D2D2D7
--border-subtle:        #E8E8ED
--divider:              #D2D2D7
```

#### Dark Theme

```css
--background:           #000000   /* True black, like Apple */
--background-secondary: #1C1C1E
--background-tertiary:  #2C2C2E
--text-primary:         #F5F5F7
--text-secondary:       #A1A1A6
--text-tertiary:        #6E6E73
--border:               #38383A
--border-subtle:        #2C2C2E
```

### 2.4 Status Badge Mapping

| Status | Color | Badge BG | Badge Text |
|--------|-------|----------|------------|
| Fundraising | Warning | rgba(255,159,10,0.10) | #FF9F0A |
| Active | Success | rgba(52,199,89,0.10) | #34C759 |
| Paused | Warning | rgba(255,159,10,0.10) | #FF9F0A |
| Closed | Neutral | rgba(110,110,115,0.10) | #6E6E73 |

---

## 3. Типографика

### Шрифт

**Inter** — единственный шрифт (+ JetBrains Mono для кода).

Inter выбран как ближайший бесплатный аналог SF Pro. Тот же геометрический характер, та же чёткость на экране, те же оптические размеры.

```
Font stack:
'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif

Mono:
'JetBrains Mono', 'SF Mono', 'Fira Code', monospace
```

### Типографическая шкала (по модели Apple HIG)

| Token | Size | Line Height | Weight | Tracking | Где |
|-------|------|-------------|--------|----------|-----|
| Display Large | 56px | 1.07 | 700 | -0.005em | Landing hero |
| Display Medium | 48px | 1.08 | 700 | -0.003em | Section hero |
| Display Small | 40px | 1.1 | 600 | -0.002em | Feature headline |
| Headline | 28px | 1.14 | 600 | 0.007em | Page titles |
| Title 1 | 24px | 1.17 | 600 | 0.009em | Card headers, sections |
| Title 2 | 21px | 1.19 | 600 | 0.011em | Sub-sections |
| Title 3 | 19px | 1.21 | 600 | 0.012em | Small headings |
| Body | 17px | 1.47 | 400 | -0.022em | Main text |
| Body Emphasized | 17px | 1.47 | 600 | -0.022em | Bold body |
| Callout | 16px | 1.38 | 400 | -0.016em | Secondary text |
| Subheadline | 15px | 1.33 | 400 | -0.009em | Captions, meta |
| Footnote | 13px | 1.38 | 400 | -0.006em | Disclaimers |
| Caption 1 | 12px | 1.33 | 400 | 0 | Small labels |
| Caption 2 | 11px | 1.27 | 500 | 0.006em | Micro labels |

### Ключевые правила типографики

1. **Заголовки = Semi-bold/Bold, без uppercase.** Apple никогда не кричит КАПСОМ.
2. **Body = 17px.** Не 14px, не 16px. 17px — Apple's standard, отлично читается.
3. **Negative tracking на display.** Крупный текст нуждается в сжатии для оптики.
4. **Positive tracking на мелких.** Footnote/Caption чуть разреженнее для читаемости.

---

## 4. Spacing

### Base unit: 8px

Apple использует 8pt grid. Мы тоже.

```
4px   — micro gaps (icon spacing)
8px   — tight (badge padding, small gaps)
16px  — base (input padding, card gaps)
24px  — comfortable (card padding)
32px  — section padding
40px  — between content blocks
48px  — section spacing (mobile)
64px  — medium section gaps
80px  — large section gaps (desktop)
96px  — hero spacing
128px — major section breaks
```

### Page Layout

| Property | Mobile | Desktop |
|----------|--------|---------|
| Page padding | 20px | 80px |
| Max width | — | 980px (content), 1200px (wide) |
| Section gap | 48px | 80px |
| Card padding | 20px | 32px |

### Правило whitespace

> Если сомневаешься — добавь пространства. Лучше "слишком много воздуха" чем "слишком тесно".

---

## 5. Border Radius

Apple-стиль: **pill для кнопок и badges, мягкие скругления для контейнеров.**

| Элемент | Радиус | Почему |
|---------|--------|--------|
| Button | 980px (pill) | Apple's signature — полностью скруглённые |
| Badge | 980px (pill) | Consistency с кнопками |
| Chip (wallet address) | 980px (pill) | Мелкий интерактивный элемент |
| Card | 18px | Достаточно мягко, но не pill |
| Card Small | 12px | Для nested cards |
| Input | 12px | Мягкие, но видно что это поле |
| Modal | 22px | Большой, ощущение отдельного слоя |
| Toast | 14px | Между card и badge |
| Progress Bar | 980px (pill) | Плавная полоска |

---

## 6. Shadows

**Минимальные.** Apple почти не использует тени на основном контенте. Тени — только для elevation (модалки, dropdown, cards при hover).

### Light Mode

```css
--shadow-xs:  0 1px 2px rgba(0,0,0,0.04);
--shadow-sm:  0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
--shadow-md:  0 4px 16px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04);
--shadow-lg:  0 8px 30px rgba(0,0,0,0.08);
--shadow-xl:  0 16px 48px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.04);
```

### Правило теней

| Элемент | Тень |
|---------|------|
| Card (idle) | **none** или xs |
| Card (hover) | sm |
| Dropdown | md |
| Modal | xl |
| Toast | md |
| Navbar | xs (при скролле) |
| Button | **none** |

> **Нет glow-эффектов.** Apple не делает glow — мы тоже. Чистая геометрия.

---

## 7. Компоненты

### 7.1 Buttons

#### Primary — Pill, Cyan fill

```
Background:    #06B6D4
Hover:         #0891B2
Active:        #0E7490
Text:          #FFFFFF
Weight:        400 (regular! как у Apple)
Size:          17px
Radius:        980px
Padding:       12px 24px
Min height:    44px
Shadow:        none
Transition:    background 250ms ease
```

> **Важно:** Apple использует regular weight (400) для текста кнопок, не bold. Это создаёт спокойную уверенность.

#### Secondary — Text only, Cyan

```
Background:    transparent
Hover:         rgba(6, 182, 212, 0.06)
Text:          #06B6D4
Border:        none (чистый текст, как Apple "Learn more >")
Weight:        400
```

#### Ghost — Neutral text

```
Background:    transparent
Text:          #1D1D1F (light) / #F5F5F7 (dark)
Hover:         var(--background-secondary)
```

#### Danger — Red fill (редко)

```
Background:    #FF3B30
Text:          #FFFFFF
Radius:        980px
```

**Состояния:** idle → hover (darken, no scale) → active (darken more) → disabled (40% opacity)

> **Нет scale на hover.** Apple не увеличивает кнопки при наведении. Только цвет меняется. Это спокойнее.

### 7.2 Cards

```
Background:    var(--surface)
Border:        none (используй тень или background-secondary фон секции)
Radius:        18px
Padding:       20px (mobile) / 32px (desktop)
Hover:         shadow-sm (не translateY, не glow — просто мягкая тень)
Transition:    box-shadow 250ms ease
```

Если карточки на белом фоне — добавить border: 1px solid var(--border-subtle).
Если на сером (#F5F5F7) — карточки белые, border не нужен.

### 7.3 Inputs

```
Border:        1px solid var(--border)
Radius:        12px
Padding:       12px 16px
Font size:     17px (предотвращает zoom на iOS)
Focus:         border-color: #06B6D4
               нет glow ring, только border цвет меняется (Apple-style)
Error:         border-color: #FF3B30
```

### 7.4 Badges (Status)

```
Shape:         pill (980px)
Padding:       4px 10px
Font:          12px, weight 500
Background:    semantic color muted (10% opacity)
Text:          semantic color base
```

Fundraising badge: маленькая пульсирующая точка (●) перед текстом — единственная анимация.

### 7.5 Progress Bar

```
Track:         var(--border-subtle), height 6px, pill
Fill:          #06B6D4 (один цвет, без градиента!)
Animation:     width 800ms ease-out
Label:         Под баром: "XX% funded" — footnote size
```

### 7.6 Navbar

```
Height:        52px (компактнее чем типичные 72px — Apple style)
Position:      sticky top-0
Background:    var(--background) / opacity 0.72
Backdrop:      blur(20px) saturate(180%) — Apple's frosted glass
Border:        нет (только тончайшая линия при скролле: 0.5px)
```

Содержимое:
- Слева: "AXEL" (текст, не лого, weight 600, 21px)
- Центр: Catalog · Dashboard · Payouts (links, weight 400, 12px uppercase с tracking 0.08em — Apple nav style)
- Справа: wallet chip (pill) или "Connect" link

### 7.7 Modal

```
Backdrop:      rgba(0,0,0,0.4), blur(20px)
Content:       var(--surface), radius 22px, padding 32px
Shadow:        xl
Animation:     opacity + scale(0.97 → 1), 250ms ease
Max width:     480px
```

### 7.8 Toast

```
Position:      top center (как Apple notifications, не top-right)
Radius:        14px
Shadow:        md
Left accent:   4px solid [semantic color]
Auto-dismiss:  5s
Animation:     slide down + fade, 350ms spring
```

---

## 8. Animations

### Философия

> **Если пользователь не заметил анимацию — она идеальна.**

### Transitions

```css
--ease:        250ms ease;           /* default для всего */
--ease-fast:   150ms ease;           /* hover states */
--ease-slow:   350ms ease;           /* page transitions */
--spring:      500ms cubic-bezier(0.25, 1, 0.5, 1);  /* modal, toast */
```

### Что анимируется

| Элемент | Анимация | Duration |
|---------|----------|----------|
| Button hover | background-color | 250ms |
| Card hover | box-shadow | 250ms |
| Modal enter | opacity + scale | 250ms |
| Modal exit | opacity + scale | 150ms |
| Toast enter | translateY + opacity | 350ms spring |
| Page content | opacity (fade-in) | 300ms |
| Progress bar | width | 800ms ease-out |
| Skeleton | shimmer (gradient sweep) | 1.5s infinite |
| Fundraising dot | opacity pulse | 2s infinite |
| Numbers (dashboard) | count-up | 600ms |

### Что НЕ анимируется

- **Нет translateY на card hover** (Apple не делает это)
- **Нет scale на button hover** (Apple не делает)
- **Нет glow эффектов** (никогда)
- **Нет staggered animations** на карточках каталога (простой fade-in всей секции)
- **Нет confetti** при успешной TX (это не мемкоин платформа)

---

## 9. Иконки

**Lucide React** — outlined, 1.5px stroke, minimalist.

| Размер | Использование |
|--------|---------------|
| 16px | Inline с текстом |
| 20px | Default (кнопки, nav) |
| 24px | Standalone |

Цвет: `currentColor` (наследует от parent). Никогда не раскрашивать иконки отдельно от текста.

---

## 10. Responsive

### Breakpoints (Apple-style)

| Name | Width | Typical |
|------|-------|---------|
| Compact | < 734px | iPhone, small Android |
| Medium | 734–1068px | iPad, small laptops |
| Large | > 1068px | Desktop |

(Apple не использует стандартные 640/768/1024. Их breakpoints оптимизированы под реальные девайсы.)

### Адаптация

| Элемент | Compact | Medium | Large |
|---------|---------|--------|-------|
| Catalog grid | 1 col | 2 col | 3 col |
| Asset page | stacked | stacked | 2 col |
| Dashboard metrics | 1 col | 2 col | 3 col |
| Navbar | hamburger | full | full |
| Page padding | 20px | 40px | 80px |
| Section gap | 48px | 64px | 80px |
| Display text | 40px | 48px | 56px |

### Touch targets

Минимум **44×44px** для всех интерактивных элементов (Apple HIG requirement).

---

## 11. Wallet & Blockchain UX

### Wallet Address
```
Display:     Axx…xxB (первые 4 + последние 4)
Font:        JetBrains Mono, 14px, weight 500
Container:   Pill chip (background-secondary, radius 980px)
Copy:        Click to copy → "Copied" tooltip 2s
```

### SOL Amounts
```
Font:        JetBrains Mono для числа
Format:      X.XXXX SOL
Profit:      #34C759 (success)
Loss:        #FF3B30 (error)
Neutral:     #1D1D1F (text-primary)
```

### Transaction Flow
```
Idle           → нет индикатора
Awaiting       → subtle spinner + "Approve in wallet"
Confirming     → spinner + "Confirming..." + TX link (cyan)
Success        → ✓ checkmark + "Confirmed" + TX link
Error          → subtle red text + "Try again" link
```

Нет модальных popup на каждый этап. Статус показывается inline, спокойно.

### Explorer Links
```
Text:          TX hash truncated (mono font)
Color:         #06B6D4 (link)
Icon:          ↗ (external link, 12px)
Opens:         new tab, Solana Explorer
```

---

## 12. Accessibility

| Требование | Значение |
|-----------|---------|
| Contrast (text) | ≥ 4.5:1 WCAG AA |
| Contrast (large text) | ≥ 3:1 |
| Focus ring | 2px offset, #06B6D4 (не glow — чёткий outline) |
| Touch targets | ≥ 44×44px |
| Motion | `prefers-reduced-motion: reduce` — отключить все анимации |

### Проверенные контрасты (Light Mode)

| Text | Background | Ratio | ✓ |
|------|-----------|-------|---|
| #1D1D1F on #FFFFFF | — | 16.7:1 | ✅ |
| #6E6E73 on #FFFFFF | — | 5.6:1 | ✅ |
| #06B6D4 on #FFFFFF | — | 3.1:1 | ✅ large text |
| #FFFFFF on #06B6D4 | — | 3.1:1 | ✅ large text |

> **Note:** Cyan (#06B6D4) на белом фоне проходит только для large text (≥ 18px). Для мелких CTA-ссылок (< 18px) использовать #0891B2 (hover shade, ratio 3.8:1) или #0E7490 (4.9:1).

---

## 13. Anti-patterns — Чего НЕ делать

| ❌ Не делать | ✅ Делать |
|-------------|----------|
| Gradient backgrounds | Solid colors |
| Glow effects on buttons | Clean state transitions |
| Multiple accent colors | One cyan, rest is grayscale |
| Bold/uppercase button text | Regular weight, sentence case |
| Card lift on hover (translateY) | Subtle shadow on hover |
| Rounded everything (pill cards) | Pill for buttons, moderate radius for cards |
| Dense layouts | Generous whitespace |
| Decorative elements | Content as design |
| Skeleton for every element | Skeleton for data blocks, instant render for layout |

---

## Reference

Все токены → [`frontend/design-tokens.json`](./design-tokens.json)
