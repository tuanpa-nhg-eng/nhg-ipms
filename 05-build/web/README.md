# NHG iPMS — Web UI

Frontend Next.js 14 (App Router) + TypeScript, dùng **NHG Design System** (token CSS, Be Vietnam Pro, light/dark, VI/EN). Hiện thực hoá UI/UX theo Spec + TDD (`02-dac-ta/`).

## Chạy

```bash
cd 05-build/web
npm install
npm run dev      # http://localhost:3000  → tự chuyển /exec/cockpit
```

> Yêu cầu Node ≥ 18.18. `npm run build` để kiểm tra biên dịch production.

## Màn hình đã build (prototype dữ liệu mock) — 18 màn / 5 persona

Phủ trọn **vòng MVP**: Strategy Cascade → KPI/Scorecard → Goal+Evidence → Check-in → Review → Calibration → Development Plan → Dashboard → Audit.

| Route | Màn hình | Persona |
|---|---|---|
| `/exec/cockpit` | Executive Cockpit + **Goal-at-Risk** + Executive Briefing (AI) | Lãnh đạo |
| `/exec/strategy` | **Strategy Cascade** — cây OKR→KGI→KPI + health | Lãnh đạo |
| `/employee/my-goals` | My Goals + Evidence Timeline | Nhân viên |
| `/employee/review` | **My Review** — bảng điểm, self review, nhận xét quản lý, giải trình | Nhân viên |
| `/employee/development` | **Development Plan** — skill gap → iLMS → coaching 30-60-90 (AI) | Nhân viên |
| `/manager/team` | **Team Check-in** + sức tải (heatmap) + Check-in Assistant (AI) | Manager |
| `/manager/review` | Review Draft + **panel Đề xuất AI** (human-in-the-loop) | Manager |
| `/hr/kpi-library` | KPI Library cha–con + Scorecard + bậc thang điểm | HR / B1 |
| `/hr/calibration` | **Calibration Room** — phân phối rating, outlier/bias | HR / B1 |
| `/audit/logs` | **Audit Log** append-only (gắn nhãn AI) | BOC / Audit |
| `/exec/talent` | **Talent Risk** — flight risk + kế nhiệm (M8) | Lãnh đạo |
| `/exec/ai-adoption` | **AI Adoption** — ratio, giờ tiết kiệm, use case (M9) | Lãnh đạo |
| `/employee/check-in` | **My Check-ins** — cập nhật tiến độ + lịch sử | Nhân viên |
| `/manager/coaching` | **Coaching Notes** — nhật ký 1:1 + Coaching Agent | Manager |
| `/hr/review-cycle` | **Review Cycle Setup** — cấu hình + tiến trình chu kỳ | HR / B1 |
| `/hr/talent-matrix` | **Talent Matrix** 9-box (hiệu suất × tiềm năng) | HR / B1 |
| `/hr/policy` | **Policy Management** — chính sách + version | HR / B1 |
| `/audit/compliance` | **Compliance Dashboard** — checklist governance + ngoại lệ | BOC / Audit |

Tính năng UI: đổi **theme sáng/tối**, đổi **ngôn ngữ VI/EN** (góc trên phải), sidebar điều hướng.

## Cấu trúc

```
src/
├── app/
│   ├── layout.tsx · globals.css · page.tsx (redirect)
│   ├── exec/cockpit/ · employee/my-goals/ · manager/review/ · hr/kpi-library/
├── components/
│   ├── shell/   AppShell · Sidebar · Topbar
│   ├── ui/      Card · Badge · Stat · Progress
│   └── providers/ ThemeProvider
├── lib/         i18n.tsx (lightweight) · mock.ts
└── styles/nhg/  tokens · typography · base  (đồng bộ từ /design-system)
```

## Ghi chú kỹ thuật (bản production)
- **i18n**: hiện dùng context nhẹ; production chuyển sang **next-intl** + route `[locale]` (TDD §13).
- **Dữ liệu**: đang là mock (`lib/mock.ts`); production thay bằng API client typed từ OpenAPI (TDD §8).
- **Design tokens** trong `src/styles/nhg/` là bản **sync** từ `/design-system` — khi design-system đổi, copy lại.
- **AuthN/RBAC, audit, AI gateway**: chưa nối ở prototype — xem TDD §9,11,12.
