# OWNER DIGEST — NHG iPMS

> Kênh async duy nhất giữa Fable 5 (iPMS Chief Builder) và chủ dự án.
> Mỗi mục: quyết định đã tự chốt · giả định · tác động · trạng thái review.

---

## ❓ CHỜ CHỦ DỰ ÁN PHẢN HỒI (không chặn — có mặc định)
- **[10/07/2026] F107 — "KPI thật" nghĩa là gì trong hard-block Q1?** Hiện `assertKpiRefExists` chấp nhận **mọi kpi_template đã tồn tại** (20 dictionary + KPI do BU tự đề xuất & đã publish qua gate 4f). Cách này KHÔNG chặn luồng BU-authored KPI hợp lệ. Nếu anh muốn **siết chỉ 20 dictionary** (isDictionary=true), báo để đổi 1 dòng. *Mặc định giữ: mọi KPI đã tồn tại.*

---

## Module Từ điển Tác vụ hoàn thiện — **[10/07/2026] Kế hoạch DUYỆT + đang build tuần tự 4h→4l**
- Spec: `02-dac-ta/NHG_iPMS_Spec_Task_Dictionary_Hoan_Thien.md`. Nguồn: `gg-io-nhg/` (815 tác vụ + 20 KPI chuẩn).
- **Chủ dự án CHỐT:** ① build tuần tự 4h→4l (dừng báo cáo sau mỗi lát) · ② **Q1 = CHẶN CỨNG** (tác vụ phải gắn KPI thật mới active/canonical).
- **3 năng lực MỚI (khác BU Authoring Gate 4f/4g):** A. trưởng phòng ủy quyền soạn cho nhân viên · B. trưởng phòng là cổng duyệt active của phòng mình · C. vòng lặp tối ưu liên tục (active→góp ý→reopen→sửa→duyệt→active v+1, lưu lịch sử).

### Lát 4h — Từ điển KPI chuẩn + hard-block gắn KPI · **10/07/2026 · HOÀN THÀNH — Reviewer verdict PASS, 229/229 test**
- **20 KPI chuẩn** trích từ Semantic Dictionary → `packages/db/src/kpi-dictionary.data.ts` (code/domain/definition/formula/grain/classification/source/ai-boundary) → seed vào kpi_template (isDictionary=true, method=system, idempotent). Migration mở rộng kpi_template + metadata + is_dictionary + index.
- **Hard-block Q1:** `CellPayload.kpiRef` (link KPI có sẵn) + `resolveKpiRef` (kpi.code ?? kpiRef) + `assertKpiRefExists` (422 nếu thiếu/treo/soft-deleted/cross-tenant). Wire vào **canonical publish** (assert cell.kpiRef cuối cùng SAU merge/create/tạo-KPI) + **import as_canonical** (assert mỗi row, 1 row treo → rollback cả run). **as_local KHÔNG bắt buộc** (bản nháp version, active sau khi bổ sung KPI).
- **GET /kpi-dictionary** (kpi:read, lọc ?domain) — nguồn gắn KPI cho FE.
- Reviewer SoD **PASS** (không blocker): xác nhận 2 đường vào canonical đều gated, không đường nào để cell canonical có kpiRef null/treo. Ghi chú: **F108** (active-transition qua config publish của cell version-scoped — enforce ở **lát 4k**, đã đưa vào checklist spec) · F107 (câu hỏi ngữ nghĩa ở trên) · F110 (import as_canonical không tạo KPI mới — phải có KPI trước).
- Test: 229/229 PASS (103 unit + 126 integration; +12 test mới: resolve-kpi 5, kpi-dictionary 7). Sửa library.spec cellPayload gắn KPI dictionary mặc định (phản ánh rule mới: mọi cell canonical đều có KPI).

---

## RED-LINE chờ duyệt
1. **[05/07/2026] Anthropic API key + budget cho ai-gateway** — lát 4 Phase 3 (MCP server, AI Config Copilot, eval harness) và 11 AI agent cần gọi Claude API = **chi tiền thật**. Chờ chủ dự án cấp key + trần budget/tháng (đề xuất: dev/staging cap $50/tháng, model Haiku/Sonnet). *Cập nhật 08/07: khung ai-gateway + MCP + eval ĐÃ build xong trên mock (lát 4a) — khi có key chỉ cần cài SDK, implement `AnthropicLlmClient`, bật flag `ai_gateway_live`.*
2. **[05/07/2026] Token Notion/Microsoft Graph (Planner)** — connector 2 chiều cần integration token thật + đẩy dữ liệu ra hệ ngoài. Dev sẽ dùng mock connector; chỉ nối thật khi chủ dự án cấp token sandbox/workspace test.

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

## Phase 3 — Configuration Studio (lát 1+2) · **05/07/2026 · HOÀN THIỆN — Reviewer PASS-WITH-FIXES → đã fix F44–F54, 103/103 PASS**

