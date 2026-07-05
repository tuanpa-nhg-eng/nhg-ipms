# OWNER DIGEST — NHG iPMS

> Kênh async duy nhất giữa Fable 5 (iPMS Chief Builder) và chủ dự án.
> Mỗi mục: quyết định đã tự chốt · giả định · tác động · trạng thái review.

---

## RED-LINE chờ duyệt
*(trống — chưa có hành động nào chạm red-line)*

---

## Phase 0 — Nền tảng monorepo + multi-tenant + RLS · **05/07/2026 · HOÀN THÀNH**

**Đã build (tất cả trong `05-build/`):**
- Monorepo pnpm workspaces: `packages/db` (Prisma + migration + RLS SQL + seed) · `packages/shared` (types/permission catalog) · `apps/api` (NestJS) · `docker-compose.dev.yml` (Postgres 16 + Redis 7, bind loopback) · CI GitHub Actions (`.github/workflows/ci.yml`).
- DB: 12 bảng TDD §6.1–6.2 (tenant, org_unit, role_family, position, person, app_user, role, permission, role_permission, user_role) + `audit_log` append-only (trigger chặn UPDATE/DELETE kể cả owner) + `feature_flag` (#12). RLS mọi bảng, fail-closed khi chưa set tenant context. Runtime role `ipms_app` least-privilege (không DELETE bảng nghiệp vụ, chỉ đọc catalog role/permission/flag, KHÔNG BYPASSRLS).
- API: guard pipeline `Jwt → Tenant (X-Tenant-Id khớp claim) → Permission (fail-closed: endpoint không khai permission = 403)` + audit interceptor (@Audited) + error model TDD §8.2 + OpenAPI /api/docs. Endpoints: auth/health · auth/dev-token (dev-only, env-gated) · tenants/me · org-units (list/tree/create) · persons (list/me/create).
- **Test: 17/17 PASS** — 9 unit (guards) + 8 integration rò tenant trên Postgres thật (cross-read API, mượn tenant header→403, RLS raw SQL 0 dòng, audit append-only, no-DELETE). Smoke test: API boot thật, dev-token → tenants/me → org-units trả đúng data H.01.

**Reviewer Agent (SoD) — verdict: PASS-WITH-FIXES → đã fix đủ 4 điểm bắt buộc, re-test PASS:**
- F1: thu hồi quyền ghi `role`/`feature_flag` khỏi app role (chặn app-path sửa catalog/flag global ảnh hưởng mọi tenant).
- F2: JWT secret fail-closed — bắt buộc `DEV_JWT_SECRET`; fallback dev chỉ khi opt-in `ALLOW_INSECURE_DEV_SECRET=true`.
- F3: bỏ password hard-code khỏi migration; dev dùng `infra/dev-init.sql` (docker init), prod ops pre-create role từ vault.
- F4: PermissionGuard lọc cả role đã soft-delete (thu hồi role có hiệu lực ngay).
- Fix thêm F10: Postgres/Redis dev chỉ bind 127.0.0.1.

**Ticket nợ (Reviewer MINOR — xử lý Phase 0.x/1):**
- F5: audit fire-and-forget → chuyển ghi audit cùng transaction/outbox TRƯỚC khi có dữ liệu rating thật; cân nhắc allowlist field (PII trong `after`).
- F6: enforce `scope_type/scope_id` (ScopeGuard org_unit/self) — Phase 1.
- F7: dev-token: singleton owner client + gộp message lỗi chống enumeration; prod không cấp OWNER_DATABASE_URL cho API.
- F8: cân nhắc composite FK `(tenant_id, id)` — phase sau.
- F9: partial unique index `WHERE deleted_at IS NULL` cho code org_unit/person (soft-delete + unique).
- F11: map Prisma P2002 → 409 trong error filter.

**Giả định mặc định đã dùng:**
1. AuthN Phase 0 = JWT HS256 nội bộ, claims map sẵn chuẩn Entra (sub/tid/oid/email) → cắm OIDC Entra ở phase sau không đổi contract. Endpoint `dev-token` sẽ XÓA khi có Entra.
2. Monorepo đặt tại `05-build/` (giữ `web/` hiện có, hợp nhất vào `apps/web` ở Phase 2–3 khi nối backend).
3. UUIDv7 sinh app-side (thư viện `uuidv7`) vì Postgres 16 chưa có native.
4. Repository layer = service layer ở Phase 0 (module còn mỏng); tách riêng khi module phình ở Phase 1.
5. Port dev không đụng hệ khác: Postgres 55432, Redis 56379, API 4000.

**Việc tiếp theo (Phase 1 — lõi PMS):** KPI Dictionary + kpi_formula (parser whitelist min/max/round/clamp/if) + Scorecard + **Scoring Engine** với bộ test bắt buộc (bậc thang, direction reverse, chia đều group weight, Σ=100±0.01, recompute đúng formula version) → objective/goal cascade + health → Evidence Hub + connector CSV/Notion. Kèm trả nợ F5/F6/F9.

**Cách chạy dev:** `cd 05-build && pnpm install && pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm api:dev` (env theo `.env.example`).

---

## Phase 1 — Lát cắt 1: KPI schema + Scoring Engine · **05/07/2026 · XONG**

**Đã build (commit `feat(phase-1)`):**
- **Schema §6.3–6.4** (10 bảng): strategic_theme · objective (OKR/KGI, parent tree) · goal (cascade cha–con, health_score) · kpi_category cha–con · kpi_formula (versioned) · kpi (method manual/system, direction forward/reverse, task_cell_ref, versioned) · kpi_score_tier (bậc thang) · kpi_applicability (điều kiện áp dụng) · scorecard + scorecard_item (weight/group_weight). RLS + grants đồng nhất Phase 0.
- **Scoring Engine (logic lõi TDD §7)** — pure functions, không phụ thuộc DB:
  - Formula parser tự viết (recursive descent) — whitelist hàm `min/max/round/clamp/if`, biến `actual/target/base`, chặn mọi ký tự/hàm/biến lạ, chặn chia 0 → **không có đường injection/eval**.
  - `applyFormula` (direction reverse = target/actual đúng biên bản 24/06) · `tierLookup` bậc thang (100→25, 90→22…) · `resolveWeights` (item weight | group_weight chia đều, **Σ=100±0.01 chặn cứng**) · `computeScore` → final_score 1–100 → `mapIpc` (bảng cấu hình).
  - Snapshot `formula.version` chảy qua kết quả — recompute lịch sử dùng đúng version (test chứng minh v1≠v2).
- **Test: 45/45 PASS toàn repo** (28 test scoring mới + 9 guards + 8 integration RLS).

---

## Phase 1 — HOÀN THÀNH (lát 2–4 + review) · **05/07/2026**

**Đã build (4 commit `731ecf9`→`9f598fb`), 75/75 test PASS:**
- **KPI Dictionary API:** create (validate formula whitelist ngay khi nhập → 422) · approve human-in-the-loop (draft→active, chống lặp 409) · **update formula = version mới immutable** (bản cũ giữ cho recompute lịch sử — explainable).
- **Scorecard API:** create · validate-weights (Σ=100±0.01, lệch → 422) · **compute-preview** chạy Scoring Engine end-to-end với ipc_map cấu hình theo `tenant.settings` (KHÔNG ghi DB — công cụ B1 kiểm tra cấu hình).
- **Strategy cascade:** OKR→KGI→Goal với ràng buộc tầng chặt (KGI con OKR; goal chỉ gắn KGI) · cây lineage `GET /objectives/:id/cascade` · **health roll-up trọng số** cùng transaction + advisory lock chống race · status tự chuyển active/at_risk/off_track.
- **Evidence Hub:** manual create → verify/reject human-in-the-loop · **bulk sync idempotent** theo (source, external_id) — connector pipeline TDD §10.1, fallback CSV/ETL như giả định đã chốt; evidence đã verified bị nguồn ghi đè → tự reset pending (phải duyệt lại).

**Reviewer Agent (SoD) vòng 2 — verdict PASS-WITH-FIXES → đã fix đủ:** F13 (integrity evidence sau duyệt) · F14 (chặn prototype-chain trong formula) · F15 (parser 2 pha AST, `if` short-circuit — guard chia 0 dùng được) · F16 (normalize thang tier — bậc thang 25/22/19/16 của biên bản 24/06 và thang 0–100 cho cùng kết quả) · F17 (advisory lock roll-up) · F18 (endpoint formula versioning) · F20/F21/F25.

**Ticket còn mở (chuyển Phase 2):** F6 **ScopeGuard org_unit/self — BẮT BUỘC đóng đầu Phase 2** (employee hiện sửa được goal người khác trong cùng tenant) · F5 audit cùng transaction trước khi có data rating thật · F9 partial unique index sau soft-delete · F19 mixed-mode weight goal · F22 SoD verify evidence của chính mình · F24 cycle-check khi có endpoint đổi parent.

---

## Phase 2 — Vòng review · **05/07/2026 · HOÀN THÀNH — Reviewer vòng 2: PASS-WITH-FIXES ✅**

> **Verdict vòng 2 (sau khi fix FAIL vòng 1):** toàn bộ 3 BLOCKER + MAJOR đã đóng đúng cách có test chứng minh. 3 MINOR mới: **F41** SoD checkin review (ĐÃ FIX ngay) · **F42** decide chưa kiểm orgUnit session (ticket, sửa cùng subtree matching) · **F43** reviewee đọc được điểm trước khi final — **CẦN CHỦ DỰ ÁN XÁC NHẬN POLICY**: có giấu điểm/nhận xét manager đến khi final không? (mặc định hiện tại: reviewee thấy). Điều kiện phase kế: test đủ 4 nhánh org_unit scope trước khi merge subtree matching. Backlog: evidence `receivedAt` server-side.

**Đã build (commit `5244166` + hardening `5dd56ac`), 91/91 test PASS:**
- **F6 ĐÓNG:** scope enforcement self/org_unit/tenant fail-closed toàn hệ (goal, checkin, review, evidence) — employee hết đọc/sửa dữ liệu người khác.
- **Check-in monthly:** unique (person, cadence, period), periodKey validate theo cadence, goal updates + health roll-up **cùng một transaction**; manager review HITL.
- **Review cycle trọn vòng:** cycle (bắt buộc khung kỳ) → review → self (chỉ reviewee) → manager (SoD tuyệt đối) → **compute-score** (target SERVER-SIDE từ scorecard, KPI system lấy evidence VERIFIED **trong kỳ**, persist snapshot formulaVersion + targetValue) → calibration (rationale ≥10 ký tự, optimistic lock) → **finalize HITL** (rating:approve + conditional update chống race + governance evidence check + audit CÙNG transaction).
- **Export OneOffice:** chỉ review FINAL, reward_map theo tenant.settings.
- **Reviewer Agent vòng 1: FAIL** (3 BLOCKER: reviewee tự bơm điểm F26, lộ rating toàn tenant F27, race lật final F28) → **đã sửa đủ F26–F34, F36–F38, F40 + 8 test mới** → nộp lại vòng 2 (đang chạy).

**Ticket hoãn (đã báo Reviewer):** test nhánh org_unit scope + subtree matching (phase kế) · F39 export khi cycle open (minor) · F19/F22/F24 từ Phase 1.

---

## Phase 3 — Configuration Studio (lát 1+2) · **05/07/2026 · BUILD XONG — 101/101 test PASS, chờ Reviewer**

**Đã build (commit `8108658`) — chuỗi tailor-made ①②④⑦ chạy được E2E:**
- **Config-as-Data (#1):** `config_version` draft→diff→publish→rollback. Publish có SoD runtime check (`config:write ⟂ config:publish` khi tenant bật sod_rule) — vi phạm bị block + **audit incident sống sót rollback** (ghi ngoài tx chính); conditional update chống race; rollback clone brand/rules/task cells với lineage `based_on`.
- **Vai trò SoD mới:** `config_designer` (sửa, KHÔNG publish) ⟂ `config_approver` (publish, KHÔNG sửa) — seed sẵn `designer@`/`approver@` mỗi tenant. Test chứng minh: designer publish → 403, tenant_admin (giữ cả 2) → 409 + incident, approver → OK.
- **① Brand Kit:** PUT theo draft + resolver public `/brand-kit/resolve?tenant=` (theming trước đăng nhập qua SECURITY DEFINER, fallback NHG DS; publish xong tokens mới có hiệu lực — test đổi màu primary #0055AA).
- **② Org Function:** catalog chức năng + gán phòng ban (feed engine).
- **④ Auto-Derivation Engine (trái tim):** rule match (function/role_family/level/grade, wildcard, priority cao thắng) ⇒ kéo theo KPI templates ⇒ validate Σweight=100 ⇒ **preview với reason explainable từng dòng** ⇒ apply ghi scorecard/item/KPI/cascade_link vào DRAFT (KPI sinh ra vẫn `draft` — approve HITL giữ nguyên) ⇒ **không đè manual_override** ⇒ không tự publish.
- **Lineage:** `cascade_link` KPI ▸ Task Cell ghi tự động từ template mapping.

**Chưa build (lát 3+ Phase 3):** Process Designer (⑤) · Integration Hub Notion/Planner/CSV (⑥) · MCP server + AI Config Copilot + eval harness (#3/#4/#10) · access_policy Cedar (#2 mới có sod_rule — Cedar engine gắn sau) · FE canvas react-flow.

**Kế tiếp:** chờ Reviewer Phase 3 verdict → fix → Process Designer + Integration Hub (CSV trước, Notion/Planner cần token thật — RED-LINE nếu đẩy data thật).
