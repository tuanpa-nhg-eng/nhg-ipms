# NHG Design System — Tiến độ

> Cập nhật: 2026-06-18 · Trạng thái: **Token + Icon + Training đã xong, chưa wire vào app Next.js**

## Mục tiêu dự án
Design system chuẩn cho **NHG (Tập đoàn Nguyễn Hoàng)** — "AI vì Niềm tin & Sự kết nối".
- Font **Be Vietnam Pro** (toàn bộ, bỏ serif)
- **Light + Dark** theme
- Song ngữ **VN/EN** (next-intl, default `vi`, `/en`)
- Output đã chốt: **Token-only** (CSS variables + tokens JSON), không build app

## Đã hoàn thành ✅

### Tokens
- `tokens/tokens.json` — primitive (green/red/neutral 50–950, ivory, mist, font, radius, spacing, shadow, z) + semantic light/dark.
- `styles/nhg-tokens.css` — CSS vars. Light = `:root`, dark = `[data-theme="dark"]`/`.dark`, auto theo OS (`prefers-color-scheme`). `color-scheme` đã set.
- `styles/nhg-typography.css` — Be Vietnam Pro (3 cách load) + type scale `.nhg-h1…h5`, `.nhg-body`, `.nhg-numeric`…
- `styles/nhg-base.css` — reset + `.nhg-surface`, `.nhg-btn`.

### Icons (Lucide)
- `icons/icon-map.json` — bản đồ **ngữ nghĩa → tên Lucide** (navigation, actions, status, data, communication, user, media, theme, brand). NGUỒN SỰ THẬT.
- `styles/nhg-icons.css` — size tokens (`--nhg-icon-xs…xl` = 16/20/24/32/48), `.nhg-icon`, role màu qua `currentColor`, `.nhg-icon-btn` (tap 40px).
- `icons/icon-system.md` — guideline + component `<Icon name="actions.approve">` React.
- `icons/icon-gallery.html` — gallery render icon thật (Lucide CDN), search, đổi size, light/dark, click-to-copy.

### i18n (next-intl)
- `i18n/routing.ts · request.ts · navigation.ts · middleware.ts`
- `i18n/messages/{vi,en}.json` — strings demo theo brand voice NHG.
- `i18n/README.md` — hướng dẫn wiring đầy đủ (next.config, layout + next/font subset `vietnamese`, language switcher).

### Tài liệu & đào tạo
- `README.md` — tổng quan + quick start + section Icons.
- `training/nhg-design-system-training.html` — **15 slide** đào tạo, self-contained, là demo sống:
  - Toggle 🌙 light/dark + EN/VI ngay trên slide; điều hướng ← → / Space / Home-End; progress bar.
  - Đã thêm **logo thật** (cover + slide 05) trên `.logo-plate` nền trắng.
  - Đã thêm **slide 10 · Biểu tượng** (size tokens, role màu, icon-map, a11y) — icon SVG inline, render không cần mạng.

### Assets gốc (giữ nguyên, không sửa)
- `public/logo.png`, `public/icon-logo.png` — **logo bất biến tuyệt đối**.
- `nhg-design-system-assets/design-system.{md,json}` — guideline brand gốc (tham chiếu).

## Quyết định quan trọng đã chốt 🔑
1. **Be Vietnam Pro toàn bộ** — bỏ serif Playfair trong bộ mới (guideline cũ vẫn lưu ở `nhg-design-system-assets/` để tham chiếu).
2. **Dark theme**: primary sáng lên `#2FA15D`, accent `#F2585B` (màu brand gốc quá tối trên nền đen). Canvas `#0A0D0E`, card `#12181A`.
3. Thêm **warning** (`#B86A00`) + **info** (`#0A6BB8`) vì brand chỉ có green/red, dashboard cần đủ 4 trạng thái.
4. **Icon**: chuẩn hoá trên **Lucide** (không tự vẽ), stroke-only, "chọn theo ý nghĩa không theo hình". Tự vẽ chỉ khi Lucide thiếu → `icons/custom/` prefix `custom:`.
5. Triết lý xuyên suốt: **"Chọn vai trò, không chọn màu"** — component không bao giờ chứa hex, chỉ `var(--nhg-*)` semantic.

## Việc còn lại / gợi ý phiên sau 📋
- [ ] Viết file thật `components/Icon.tsx` (đang ở dạng spec trong `icons/icon-system.md`).
- [ ] (Tuỳ chọn) Tailwind v4 `@theme` map từ tokens; hoặc export `tokens.ts` (JS/TS).
- [ ] (Tuỳ chọn) Trang showcase Next.js để nghiệm thu trực quan toàn bộ component.
- [ ] (Tuỳ chọn) Vài icon custom NHG (mark từ logo cho splash, badge "AI-verified").
- [ ] (Tuỳ chọn) Bài tập/quiz cuối bộ training; bản PDF/in; bản Markdown cho wiki.
- [ ] Khi dựng app: theo `i18n/README.md` để wire next-intl + next/font.

## Cách mở nhanh
- Slide đào tạo: mở `training/nhg-design-system-training.html` (F11 toàn màn hình, phím ← →).
- Tra icon: mở `icons/icon-gallery.html`.