> **Verdict Reviewer Phase 3:** kiến trúc đúng spec; 6 MAJOR đã fix đủ: F44 (RLS kpi_template — app từng ghi được global rows qua kẽ hở policy OR, đã thu hẹp FOR SELECT + test chứng minh) · F45 (double-apply nhân đôi scorecard/lineage — re-check tại apply + dedup + test 2 run) · F46 (applied flag nói dối — chỉ mark result thực ghi, trả skipped[]) · F47 (rollback rơi 11 cột task_cell — clone đủ + requires_rederive tường minh) · F48 (SoD race window — check vào trong tx publish) · F49 (nuốt position khác grade — group thêm grade + lineage đủ mọi position). MINOR F50–F53 cũng đã fix (reuse KPI explainable, search_path pinning, org-function dedup, **SoD rule seed mặc định mọi tenant — fail-closed từ đầu**). Ticket còn: throttle/cache resolver public (F51 phần còn lại) · recordChange retry P2002.

**Đã build (commit `8108658`) — chuỗi tailor-made ①②④⑦ chạy được E2E:**
- **Config-as-Data (#1):** `config_version` draft→diff→publish→rollback. Publish có SoD runtime check (`config:write ⟂ config:publish` khi tenant bật sod_rule) — vi phạm bị block + **audit incident sống sót rollback** (ghi ngoài tx chính); conditional update chống race; rollback clone brand/rules/task cells với lineage `based_on`.
- **Vai trò SoD mới:** `config_designer` (sửa, KHÔNG publish) ⟂ `config_approver` (publish, KHÔNG sửa) — seed sẵn `designer@`/`approver@` mỗi tenant. Test chứng minh: designer publish → 403, tenant_admin (giữ cả 2) → 409 + incident, approver → OK.
- **① Brand Kit:** PUT theo draft + resolver public `/brand-kit/resolve?tenant=` (theming trước đăng nhập qua SECURITY DEFINER, fallback NHG DS; publish xong tokens mới có hiệu lực — test đổi màu primary #0055AA).
- **② Org Function:** catalog chức năng + gán phòng ban (feed engine).
- **④ Auto-Derivation Engine (trái tim):** rule match (function/role_family/level/grade, wildcard, priority cao thắng) ⇒ kéo theo KPI templates ⇒ validate Σweight=100 ⇒ **preview với reason explainable từng dòng** ⇒ apply ghi scorecard/item/KPI/cascade_link vào DRAFT (KPI sinh ra vẫn `draft` — approve HITL giữ nguyên) ⇒ **không đè manual_override** ⇒ không tự publish.
- **Lineage:** `cascade_link` KPI ▸ Task Cell ghi tự động từ template mapping.

**Lát 3 XONG (commit `1cafd0c`, 111/111 PASS):**
- **⑤ Process Designer:** process (version-scoped, chỉ sửa trên draft) → steps (5 loại, seq unique) → edges (validate, chặn self-loop) → **generate-cells**: step type=task sinh Task Cell đủ 7 nhóm thuộc tính từ step.config, mã `<PROCESS>-Snn`, idempotent — khép mạch *quy trình kéo–thả ⇒ Task Cell ⇒ Derivation Engine kéo theo KPI*.
- **⑥ Integration Hub (lát CSV/ETL — fallback đã chốt):** data_contract validate per-row (lỗi vào failed[], không chặn batch) · integration_run stats success/partial/failed · outbox_event pending (dispatcher BullMQ lát sau) · connection không nhận token thô (authRef → Key Vault) · idempotent theo (source, external_id).

**Chưa build (lát 4+):** Notion/MS Planner connector 2 chiều (**cần token thật — sẽ dừng ở RED-LINE nếu đẩy data thật ra ngoài; dev dùng mock trước**) · outbox dispatcher BullMQ · MCP server + AI Config Copilot + eval harness (#3/#4/#10 — cần dựng app ai-gateway + Claude API key: **chi phí API = RED-LINE chờ chủ dự án cấp key/budget**) · Cedar access_policy · FE canvas react-flow · morning-todos job.

---

## Phase 3 — Lát 4a: bộ ba AI (ai-gateway mock + MCP server + eval harness) · **08/07/2026 · HOÀN THÀNH — Reviewer PASS-WITH-FIXES → đã fix F55–F57, 139/139 PASS**

> **Verdict Reviewer (SoD):** PASS-WITH-FIXES — 0 BLOCKER/MAJOR, 6 MINOR. Bất biến cốt lõi giữ vững: RED-LINE fail-closed về mock, RLS chuẩn F44, HITL không lách được, race F28, prototype-chain F14. Đã fix ngay: **F55** (canonical min-permission per handler trong CODE — tenant override mcp_tool không hạ được gate) · **F56** (partial unique index chặn 2 row global trùng tên tool) · **F57** (trần 10K ký tự input regex/contains — chặn ReDoS) + 2 test HITL bổ sung (propose/accept vào version PUBLISHED → 409). Ticket nợ: **F58** (eval run kẹt `running` nếu process chết — cần job dọn) · **F59** (ai_interaction log full prompt/context — cần hook khử PII TRƯỚC khi bật client thật) · **F60** (chưa cap kích thước JSON case/args).

**Đã build (không chi tiền — toàn mock, RED-LINE giữ nguyên):**
- **Schema 7 bảng mới + RLS:** `mcp_tool` (registry, global+tenant override, F44 SELECT⟂WRITE) · `ai_interaction` (log mọi lượt gọi AI — **APPEND-ONLY trigger như audit_log**, chặn cả owner) · `ai_suggestion` (đề xuất AI chờ duyệt) · `ai_eval_suite/case/run/result`. Permission mới `ai:invoke`/`ai:eval` (config_designer có, approver/employee KHÔNG — SoD giữ).
- **ai-gateway:** interface `LlmClient` + **`MockLlmClient` TẤT ĐỊNH** (FNV-1a seed — cùng input ⇒ cùng output byte-một-byte, cost=0) + `AnthropicLlmClient` stub ném NotImplemented. Backend chọn qua `selectLlmBackend` (pure): chỉ 'anthropic' khi flag `ai_gateway_live` ON **và** có API key — mọi trường hợp khác fail-closed về mock. Flag seed OFF. Mọi lượt gọi ghi `ai_interaction` (kể cả error/blocked).
- **MCP server (#3):** registry 6 tool seed (`ipms.get_org/get_kpi/get_scorecard/get_task_dictionary` read-only + `ipms.propose_org_change/propose_derivation_rule`), transport HTTP nội bộ shape tương thích MCP (adapter stdio mount 1:1 sau). **Guard 2 lớp fail-closed:** endpoint `ai:invoke` + per-tool `scope_permission` + [F55] canonical min-permission trong code. **HITL tuyệt đối:** propose_* KHÔNG chạm nghiệp vụ — chỉ tạo `ai_suggestion` pending; accept (config:write) materialize vào `config_change` của DRAFT (conditional update chống double-accept F28) — vẫn đi tiếp vòng publish SoD.
- **AI eval harness (#10):** suite/case với assertions cứng (`equals/contains/regex/exists`, dot-path chặn prototype-chain F14, regex hỏng/case không assertion ⇒ fail-closed); runner chạy qua ai-gateway mock ⇒ **tất định, gắn CI được** (test chứng minh: 2 lần chạy cùng summary + score). GET run trả kết quả + judge details explainable.
- **Test: 139/139 PASS** (59 unit + 80 integration) — 28 test mới: guard 2 lớp, tenant override thắng global, HITL không chạm org + không lách vào published, double-accept 409, append-only, cô lập T2, RED-LINE flag OFF + tổng cost=0.

**Sửa môi trường (phát hiện khi verify baseline):** bản copy folder OneDrive làm mất `.env` (gitignored) → integration fail toàn bộ. Đã tái tạo `.env` từ example + thêm default DB dev-only vào `test/setup-env.ts` (chỉ áp khi biến chưa set — CI override được).

**Còn lại Phase 3 (lát 4b+):** outbox dispatcher BullMQ · Cedar access_policy · Notion/Planner mock connector · FE canvas react-flow · morning-todos job · ticket F42/F43 (policy chờ user) / F58–F60 / throttle resolver.

---

## Phase 3 — Lát 4b: outbox dispatcher + mock connector + morning-todos · **08/07/2026 · HOÀN THÀNH — Reviewer PASS-WITH-FIXES → đã fix F61–F63+F67, 146/146 PASS**

> **Verdict Reviewer (SoD):** PASS-WITH-FIXES — 0 BLOCKER, 2 MAJOR (đã fix trước commit): **F61** (BullMQ jobId cố định thiếu removeOnFail → tenant kẹt notify vĩnh viễn sau 1 job fail — đã thêm removeOnFail) · **F62** (2 dispatch song song double-push — đã thêm CLAIM pending→processing conditional update + recovery event kẹt processing >10'). MINOR đã fix luôn: **F63** (lọc connection.status='active') · **F67** (run song song cùng ngày → P2002 đếm skipped thay vì fail run; bỏ kéo fullName thừa). **Ticket nợ: F64** (cap F60 vòng qua được một phần — nên cap tổng JSON/case + đo bytes) · **F65** (event không binding → skipped vĩnh viễn, không replay — tradeoff ghi nhận) · **F66** (test cleanup phá state dev DB dùng chung — nên scope theo uniq).

**Đã build (không token thật — mock connector, RED-LINE #2 giữ nguyên):**
- **Connector SDK + mock:** interface `Connector` (push/pull idempotent theo externalId) + `MockConnector` in-memory **cô lập theo tenant trong key store** (provider:tenantId:workspace), etag tất định theo nội dung, tiêm lỗi qua `target.failMode` để test retry. Registry: notion/ms_planner/ms_todo = mock; provider lạ → NotImplemented tường minh.
- **Outbox dispatcher (#6):** đọc outbox_event PENDING per-tenant (RLS giữ nguyên, không cross-tenant) → đẩy tới binding outbound khớp `syncPolicy.events` → sync_record idempotent → `dispatched`. Lỗi → retry_count++, **quá 5 lần → dead-letter**. Event không binding khớp → skipped. **CLAIM chống double-push (F62)** + BullMQ worker env-gated `ENABLE_OUTBOX_WORKER` (test/CI không cần Redis; debounce notify theo tenant sau importCsv).
- **Morning-todos job (master prompt ⑥):** binding `local_type='morning_todos'` → goal active/at_risk/off_track → todo `Check-in: <goal>` đẩy hệ ngoài (mock), **idempotent theo (binding, todo-<date>-<goalId>)** — chạy lại cùng ngày không nhân đôi; chỉ đẩy employeeCode (ẩn danh, không PII thừa). Endpoint `POST /integrations/jobs/morning-todos/run` (integration:run).
- **Endpoint mới:** `POST /integrations/bindings` (integration:bind) · `POST /integrations/outbox/dispatch` (integration:run).
- **Trả nợ lát 4a:** **F58** (eval run kết thúc `error` thay vì kẹt `running` khi lỗi ngoài per-case) · **F60** (cap: mcp args 16KB, eval prompt 4000, context 8KB, ≤20 assertions/case).
- **Test: 146/146 PASS** (59 unit + 87 integration; chạy 2 lần liên tiếp đều xanh — spec tự dọn state). Dep mới: bullmq (msgpackr-extract native tắt build — JS fallback).

**Còn lại Phase 3 (lát 4c+):** Cedar access_policy (#2) · FE canvas react-flow · connector Notion/Planner THẬT (chờ token — RED-LINE) · AI Config Copilot end-to-end khi có API key · ticket F42/F43 (policy chờ user) / F55-phần còn lại khi mở endpoint quản trị mcp_tool / F59 (khử PII log trước khi bật client thật) / F64–F66 / throttle resolver.

---

## Phase 3 — Lát 4c: Policy-as-Code Cedar (#2) + trả nợ F64–F66 · **09/07/2026 · HOÀN THÀNH — Reviewer PASS-WITH-FIXES → đã fix F68–F72, 180/180 PASS**

> **Verdict Reviewer (SoD):** PASS-WITH-FIXES — 0 BLOCKER, 1 MAJOR (**F68** policy forbid `config:publish` có thể TỰ KHOÁ tenant vĩnh viễn — đã fix: `@PolicyExempt` van an toàn cho đúng 3 endpoint quản trị policy list/get/**disable**, RBAC vẫn gác; create/update/activate/test KHÔNG miễn trừ; có test chứng minh lockout → vẫn disable được). MINOR đã fix luôn: **F69** (PATCH policy global → 409 rõ nghĩa thay vì 404 nhiễu) · **F71** (unique tenant partial theo deleted_at — đồng bộ chuẩn F56) · **F72** (DB CHECK engine='cedar' — chặn row engine lạ bị filter âm thầm bỏ qua = forbid biến mất) · một phần **F70** (trần 50 policy active/tenant). **Ticket nợ F70-còn lại:** cache PolicyGuard in-memory per-instance TTL 15s — multi-replica prod có cửa sổ stale sau activate/disable; khi scale ngang cần Redis pub/sub invalidation (đơn instance hiện tại OK).

**Đã build — engine Cedar THẬT (`@cedar-policy/cedar-wasm` 4.11.2, wasm chính thức, chạy offline/tất định, không chi tiền):**
- **Schema:** bảng `access_policy` (tenant_id NULL = global/B3; policy_text Cedar; scope action-prefix; `tests` jsonb bộ test allow/deny; status draft→active→disabled) + RLS chuẩn F44 (SELECT thấy global, app KHÔNG ghi được row global) + partial unique F56/F71 + CHECK engine F72.
- **`cedar.engine.ts` (pure):** ngữ nghĩa **GUARDRAIL** — baseline `permit` đại diện "RBAC đã cho phép", policy tenant chỉ THU HẸP bằng `forbid` (forbid-overrides-permit là bất biến Cedar), permit tenant viết thêm vô hại (không mở rộng quyền — PolicyGuard chỉ chạy SAU khi RBAC allow). **FAIL-CLOSED 3 nhánh:** wasm throw / answer failure / `diagnostics.errors` (Cedar "error-and-skip" làm forbid lỗi eval âm thầm biến mất ⇒ ta deny). `deniedBy` map thẳng id row DB — explainable.
- **PolicyGuard** = tầng 4 pipeline `Jwt → Tenant → Permission(RBAC) → Policy(ABAC)`: đánh giá trên principal attrs (email/permissions/scopeTypes/personId) + action (permission đang yêu cầu) + context (method/path); deny → 403 + audit `policy.denied` (đủ policy id + permission); không có policy active trong scope → cho qua. Cache per-tenant TTL 15s (env `POLICY_CACHE_TTL_MS`, test = 0), invalidate khi mutation.
- **API `/policies`:** CRUD (validate Cedar tại cửa: cú pháp + đúng 1 static policy/row, cấm template; chỉ sửa draft) · `POST :id/test` chạy bộ test allow/deny + case ad-hoc (CI được — chống hồi quy phân quyền) · `POST :id/activate` (config:publish) với **quality gate fail-closed**: ≥1 test + RE-RUN toàn bộ tại thời điểm activate TRONG tx + không case nào lỗi eval + SoD write⟂publish (chuẩn F48, incident sống sót rollback) + conditional version (F28) · `POST :id/disable`.
- **Trả nợ:** **F64** (cap theo BYTES: eval case tổng 32KB, context 8KB, mcp args 16KB, suite ≤100 case) · **F65** (`POST /integrations/outbox/replay` — skipped/dead → pending, reset retry, eventIds đích danh, whitelist status) · **F66** (cleanup spec outbox scope theo pattern của chính spec — không phá state dev DB).
- **Test: 180/180 PASS** (81 unit + 99 integration; chạy 2 lần đều xanh). 35 test mới: ngữ nghĩa guardrail, fail-closed eval error (kể cả admin bị deny trong scope hỏng — đúng chủ đích), SoD activate 409 + incident, draft không hiệu lực, policy global hiệu lực nhưng tenant không quản trị được, cô lập T2, lockout F68, replay F65.

**Giả định mặc định đã dùng:** ① ABAC ở tầng GUARD (action=permission, chưa per-resource attrs — policy theo resource cụ thể sẽ thêm khi có nhu cầu, cắm vào assertScope) ② policy do `config_designer` soạn / `config_approver` kích hoạt (reuse config:write⟂config:publish + SoD rule sẵn có, không thêm permission mới) ③ policy KHÔNG version-scoped theo config_version (vòng đời riêng draft→active→disabled như spec DDL) ④ sự cố khoá toàn tenant do policy global hỏng: khắc phục tầng owner/B3 (runbook: xoá/sửa row `access_policy` global).

**Còn lại Phase 3:** FE canvas react-flow · connector Notion/Planner THẬT (RED-LINE chờ token) · AI Config Copilot khi có key · ticket F42/F43 (chờ user) / F55-còn lại / F59 / F70-còn lại / throttle resolver.

---

## Phase 3 — Lát 4d: FE canvas react-flow (Configuration Studio UI) + backend hỗ trợ · **09/07/2026 · HOÀN THÀNH — Reviewer PASS-WITH-FIXES → đã fix F73–F78+F80/F81, 187/187 PASS**

> **Verdict Reviewer (SoD):** PASS-WITH-FIXES — 0 BLOCKER, 1 MAJOR (**F73** DTO `edges` khai `@IsObject` nhưng GET trả mảng → round-trip GET→PUT sẽ 400; đã fix `@IsArray` + test round-trip). Đã fix luôn: **F74** (validate UUID query tại cửa — hết 500 khi refId rác) · **F75** (upsert race: catch P2002 → update, unique constraint đỡ data) · **F77** (chuẩn hoá pos chỉ giữ {x,y} — strip key thừa) · **F78** (FE: nối edge/thêm bước không reset vị trí node đang kéo chưa lưu) · **F80** (CORS default dev KHÔNG bao giờ bật ở NODE_ENV=production kể cả ALLOW_DEV_TOKEN đặt nhầm) · **F81** (dotenv quiet). **Backlog:** F76 (canvas_layout chưa optimistic-lock — chấp nhận vì thuần bố cục hiển thị) · F79 (token sessionStorage — chuyển httpOnly/BFF khi lên OIDC Entra; form dev-login ship trong prod bundle nhưng BE gate 403) · F82 (lọc Task Cell theo prefix client-side → API filter theo processId lát sau).

**FE (05-build/web — LẦN ĐẦU nối backend thật, dep mới `reactflow`):** khu `/studio` 3 màn:
- **Login gate dev** (`lib/api.ts` + `lib/studio.tsx` + `studio/layout.tsx`): dev-token → session ở sessionStorage (hết khi đóng tab), quick-login designer@/approver@/admin@ theo seed; production thay bằng OIDC Entra.
- **Config Versions + Publish bar** (`/studio`): tạo draft → chọn version làm việc → diff summary → publish (hiển thị đúng lỗi SoD 403/409 từ API) → rollback.
- **⑤ Process Designer** (`/studio/process`, react-flow): node = step (màu theo 5 loại), kéo–thả vị trí → PUT canvas-layout, nối node → POST edges (validate BE: chặn self-loop…), thêm bước, panel thuộc tính step, nút **Sinh Task Cell** → bảng cell `<PROCESS>-Snn` kèm mã KPI.
- **② Org Designer** (`/studio/org`, react-flow): graph cây tổ chức (edge cha–con, không nối tay), tạo đơn vị (code/tên/cấp/trực thuộc), kéo–thả layout lưu per-tenant, fallback tree layout BFS (chịu được org data có cycle).
- Sidebar nhóm "Configuration Studio" + i18n VI/EN + light/dark theo NHG DS (bất biến giữ nguyên).

**Backend:** bảng `canvas_layout` (kind org|process CHECK tầng DB, unique (tenant,kind,ref), RLS tenant-bound, thuần bố cục hiển thị — KHÔNG đi qua config_change/publish) · `GET /canvas-layout` (config:read) + `PUT /canvas-layout/org|process` (permission per-kind org:design/process:design fail-closed; org ref = chính tenant; cap 64KB bytes chuẩn F64) · `GET /task-cells` + `/:code` (taskcell:read, filter bắt buộc — chặn dump) · **CORS fail-closed** (chỉ bật khi CORS_ORIGINS set, hoặc dev-default localhost khi ALLOW_DEV_TOKEN + non-production) · **fix nền: API chưa từng nạp `.env`** (trước giờ dev-token/CORS chết khi chạy `pnpm api:dev` — thêm `dotenv/config` đầu main.ts, không override env platform).

**Kiểm chứng:** 187/187 PASS (81 unit + 106 integration, thêm canvas-layout.spec 7 test) · `npm run build` web pass (3 route studio) · **E2E smoke qua HTTP pass trọn mạch**: dev-token → tạo version → process → step → PUT layout → generate-cells → GET task-cells (`SMK-S01`) · CORS header xác nhận đúng origin :3001.

**Sự cố dev đã xử lý:** trang trắng /studio = dev server :3001 cũ (chạy từ trước khi cài reactflow) — kill + xoá `.next` (OneDrive giữ file gây EINVAL readlink) + start lại là hết. Dev flow chuẩn: `pnpm api:dev` (API :4000) + `cd web && npx next dev -p 3001`.

**Còn lại Phase 3:** Studio lát kế (gán org_function kéo–thả, Derivation preview UI bảng diff+reason, Brand Kit editor, field-mapping Integration) · connector thật + Copilot (RED-LINE chờ token/key) · ticket F42/F43 (chờ user) / F55-còn lại / F59 / F70-còn lại / F76/F79/F82 / throttle resolver.

---

## Phase 3 — Lát 4e: Studio UI phần 2 (org_function · Derivation UI · Brand Kit editor) · **09/07/2026 · HOÀN THÀNH — Reviewer PASS-WITH-FIXES → đã fix F83–F84, F87–F89, 189/189 PASS**

> **Verdict Reviewer (SoD):** PASS-WITH-FIXES — 0 BLOCKER, 1 MAJOR (**F83**: BE nhận brand tokens tự do trong khi whitelist chỉ ở FE — resolver `/brand-kit/resolve` là PUBLIC nên token độc hại `url(http://attacker/px)` sau publish sẽ phát tán cho mọi client (CSS beacon/exfil). Đã fix: **validate tại BE** — whitelist 6 key `--nhg-*` + value bắt buộc là màu (#hex/rgb/hsl), 422 tại cửa; chuẩn hoá luôn shape tokens = CSS custom properties PHẲNG (spec cũ dùng nested `{color:{primary}}` → đã đổi spec test theo shape chuẩn §13). Đã fix thêm: **F84** (FE chặn weight NaN tại chỗ nhập) · **F87** (test: approver SoD chiều dương, T2 cô lập functions, brand round-trip + token 422, F88/F89) · **F88** (GET /derivation-rules validate uuid — hết đường "trả hết rules" khi thiếu param) · **F89** (displayName "" = xoá tên, hết kẹt tên cũ vĩnh viễn). **Backlog:** F85 (GET functions không check unit tồn tại — bất đối xứng với PUT, chấp nhận) · F86 (PUT functions replace-all last-write-wins + chưa preserve weight — UI cột weight lát sau).

**FE (05-build/web — 2 trang mới + 1 panel), khép mạch tailor-made ①②④ trên UI:**
- **② Org Designer + panel "Chức năng của đơn vị":** catalog org_function (tạo mới inline) + checkbox gán cho đơn vị đang chọn → PUT replace-all — feed trực tiếp Derivation Engine.
- **④ `/studio/derivation` — Derivation Engine UI:** thư viện KPI template (list global+tenant, tạo nhanh với functionTags/taskCellRefs) · rules version-scoped (tạo match function/role/level/grade + emit templates/weight/nhóm — nhập csv thân thiện) · **Chạy preview → bảng diff kèm cột "Vì sao" (reason explainable từ engine)** + summary add/keep/error · **Apply vào draft** (double-gate: FE disable khi có error + BE 422; publish vẫn là bước SoD riêng).
- **① `/studio/brand` — Brand Kit editor:** displayName + 3 token màu (color picker), lưu vào draft (mustGetDraft), **preview trực tiếp** áp CSS custom properties lên khối mẫu; publish xong resolver public mới trả token mới.
- Sidebar 5 mục Studio, i18n VI/EN đủ.

**Backend (3 GET read-only mới):** `GET /brand-kit?configVersionId` (config:read — editor đọc draft) · `GET /kpi-templates` (config:read — RLS trả global+tenant) · `GET /org-units/:id/functions` (org:design — pre-check checkbox). Tất cả validate uuid tại cửa (chuẩn F74).

**Kiểm chứng:** 189/189 PASS (81 unit + 108 integration) · web build pass (5 route studio).

**Còn lại Phase 3:** field-mapping Integration UI + BU Authoring Gate UI (lát sau) · connector thật + Copilot (RED-LINE chờ token/key) · ticket F42/F43 (chờ user) / F55-còn lại / F59 / F70-còn lại / F76/F79/F82/F85/F86 / throttle resolver.

---

## Phase 3 — Lát 4f: BU Authoring Gate backend (thư viện 3 tầng + import §6.5) · **09/07/2026 · HOÀN THÀNH — Reviewer PASS-WITH-FIXES → đã fix F90–F96+F100, 217/217 PASS**

> **Verdict Reviewer (SoD):** PASS-WITH-FIXES — 0 BLOCKER, 4 MAJOR đều ở KÊNH IMPORT & ngõ cụt trạng thái, đã fix đủ: **F90** (as_local apply không re-check version → ghi được vào version ĐÃ PUBLISHED giữa preview→apply; fix re-check + set run failed NGOÀI tx — ghi trong tx rồi throw bị rollback cuốn mất, đúng bài học F48) · **F91** (import as_canonical lách sod_rule taskcell:author⟂library:publish — admin giữ mọi quyền đi vòng curation; fix áp CÙNG check SoD ở cả preview lẫn apply + incident, test admin 409) · **F92** (as_submission bỏ qua dedup scan → curator nhận "0 pending" giả + import không mang scope org_unit; fix chạy scanDedup per-contribution + orgUnitId bắt buộc với importer scoped) · **F93** (trạng thái approved là NGÕ CỤT khi publish fail — 3 kịch bản: KPI thuần thiếu code / keep_both không đổi mã / merge-target bị deprecate; fix: gate đòi kpi.code cho type kpi, approve check clash mã sớm, request_changes/reject được từ approved, dedup re-resolve được). MINOR fix luôn: **F94** (update conditional F28) · **F95** (curator không soi được draft local của BU — đúng spec §3) · **F96** (comment không stamp curatorId, comment của tác giả không kích transition) · **F100** (seed tự đồng bộ scope role khi thiết kế đổi — hết phải sửa tay SQL). **Backlog:** F97 (dedup O(N) — cần name_normalized index khi thư viện 10k+) · F98 (FK + validate orgUnitId thuộc tenant cho user tenant-scope) · F99 (cap 500×16KB không đạt được vì body-parser 100KB — hạ kỳ vọng hoặc nâng limit riêng route import khi nạp Task Architecture 372) · F101 (kpi_template unique chưa partial theo deleted_at) · F102 (contribution.taskCellId chưa set khi publish).

**Đã build (Spec_BU_Authoring_Gate build-order §11 bước 1–3 + import §6.5):**
- **DDL:** task_cell + origin/lib_scope/contributed_by/canonical_id/usage_count (CHECK + **partial unique canonical** (tenant,code) WHERE config_version_id IS NULL — canonical cell nằm NGOÀI version, làm nguồn phát cho Derivation Engine) · kpi_template + origin/lib_scope/contributed_by · 5 bảng mới `library_contribution/review/dedup_candidate/template/import_run` (RLS tenant-bound; template chuẩn F44 global-read).
- **Vai trò & SoD:** 8 permission mới · role `bu_author` (SCOPE ORG_UNIT) ⟂ `library_curator` · seed author@/curator@ mỗi tenant · sod_rule `taskcell:author ⟂ library:publish` mặc định bật. **SoD 2 lớp:** bất biến "không tự duyệt bài mình" (chặn cả admin giữ mọi quyền, kể cả tenant tắt rule — test chứng minh + incident audit) + sod_rule runtime.
- **Quality gate (pure, explainable):** tập bắt buộc 7 nhóm (A mã đúng hệ+tên · B RACI đủ R+A · C ≥1 input+output · D ≥1 measure · E mức AI) + KPI hợp lệ (method/direction; system→dataSource; kpi thuần→code); ok = ALL pass; score % + report từng check lưu vào contribution.
- **Vòng đời:** draft → submit (re-gate + **dedup scan** exact-code/normalized-name-bỏ-dấu vs canonical) → curator review (approve chặn khi gate fail / dedup pending / clash mã) → **publish canonical** (merge = bổ sung field thiếu vào cell sẵn có; keep_both = cell mới trỏ canonical_id; kpi_template upsert theo mã — nhiều cell trỏ 1 KPI hợp lệ, chỉ nối thêm lineage taskCellRefs) → deprecate. Author chỉ thấy của mình; curator thấy queue (không thấy draft local).
- **Import §6.5 (3 kênh nạp):** template pack (curator phát hành) + `POST /library/import` preview (validate per-row qua gate → invalid[] không chặn batch; diff add/update/invalid + stats; KHÔNG ghi) → apply (claim F28 — mỗi preview apply đúng 1 lần; **idempotent upsert theo mã** — chạy lại không nhân bản, test chứng minh) × 3 mode: as_local (vào draft version) / as_submission (vào hàng đợi curation, có dedup + scope) / as_canonical (chỉ `library:import:canonical` + SoD — kênh nạp **Task Architecture 372** làm canonical seed).
- **Test: 217/217 PASS** (98 unit + 119 integration; 28 test mới cho gate + vòng đời + SoD + dedup + import).

**Còn lại Phase 3:** Task Cell Studio UI + Curation Queue UI (FE của gate này) · field-mapping Integration UI · Dedup/Drafting Agent (bước 4–5 spec — chờ AI key thì chạy thật, mock được ngay) · connector thật + Copilot (RED-LINE) · ticket F42/F43 / F55 / F59 / F70 / F76/F79/F82/F85/F86 / F97–F102 / throttle resolver.

---

## Phase 3 — Lát 4g: FE BU Authoring Gate (Task Cell Studio + Curation Queue) · **10/07/2026 · HOÀN THÀNH — Reviewer PASS-WITH-FIXES → đã fix F103/F104/F106, web build pass**

> **Verdict Reviewer (SoD):** PASS-WITH-FIXES — không lỗi hợp đồng API (đối chiếu field-by-field với BE lát 4f: khớp hết). **F103 MEDIUM** (vòng needs_changes cụt trong UI — author không sửa được contribution, resubmit nguyên bản cũ hoặc tạo bản mới tự đấu dedup với chính mình; đã fix: nút **Sửa** nạp payload vào form → PATCH, BE tự quay draft + re-gate) · **F104** (nút review hiện cả ở trạng thái BE sẽ 409 — đã gate theo transition) · **F106** (render "undefined" với payload dị dạng — đã `?? "—"`). **F105 giữ chủ đích:** cho phép lưu draft fail gate (report explainable chỉ ra ngay) — không chặn sớm ở form.

**Đã build (2 trang FE, backend không đổi):**
- **`/studio/library` — Task Cell Studio (đăng nhập author@):** form tập bắt buộc 7 nhóm (A mã+tên · B RACI · C I/O csv · D measures csv · E mức AI) + chọn đơn vị scope + **KPI Linker** (method=system hiện ô data_source) → lưu draft → **Quality report explainable** từng check ✓/✗ kèm note → Sửa/Gửi duyệt → xem lịch sử review từ curator.
- **`/studio/curation` — Curation Queue (đăng nhập curator@):** hàng đợi submitted/in_review (lọc trạng thái; KHÔNG thấy draft local của BU — đúng spec §3) → panel chi tiết: gate fails, payload, **dedup candidates với nút merge/keep_both/discard** ("hệ gợi ý, người quyết") → Góp ý / Yêu cầu sửa / Từ chối / **Duyệt** / **Publish canonical** (nút gate theo đúng transition BE).
- LoginCard thêm quick-login author@/curator@; sidebar 7 mục Studio; i18n VI/EN.

**Khép kín trên UI toàn vòng spec:** BU soạn → gate report → submit → curator duyệt (SoD chặn tự duyệt hiển thị trung thực) → publish → thư viện canonical → Derivation Engine kéo theo (trang "Kéo theo KPI" lát 4e dùng được cell/template vừa publish).

**Còn lại Phase 3:** field-mapping Integration UI · Dedup/Drafting Agent (mock được ngay) · connector thật + Copilot (RED-LINE chờ token/key) · ticket tồn: F42/F43 / F55 / F59 / F70 / F76/F79/F82/F85/F86 / F97–F102 / F105 / throttle resolver.
