# NHG Design System

Bộ design tokens chuẩn cho **Tập đoàn Nguyễn Hoàng (NHG)** — AI vì Niềm tin & Sự kết nối.
Token-only: CSS variables + tokens JSON. Font **Be Vietnam Pro**. Light + Dark. Song ngữ VN/EN.

> ⚠️ Logo gốc (`logo.png`, `icon-logo.png`) phải giữ nguyên tuyệt đối — không redraw,
> recolor, kéo giãn, thêm gradient/shadow. Xem `nhg-design-system-assets/design-system.md`.

## Cấu trúc

```
.
├── tokens/
│   └── tokens.json          # Nguồn tokens (primitive + semantic light/dark) — W3C-style
├── styles/
│   ├── nhg-tokens.css       # CSS variables: light = :root, dark = [data-theme="dark"]/.dark
│   ├── nhg-typography.css   # Be Vietnam Pro + type scale (.nhg-h1 … .nhg-caption)
│   ├── nhg-icons.css        # Icon size tokens + .nhg-icon + roles + .nhg-icon-btn
│   └── nhg-base.css         # Reset + helpers (.nhg-surface, .nhg-btn)
├── icons/                   # Icon system (Lucide) — xem icons/icon-system.md
│   ├── icon-map.json        # Bản đồ ngữ nghĩa → tên Lucide (nguồn sự thật)
│   └── icon-gallery.html    # Gallery tra cứu, render icon thật, light/dark + size
├── training/
│   └── nhg-design-system-training.html  # Slide đào tạo nội bộ (demo sống)
├── i18n/                     # next-intl (vi/en) — xem i18n/README.md
│   ├── routing.ts · request.ts · navigation.ts · middleware.ts
│   └── messages/{vi,en}.json
├── public/                  # logo.png, icon-logo.png, svg assets
└── nhg-design-system-assets/# brand guideline gốc (md + json)
```

## Dùng nhanh (bất kỳ project nào)

```css
/* globals.css — đúng thứ tự import */
@import './styles/nhg-tokens.css';
@import './styles/nhg-typography.css';
@import './styles/nhg-base.css';
```

```html
<!-- Chọn theme: bỏ trống = tự theo OS -->
<html data-theme="dark">  <!-- hoặc data-theme="light", hoặc class="dark" -->
```

```css
/* Trong component — luôn dùng token SEMANTIC, không dùng primitive trực tiếp */
.card {
  background: var(--nhg-surface-card);
  color: var(--nhg-text-primary);
  border: 1px solid var(--nhg-border-default);
  border-radius: var(--nhg-radius-xl);
  box-shadow: var(--nhg-shadow-sm);
}
.btn { background: var(--nhg-primary); color: var(--nhg-primary-fg); }
```

## Token model (2 lớp)

| Lớp | Ví dụ | Khi nào dùng |
|---|---|---|
| **Primitive** | `--nhg-green-600`, `--nhg-neutral-900` | Chỉ để định nghĩa semantic. Tránh dùng trong UI. |
| **Semantic** | `--nhg-primary`, `--nhg-text-primary`, `--nhg-bg-canvas` | Dùng trong mọi component. Tự đổi theo light/dark. |

### Semantic tokens chính
`--nhg-bg-canvas · --nhg-bg-subtle · --nhg-bg-muted`
`--nhg-surface-card · --nhg-surface-raised`
`--nhg-border-default · --nhg-border-subtle · --nhg-border-brand`
`--nhg-text-primary · --nhg-text-secondary · --nhg-text-tertiary · --nhg-text-on-brand`
`--nhg-primary{,-hover,-active,-subtle,-fg}` · `--nhg-accent{...}`
`--nhg-success · --nhg-warning · --nhg-danger · --nhg-info` (+ `-subtle`, `-fg`)
`--nhg-focus-ring`

## Brand colors

| Token | Hex | Vai trò |
|---|---|---|
| green-600 | `#037236` | Primary — trust, education, growth |
| red-500 | `#ED2024` | Accent — romance, highlight |
| neutral-950 | `#050708` | Black — authority |
| neutral-500 | `#818285` | Gray — secondary |
| neutral-0 | `#FFFFFF` | White |
| ivory | `#F8F6F1` | Warm editorial bg |
| mist | `#EEF3EF` | Calm sections |

Dark theme: primary sáng lên `#2FA15D`, accent `#F2585B` để đủ tương phản trên nền tối;
canvas `#0A0D0E`, card `#12181A`.

## Typography — Be Vietnam Pro

Một typeface duy nhất (VN-first, full dấu). Weights 100–800. Type scale qua class
`.nhg-display .nhg-h1…h5 .nhg-lead .nhg-body .nhg-body-sm .nhg-caption .nhg-overline`,
số liệu dùng `.nhg-numeric` (tabular-nums). Load qua `@import` có sẵn, hoặc `next/font`
(khuyến nghị, kèm subset `vietnamese` — xem `i18n/README.md`).

## Light / Dark

- `:root` = light (mặc định)
- `[data-theme="dark"]` hoặc `.dark` = dark
- Không set `data-theme` → tự theo `prefers-color-scheme`
- `color-scheme` được set đúng cho form controls native

## Song ngữ VN/EN

next-intl, default `vi`, `/en` cho tiếng Anh. Strings ở `i18n/messages/`.
Tích hợp đầy đủ (middleware, layout, font, switcher): **`i18n/README.md`**.

## Icons

Chuẩn hoá trên **Lucide** (stroke, lưới 24px). Triết lý như màu: **chọn theo ý nghĩa,
không theo hình**. Tham chiếu qua `icons/icon-map.json` (vd `actions.approve`,
`navigation.dashboard`). Size theo token (`--nhg-icon-xs…xl`), màu qua `currentColor`
+ role (`.nhg-icon--success`) → tự đúng light/dark. Hướng dẫn + component React:
**`icons/icon-system.md`**. Tra cứu trực quan: mở **`icons/icon-gallery.html`**.

```bash
npm install lucide-react
```

## Voice & microcopy
> Hãy để AI gánh phần việc lặp lại, để con người làm phần việc ý nghĩa.
> Dùng dữ liệu cẩn trọng. Tạo ra insight có trách nhiệm.
