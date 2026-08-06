# OWNER DIGEST — NHG iPMS

> Kênh async duy nhất giữa Fable 5 (iPMS Chief Builder) và chủ dự án.
> Mỗi mục: quyết định đã tự chốt · giả định · tác động · trạng thái review.

---

## Trục D — "Lớp AI có danh tính" · **05/08/2026 · L0 XONG — danh bạ agent dựng xong, 927/927**

> Kế hoạch L0–L7: `02-dac-ta/NHG_iPMS_Ke_Hoach_Truc_D_Lop_AI_Co_Danh_Tinh.md` (⚠️ `02-dac-ta/` gitignore toàn thư mục — chỉ trên đĩa). Duyệt 05/08. Vé Reviewer từ **F201**. Bất biến **N1–N10** (bỏ `L` vì đụng "Lát", bỏ `M` vì đụng mã module BRD). Baseline `b4570ac` 896/896.

**HAI LỖ TÌM ĐƯỢC KHI ĐỌC MÃ — nền của cả trục, không suy từ tài liệu:**

**① `ai-gateway.service.ts:56` — `scrubbedReq.dataClass ?? 'internal'`.** Người gọi **tự khai** mức nhạy cảm của chính dữ liệu mình đẩy vào LLM, và Egress Policy quyết định chặn/cho đi dựa trên lời khai đó. **Quên khai thì mặc định là mức CHO PHÉP ĐI.** Đây là ảnh phản chiếu LẬT NGƯỢC của K2/`@Exported` (không khai thì không xuất được). Chưa nổ vì `ai_gateway_live` còn TẮT — **ngày cấp khoá API là ngày lỗ này thành đường rò thật.** Vá ở L1.

**② `agent` là chuỗi tự do — ĐO trên DB dev: 397 mã riêng biệt / 14.532 dòng, CHỈ SÁU là thật.** 391 mã còn lại do test đẻ, mỗi lượt chạy mint một "agent" mới nằm lại vĩnh viễn trong bảng append-only (`egress-test-<ts>` ×59 · `anthropic-live-<ts>` ×52 · `inline.test.qualifyB.<ts>` ×53…; riêng `inline.test.readiness` 9.765 lượt — nhiều hơn mọi agent thật cộng lại). Năm bảng khoá theo chính chuỗi đó (`ai_launch_bar`, `ai_agent_model`, `ai_model_qualification`, `ai_eval_suite`, `ai_interaction`) ⇒ **agent không tồn tại thì KHÔNG CÓ BAR NÀO ĐỂ TRƯỢT** — Model-Qualification Gate im lặng cho qua.

**🔴 PHÁT HIỆN THỨ BA (hệ quả của ②, đo được):** báo cáo kinh tế AI 30 ngày gồm 2.993 lượt, **294 lượt là agent bịa**, và **100% chi phí báo cáo ($0,30645) đến TỪ CHÚNG**. `economics.service.ts` chỉ lọc `toolName startsWith 'eval:'` — không bắt được agent bịa. ⇒ **con số PRD §16 dùng để quyết "có bật live không" hiện là số giả hoàn toàn.** Đây là lần thứ BA cùng họ (F163 đếm lượt eval · F191 ghi chú sai về NULL · nay agent bịa). **CỐ Ý KHÔNG vá ở L0:** bộ lọc đúng là *"agent phải có trong danh bạ"*, mà điều đó chỉ thành sự thật được cưỡng chế ở L1 — vá bằng thêm một tiền tố tên nữa là lặp lại chính sai lầm cũ. RED-LINE nguyên vẹn: 0 lượt gọi API thật, chi phí kia do transport GIẢ của `anthropic-live-wiring.spec` sinh.

**✅ L0 XONG** — bảng `ai_agent` (`tenantId NULL` = bản chuẩn tập đoàn, khuôn `data_asset` trục C L0). **Trigger `ai_agent_no_loosen` chặn NĂM chiều nới lỏng**: ① nâng trần phân loại ② thêm quyền ngoài hiến chương ③ thêm nhóm dữ liệu ngoài phạm vi ④ nới HITL ⑤ **tự BẬT agent mà bản chuẩn để `planned`** (chiều dễ bỏ sót nhất — nó vô hiệu hoá cả bốn chiều kia). Kiểm bằng `ipms_owner` (role BỎ QUA RLS) ⇒ chặn ở tầng trigger thật. **CHECK cấp lược đồ: `hitl_mode ∈ {read_only, propose_only}` — KHÔNG giá trị nào cho phép AI ghi thẳng**; muốn có agent tự ghi phải sửa migration có người đọc, không phải truyền chuỗi khác vào cột tự do.

**Hoà giải BRD ⟷ mã, KHÔNG bịa cho khớp** (`packages/db/src/ai-agent-directory.data.ts`): 4/7 agent BRD có mã thật đang chạy · 3/7 chưa có mã ⇒ `planned` · `inline.derivation.rule` **không có trong BRD** nhưng chạy thật 493 lượt ⇒ khai bổ sung, **cần B3 xác nhận khi cập nhật BRD** (không tự sửa BRD từ phía mã) · `mcp` = hạ tầng · `kpi_designer` có PRD riêng + nhánh trong MockLlmClient nhưng **0 caller** ⇒ `planned`. **`eval_harness` CỐ Ý không có trong sổ** — chỉ tồn tại trong một chú thích ví dụ; lượt eval ghi `agent = suite.agent`, nên nó chưa bao giờ là một giá trị `agent` thật. Seed cho "đủ bộ" đúng là kiểu số trông-như-thật mà trục A đã phải xoá bốn khối.

**Hai agent BRD đòi *"Confidential — chỉ mô hình nội bộ"*** (tóm tắt đánh giá · cân chỉnh) để `planned` và **có test đóng đinh không được bật trước L3** — đích hợp lệ cho chúng (self-host) chưa tồn tại; bật sớm làm rỗng nghĩa câu chặn cứng ở `egress-policy.ts:52`.

**NỢ TRẢ Ở L0:** `seed.ts` còn giữ **bản sao tay THỨ BA** của whitelist đóng vai, kèm chú thích biện minh *"`packages/db` không phụ thuộc `@ipms/shared`"* — điều đó **đã hết đúng từ trục C L3**. Chú thích ở lại, bản sao ở lại, và `aiagent:read` làm nó cắn **lần thứ tư** (6 ca `rbac-matrix` đỏ cùng lúc). Nay `support: [...SUPPORT_ROLE_PERMISSIONS]`. Đúng bài học F191: **ghi chú khẳng định sai được đọc như bằng chứng ở mọi lần sửa sau.**

**HAI LẦN TÔI ĐO SAI ĐỐI TƯỢNG trong chính phiên này** (probe psql, rồi test integration) — cùng một chỗ: đòn "nới X" chỉ có nghĩa khi bản chuẩn của agent đó ĐANG chặt về X, mà tôi đánh vào agent bản chuẩn đã mở sẵn. Cả hai lần đều báo "lọt" một lỗ không tồn tại. Lần thứ 5–6 của dự án trong họ **"không chốt mốc trước khi đo"**. Ca test nay dựng nền TỪ chính bản chuẩn để mọi chiều khác đều "bằng".

**VERIFY L0:** **927/927 (67 suite)** — baseline 896/896 (65 suite), đúng +31 ca/+2 suite · typecheck 3 gói sạch · **driver governance trục C 55/55 KHÔNG hồi quy** · **đội đỏ trục C 16/16 KHÔNG hồi quy** · seed idempotent (chạy 3 lần) · cờ `ai_gateway_live` vẫn TẮT.

**✅ L1 XONG 06/08 — 📍 LÁT DỪNG BÁO CÁO. Trần phân loại nay thuộc về AGENT.**

**Đóng đúng dòng `ai-gateway.service.ts:56`.** `LlmRequest.dataClass?` (người gọi tự khai, quên khai = mức cho phép đi) **đã bị GỠ KHỎI HỢP ĐỒNG** — thay bằng `dataAssets: string[]` **bắt buộc**: người gọi khai *tôi chạm nhóm nào*, MỨC do sổ đăng ký dữ liệu (trục C L0) quyết định = **max rank** các nhóm. Không khai ⇒ **chặn**. Có test dùng `@ts-expect-error` gửi kèm `dataClass` để chứng minh không còn đường khai đè.

**Ba cổng, chạy TRƯỚC egress, ở CẢ `complete()` lẫn `stream()`** (bài học `POST /ai/chat`: một đường không qua cổng là đủ vô hiệu cổng): **N1** agent phải tồn tại VÀ đang `active` — `planned` bị chặn, vì *bật một agent là quyết định của chủ dữ liệu, không phải hệ quả của việc có người gọi nó* · **N2** mức suy từ sổ, mã lạ ⇒ chặn · **N3** trần agent + kiểm chéo phạm vi. **N3 độc lập với Egress Policy có chủ đích:** agent trần `internal` chạm `confidential` bị chặn **kể cả khi đích là mock** (không rời máy) — vi phạm hiến chương ≠ vi phạm egress; gộp hai lớp là mất một lớp. Có test đóng đinh đúng ca đó.

**`ai_interaction` +`data_class`/`data_assets`** (Spec §211 khai từ đầu, chưa từng có cột) — ghi **kết quả suy diễn**, không phải lời khai. Cố ý **KHÔNG backfill** 15.365 dòng lịch sử: suy ngược là bịa một con số chưa từng được tính; NULL nói đúng "không biết". Thêm CHECK DDL **`data_class <> 'restricted'`** — tầng thứ ba giữ N6, tầng duy nhất không phụ thuộc mã ứng dụng.

**🔴 VÁ PHÁT HIỆN ③ CỦA L0 — chi phí AI từ $0,30645 (100% giả) → $0,00.** Bộ lọc economics nay là **"agent phải có trong danh bạ"** thay vì đoán tiền tố tên. Báo cáo 30 ngày trước gồm 294 lượt agent bịa, nay **đúng 6 agent đăng ký / 2.695 lượt**. Cùng bản vá áp cho `readiness` (bỏ heuristic `startsWith 'inline.'` — vừa **hụt** vì `config_copilot` không khớp tiền tố nên checklist bỏ sót agent nghiệp vụ thật, vừa **thừa** vì 107 mã `inline.test.*` lọt vào).

**🐞 LỖ TRONG CHÍNH BẢN VÁ CỦA TÔI, DRIVER SỐNG BẮT — JEST KHÔNG:** `readiness()` gộp agent từ **HAI** nguồn (`ai_launch_bar` ∪ `ai_eval_suite`); bản vá đầu chỉ lọc `suites`, để nguyên `bars` ⇒ agent test cũ vẫn hiện qua đường launch bar. **Full suite 940/940 XANH ngay sau bản vá thiếu đó.** Mẫu đáng nhớ: **lọc một nguồn trong khi kết quả gộp từ nhiều nguồn.** Đã thêm ca hồi quy đóng đinh đúng nhánh `bars`.

**KHÔNG NỚI N1 VÌ TEST.** 5 spec bịa mã agent nay **đăng ký agent thật** qua `test/helpers/test-agent.ts` (tiền tố `test.`, dọn ở `afterAll`). Hai cách xử lý và cách chọn nói lên nhiều điều: nới bất biến cho môi trường test là tự huỷ — ngoại lệ nằm đúng nơi ta chứng minh bất biến. Hệ quả phụ đáng giá: mỗi spec đó thành một ca kiểm thêm cho vòng đời danh bạ. **Bản đầu của tôi QUÊN gọi dọn ở `ai-governance-fixes.spec`** ⇒ 4 `test.f159.*` nằm lại sau bốn lượt chạy — đúng loại rác L1 sinh ra để chấm dứt, đã vá.

**Driver sống MỚI `scripts/verify/verify-ai-identity.mjs` — 13/13**, commit như mã nguồn (không lặp lại việc mất driver trục A/B). Chính nó bắt lỗ `bars` ở trên **và** hai lỗi trong chính driver (đường dẫn `/ai/inline/:task` nằm ở URL không ở body; payload phải bọc trong `input.payload`) — loại lỗi typecheck lẫn jest đều không biết.

**VERIFY L1:** **941/941 (68 suite)** — L0 kết ở 927/927, đúng +14 ca/+1 suite · typecheck 3 gói sạch · **driver trục D 13/13** · **governance trục C 55/55** và **đội đỏ 16/16 KHÔNG hồi quy** · 0 agent test còn sót trong danh bạ sau full suite · **tổng chi phí AI thật = 0**, cờ `ai_gateway_live` vẫn TẮT.

**Ranh giới cố ý của L1, ghi để Reviewer soi:** `logToolCall()` (MCP tool đọc, KHÔNG gọi LLM) ghi `agent: 'mcp'` thẳng vào sổ **không qua ba cổng** — không có egress nên N2/N3 không áp dụng theo cùng nghĩa, và tool đã có `scope_permission` + min-permission canonical (F55) gác riêng. Nêu ra vì đây là bề mặt duy nhất còn ghi `ai_interaction` ngoài đường gác.

**Phạm vi L0 — nói rõ để không mạo nhận:** đây mới chỉ là SỔ. `ai-gateway` **CHƯA gọi** `resolve()`; N1/N2/N3 chưa có răng. Cưỡng chế là việc của L1, tách ra có chủ đích: bật chặn trước khi sổ phủ hết mã đang chạy là gãy sản phẩm. **Cổng ra L0 đã đạt:** 6/6 mã sản phẩm tra được trong sổ, và mọi mã KHÔNG tra được đều mang dấu vết test (có test đóng đinh) ⇒ L1 bật N1 được. **Việc L1 phải làm trước:** 5 spec (`egress-policy` · `anthropic-live-wiring` · `ai-readiness` · `model-qualification` · `ai-governance-fixes`) đang bịa mã agent để cô lập lượt chạy — chuyển phần duy nhất đó sang `toolName` (trường tự do, không khoá bảng nào), giữ `agent` là danh tính.

---

## Trục A — "Chạm người dùng thật" · **22/07/2026 · L0+L1 XONG — chốt hợp đồng API, chờ duyệt trước khi vào FE**

> Kế hoạch: `02-dac-ta/NHG_iPMS_Ke_Hoach_Truc_A_Cham_Nguoi_Dung_That.md`. Mục tiêu: 18 màn persona (employee/manager/hr/exec/audit) đang chạy `lib/mock.ts` → nối backend Phase 1–2 đã build+test đủ. Nhịp đã thoả thuận: **dừng báo cáo hết L1 (hợp đồng API) và hết L3 (mốc demo)**. 2 commit `4b89e78`+`39edc4e`.

**Lát 0 — nền persona + dữ liệu sống (`4b89e78`):** seed thêm `mgr@` (manager, scope org_unit) · `hr@` (hrbp) · `exec@` (exec_viewer) · `auditor@` (auditor) — trước đó chỉ có admin@/emp1@ + 5 vai Studio nên 18 màn không có ai đăng nhập được. Script `seed:perfdemo` dựng "phòng sống" trong H.01: 6 nhân viên có `managerId` + OKR→2 KGI + 12 goal + 3 KPI (approve HITL) + scorecard Σ=100 + 12 check-in (kỳ trước đã duyệt, kỳ này chờ) + 6 evidence verified + 1 review cycle đủ 3 nhánh draft/self_done/manager_done. **Đi qua CHÍNH các service nghiệp vụ, không INSERT thẳng** — seed chạy được nghĩa là luồng người dùng chạy được. FE: 5 layout gate cho các khu persona (dùng chung session với /studio).

**Lát 1 — 5 read-model còn thiếu (`39edc4e`):** `GET /reviews` (danh sách, trước chỉ có `/reviews/:id`) · `GET /calibration-sessions[/:id]` (trước chỉ có POST) · `GET /persons/team` (roster đội gộp check-in/review/goal) · **`GET /audit-logs`** (permission `audit:read` là quyền TREO từ Phase 0 — có trong catalog, cấp cho auditor, nhưng KHÔNG endpoint nào dùng) · `GET /exec/overview`.

**3 quyết định kỹ thuật cần chủ dự án biết (đều theo hướng siết, không nới):**
1. **`/exec/overview` lọc theo scope chứ không chỉ theo permission.** Endpoint gác `goal:read`, mà `goal:read` cấp cho CẢ role employee ⇒ nếu chỉ dựa vào permission thì nhân viên mở được bảng điều khiển toàn công ty. Số tổng hợp cũng là rò rỉ (biết phân bố hiệu suất toàn hàng). Nay nhân viên gọi vẫn 200 nhưng chỉ nhận số của chính mình.
2. **`/audit-logs` KHÔNG trả `before`/`after`.** Vé F5 từ Phase 0 đã ghi nhận có PII trong `after` và tới nay chưa có allowlist field; trả ra sẽ biến màn kiểm toán thành cửa đọc dữ liệu nhân sự vòng qua mọi scope guard. Thay bằng cờ `hasPayload` — kiểm toán viên biết CÓ dữ liệu để xin trích xuất theo quy trình riêng. **Muốn xem nội dung phải làm allowlist per-action trước** (ghi backlog).
3. **`admin@` nhận 403 ở `/audit-logs` là ĐÚNG THIẾT KẾ**, không phải lỗi seed: `tenant_admin` cố ý không có `audit:read` (SoD — người quản trị không tự đọc vết của chính mình). Đã đưa admin@ vào quick-login màn Kiểm toán chính là để nhìn thấy điều đó.

**Sai lệch nhỏ so với kế hoạch (đã tự chốt):** marker dữ liệu demo dùng **quy ước định danh** (`person.employee_code` tiền tố `H.01-DEMO-`, tên bản ghi tiền tố `[DEMO]`) thay vì `governance.seedDemo=true` — các bảng goal/objective/checkin/review/person KHÔNG có cột jsonb, gắn cờ như kế hoạch sẽ phải thêm migration cho một việc thuần vận hành. `--purge` gỡ sạch; `audit_log` append-only nên vết seed ở lại (đúng thiết kế).

**Ghi nhận kiến trúc cho L2 (không phải lỗi hôm nay):** cổng đăng nhập đặt ở client component KHÔNG chặn children server-render bị serialize vào RSC payload. Hiện vô hại vì các trang còn là mock. Từ L2, **mọi trang persona bắt buộc fetch phía client** như `/studio`, tuyệt đối không fetch server-side — nếu không sẽ gửi dữ liệu thật cho người chưa đăng nhập.

**Bug tự bắt khi chạy thật (không qua test):** `externalId` evidence cắt 8 ký tự đầu uuidv7 ⇒ 6 person tạo cùng mốc ms có chung prefix ⇒ đụng unique `(tenant, source, external_id)` ngay lần chạy đầu. Đổi sang `employeeCode`.

**VERIFY:** typecheck api+web PASS · **471/471** (200 unit + 271 integration; baseline 449 + 22 test mới) · seed chạy 3 lần liên tiếp, lần 3 ra toàn 0 (idempotent) · Từ điển Tác vụ **419 cell canonical không đổi** (đếm trước/sau mỗi lần seed, lệch là fail cứng) · **driver sống 31/31 trên API :4000 thật với 8 persona** — demo1@ hỏi đích danh review đồng nghiệp vẫn trả rỗng · mgr@ xin đơn vị ngoài scope 403 · admin@ 403 ở audit-logs · tổng goal của nhân viên < tổng toàn tenant.

**Lát 2 — khu Nhân viên rời mock (`fc690f2`):** 4 màn + trang mới `/employee` **"Bàn làm việc của tôi"** (work_item P1, gom việc chờ từ dữ liệu đã có — KHÔNG thêm bảng). my-goals ← goals+objectives+evidence (lineage OKR▸KGI thật) · check-in ← GET/POST /checkins, nộp xong nạp lại goal để thấy health MỚI (bằng chứng nhìn thấy được rằng roll-up chạy cùng transaction) · review ← self-assessment thật, [I2] không render ô nhập phần quản lý cho chính reviewee. **`/development`: đã XOÁ toàn bộ khối bịa** (skill-gap L1–L5, khoá iLMS, mentor, lộ trình 30-60-90 — không cái nào có bảng dữ liệu); giữ lại sau khi nối API thật sẽ biến số bịa thành số trông-như-thật, nguy hiểm hơn lúc còn là mock ai cũng biết là mock.

**Lát 3 — khu Trưởng phòng + MỐC DEMO (`fc24323`):** team ← roster + duyệt check-in ([I3] nút khoá kèm lý do khi là chính mình) · review ← đánh giá + tính điểm, tách rõ chỉ tiêu THỦ CÔNG (nhập tay) với HỆ THỐNG (lấy từ bằng chứng đã xác minh), kết quả kèm target server-side + phiên bản công thức · coaching: bỏ "nhật ký coaching" bịa, thay bằng tín hiệu thật (blocker, mục tiêu chệch hướng, check-in vắng) kèm lý do lấy thẳng từ dữ liệu.

**🐞 HAI LỖI PHẠM VI TỰ BẮT KHI KIỂM CHỨNG SỐNG — không test cũ nào bắt được:**
- **[F174]** `GoalService.list` lọc phạm vi org_unit theo `goal.org_unit_id`, trong khi checkin/review/persons.team đều phân giải qua `person.org_unit_id` của **người sở hữu**. Mà `orgUnitId` là trường **tuỳ chọn** khi tạo goal ⇒ **goal không gắn nhãn trở nên VÔ HÌNH với chính trưởng phòng của người đó** — màn "Đội của tôi" đếm thiếu mục tiêu mà không báo lỗi gì. Đã thêm nhánh theo người sở hữu.
- **[F175]** `assertScope` chỉ khớp nhánh "tài nguyên của chính tôi" **khi vai có scope `self`**. Role `manager`/`dept_head` chỉ mang `org_unit` ⇒ **trưởng phòng không nộp được check-in của chính mình** (403). Sửa ở GỐC trong `assertScope`: tài nguyên mình sở hữu thì luôn qua. Đây là **sửa mô hình chứ không phải nới lỏng** — scope mô tả user với tới đâu NGOÀI bản thân, không vai nào nghĩa là "cả phòng TRỪ chính mình"; việc cấm tự-duyệt/tự-chấm là của các luật SoD tường minh (F26/F30/F41) nằm ở service, không đi qua hàm này. Có test chứng minh **không nới quyền**: nhân viên vẫn không check-in hộ người khác (403).

**VERIFY L2+L3:** **475/475** (200 unit + 275 integration, +4 test cho F174/F175) · `next build` PASS (32 route) · driver sống **21/21 (L2)** và **30/30 (L3)** · payload người chưa đăng nhập không chứa dữ liệu thật.

**🎯 MỐC DEMO ĐẠT:** trọn vòng chạy thật trên dữ liệu thật — *mục tiêu → check-in → trưởng phòng duyệt → tự đánh giá → quản lý đánh giá → hệ thống tính điểm có giải thích*. Đăng nhập `demo1@`…`demo6@` (nhân viên), `mgr@` (trưởng phòng) tại http://localhost:3001.

**Lát 4+5 — HR/Điều hành/Kiểm toán + XOÁ `lib/mock.ts` (`d08415b`):** `GET /me` trả thêm **quyền của chính người đăng nhập** (JWT chỉ có sub/tid/email/person_id nên FE trước đó không thể khoá nút trung thực — hoặc hiện mọi nút rồi để bấm vào ăn 403, hoặc đoán theo vai). HR: mở chu kỳ · tạo phiếu hàng loạt · cân chỉnh (lý do ≥10 ký tự, optimistic lock, không cân chỉnh phiếu của mình) · thư viện KPI + duyệt HITL · chính sách chỉ-đọc · **xuất bảng lương xác nhận 2 bước (I4)**. Điều hành: cockpit ← `/exec/overview`, cascade thật, ai-adoption ← `/ai/economics`. Kiểm toán: nhật ký + phân trang keyset, độ phủ vết theo 8 nhóm kiểm soát.

**Đã XOÁ 4 khối số bịa** (giữ lại sau khi nối API thật sẽ biến chúng thành *số trông-như-thật*, nguy hiểm hơn hẳn lúc còn là mock ai cũng biết là mock): skill-gap L1–L5 + khoá iLMS + mentor (`/employee/development`) · nhật ký coaching có nút không lưu được gì (`/manager/coaching`) · 9-box đặt sẵn tên người vào đủ 9 ô dù **không có trục tiềm năng** (`/hr/talent-matrix`) · **"nguy cơ nghỉ việc" + "khoảng trống kế nhiệm"** kèm tên người và % (`/exec/talent`) — loại số dễ bị dùng cho quyết định nhân sự nhất. Mỗi màn nay nêu rõ phần chưa xây và cần gì để có.

**🐞 Bug thứ ba tự bắt (L4):** nút "Xuất bảng lương" gọi `/export/payroll` **không truyền `?cycle=`** ⇒ luôn 422. typecheck + build đều xanh; chỉ driver sống mới lộ. Nếu không chạy thì đã ship một nút bấm vào là lỗi — đúng trên **đường tiền**.

**Lát 6 — kiểm chứng cuối + tự soát (`7a1d540`):** phát hiện `GET /persons/team` cắt cứng 500 người mà không báo ⇒ trưởng phòng đơn vị lớn tưởng đội chỉ có bấy nhiêu. Thêm cờ `capped` + cảnh báo trên giao diện.

**VERIFY TOÀN TRỤC:** **475/475** (200 unit + 275 integration) · `next build` PASS **32 route** · **24/24 route render 200** dưới dev · **4 driver sống = 120/120, chạy HAI VÒNG liên tiếp đều xanh** (tất định, không phá state) · seed chạy lần thứ N ra toàn 0 (idempotent) · **Từ điển Tác vụ 419 cell không đổi** · **tổng chi phí AI H.01 = 0.000000**, cờ `ai_gateway_live` vẫn TẮT (RED-LINE nguyên vẹn) · **không role nào bị nới quyền** trong suốt trục (đối chiếu diff seed).

**✅ TIÊU CHÍ PASS CỨNG ĐÃ ĐẠT:** `grep -r "@/lib/mock" web/src` = **0 kết quả**, file đã xoá. 18/18 màn persona chạy API thật.

**✅ REVIEWER ĐỐI KHÁNG — verdict `PASS-WITH-FIXES`, 0 BLOCKER, 8 vé F176–F183, ĐÃ VÁ ĐỦ (`510e63e`).** (Lần chạy đầu bị session limit cắt; nối lại phiên cũ và ra verdict đầy đủ.)

Reviewer **xác nhận an toàn** (có script chứng minh): F175 an toàn ở cả 9 call-site — nó gọi chi tiết `ownerPersonId: null` ở review manager/compute/finalize là *"chi tiết thiết kế tốt nhất của bản vá"* · I1 kín trên mọi read-model mới (F115 không tái diễn) · không rò RSC (24/24 trang client) · I2/I4/I7/I8 giữ · vá F22 đóng đúng lỗ.

**3 vé MAJOR — cả ba đều là "giao diện nói dối người dùng":**
- **F176** `/persons/team` trả **RỖNG cho người scope TENANT** ⇒ `/hr/review-cycle` báo "0 người chưa có phiếu" và nút tạo phiếu hàng loạt chạy rỗng nhưng hiện **toast XANH "Đã tạo 0 phiếu"** — HR tin cả công ty đã đủ phiếu. **Đây là luồng HR chính của cả lát 4**; lọt vì driver kiểm chứng của tôi chỉ đánh vai `mgr@`, không đánh `hr@`.
- **F177** `/exec/talent` gãy cho **đúng vai `exec_viewer`**: lời gọi `/review-cycles` quên bọc `catch` (exec không có `review:read`) ⇒ banner lỗi thô, trong khi panel bên cạnh (đọc `/exec/overview`, vẫn chạy) **hiện tên người thật** ⇒ trang nửa thật nửa giả.
- **F183** `GET /persons` trả **nguyên row toàn bộ danh bạ tenant cho cả role employee** (email, ngày vào làm, thâm niên). Có từ Phase 0, ngoài diff trục A. **Chủ dự án chốt SIẾT** → lọc scope + whitelist trường.

**5 vé MINOR đã vá:** F178 cursor `\d{1,20}` rộng hơn int8 ⇒ 500 · **F179 bản vá F22 của tôi bọc cả hai lớp trong `if (ev.ownerId)`** nên bằng chứng không chủ lọt (đúng điều tôi đã brief Reviewer soi), kèm sửa bất đối xứng connector nuốt im lặng mã nhân viên sai · F180 nhãn `goal.orgUnitId` không kiểm chứng · **F181 chất lượng test của tôi** (assert chống rò at-risk **chạy 0 lần**; một test **tên nói một đằng kiểm một nẻo**; `assertScope` sửa ở F175 mà **không có unit test nào** → thêm 14) · F182 `--purge` thêm `--dry-run` + bắt `--yes` ngoài T2.TEST.

**VERIFY sau vá:** **495/495** (214 unit + 281 integration) · `next build` PASS · 4 driver cũ **120/120 không hồi quy** · probe mới lặp lại **chính kịch bản Reviewer dùng: 15/15** (gồm ca đối chứng "hr vẫn verify được bằng chứng không chủ" — chứng minh không chặn oan luồng hợp lệ).

**Bài học ghi lại:** cả F176 lẫn F177 lọt vì driver của tôi chỉ đánh **một vai** cho mỗi màn. Từ nay driver phải quét **đủ mọi vai được phép mở màn đó**, không chỉ vai thuận tay.

**🔒 F22 TRẢ NỢ — lỗ bảo mật THẬT tự tìm ra khi chờ Reviewer (`5e6c329`):** tự audit **mọi call-site của `assertScope`** để kiểm hệ quả F175. Kết luận F175 **an toàn ở cả 9 call-site** (review manager/compute/finalize cố ý truyền `ownerPersonId: null` nên nhánh mới không chạy; checkin.review + review.self/manager/finalize đều có SoD tường minh chạy TRƯỚC). **Nhưng lộ ra một lỗ có từ trước, chưa từng được gác:** `EvidenceService.review()` không kiểm tra gì ngoài trạng thái pending — không SoD, không scope. Kiểm chứng bằng script độc lập trên API thật:
- ① `mgr@` tạo bằng chứng cho **chính mình** → 201 · ② **tự xác minh** chính bằng chứng đó → 201 `verified`, `reviewerId === ownerId` · ③ xác minh bằng chứng của người **phòng khác** → 201.
- **Vì sao nghiêm trọng:** KPI phương pháp `system` lấy bằng chứng VERIFIED trong khung kỳ để tính điểm (F29) ⇒ **đường tự thổi điểm của chính mình**, đi vòng qua toàn bộ SoD của vòng đánh giá (F26/F30 chỉ chặn tự CHẤM, không chặn tự cấp BẰNG CHỨNG).
- Đã vá 2 lớp (SoD tuyệt đối kể cả admin + scope phụ trách). **Đồng thời sửa TEST CŨ đang khoá lại chính cái lỗ** — `evidence.spec` tạo bằng chứng cho chính admin rồi để admin tự xác minh và gọi đó là "human-in-the-loop". Lặp lại đúng kịch bản tấn công sau vá: ② → **409**, ③ → **403**.

**VERIFY sau F22:** **477/477** (200 unit + 277 integration, +2 test mới) · 4 driver sống 120/120 · `seed:perfdemo` vẫn chạy (mgr xác minh bằng chứng của nhân viên **cùng phòng** — qua cả hai lớp gác; seed cố ý không tự-cấp-tự-duyệt).

---

## ❓ CHỜ CHỦ DỰ ÁN PHẢN HỒI (không chặn — có mặc định)
- ~~**F43 — reviewee có thấy điểm trước final không?**~~ → **ĐÃ CHỐT 22/07/2026: THẤY** (giữ hành vi backend hiện tại, không sửa gì). Vé treo từ Phase 2 khép lại.
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

### Lát 4i — Seed 815 tác vụ Task Catalog · **11/07/2026 · HOÀN THÀNH — Reviewer PASS-WITH-FIXES → đã fix đủ F109–F114, 246/246 test**
- **Parser** `packages/db/scripts/parse-task-catalog.ts` (regex tất định trên HTML nguồn 2.7MB) → data COMMITTED `task-catalog.data.ts` (815 tác vụ/21 phòng — CI/test không cần folder gg-io-nhg). Trường: tên, nhóm con, mức số hóa→aiLevel (assist/system/manual), Nguồn/Công cụ/Đề xuất, trigger, loại dữ liệu, Inputs/Outputs.
- **Mapper** `packages/db/src/task-catalog.ts`: auto-code `<DEPT>-G<nn>-T<nnn>` (21 slug: TS/CCLG/GGDH/NS/PC…; G đánh theo thứ tự xuất hiện nhóm — 231 nhãn nhóm nguồn không đánh số) · **map KPI SƠ BỘ theo Q1**: 8 phòng thuộc đúng 3 domain có KPI trong Từ điển (Giờ giảng→TCH-*, Tuyển sinh→ADM-*, Tài chính/Kiểm toán công nợ→FIN-*) = **283 tác vụ as_canonical**, keyword override + default domain, lý do ghi `governance.kpiMapReason` (explainable, phòng hiệu chỉnh sau) · **13 phòng ngoài domain (Nhân sự, Pháp chế, Lịch học, Kế toán, Dự báo, Hemis…) KHÔNG map gượng ép = 532 tác vụ as_submission** chờ B1 bổ sung KPI thật (đúng chặn cứng Q1 — 0 cell canonical thiếu KPI).
- **Seed script** `apps/api/src/scripts/seed-task-catalog.ts` (`pnpm --filter @ipms/api seed:taskcatalog`) — đi qua **CHÍNH pipeline import §6.5** (importPreview→applyImport): gate per-row, Q1 assertKpiRefExists, SoD F91 (curator@ chạy as_canonical — không giữ taskcell:author; admin@ đứng tên phiếu submission → curator vẫn duyệt được), audit `library.import` per batch, **idempotent** (canonical upsert theo mã; submission bỏ qua mã đã có phiếu/cell — chạy lại 0 nhân bản, đã chạy 3 lần trên dev DB chứng minh). RequestUser dựng từ DB thật (role→permission→scope), không hardcode quyền.
- **Giả định đã tự chốt (theo Q1/Q4/Q5 spec §12):** RACI mặc định "Chuyên viên/Trưởng phòng «tên phòng»" + 50 tác vụ Kế toán (System-assisted) nguồn không khai I/O → tổng hợp từ hệ thống nguồn + tên tác vụ, TẤT CẢ đánh dấu `governance.synthesized` minh bạch để phòng hiệu chỉnh qua vòng lặp 4k.
- **Reviewer SoD PASS-WITH-FIXES — 2 MAJOR + 4 nhỏ, fix đủ trước commit:** **F109** (re-seed đè trắng cell phòng ban đã hiệu chỉnh → giờ `protected`: updatedBy ≠ seed curator thì GIỮ NGUYÊN) · **F110** (mã sinh theo VỊ TRÍ trong HTML — nguồn chèn/đổi thứ tự làm cùng mã mang nội dung khác → guard runtime so tên-chuẩn-hoá theo mã FAIL CỨNG + unit test PIN sha256 map mã→tên) · **F111** (không hồi sinh cell đã deprecate) · **F112** (hoist fetch canonical 1 lần/batch cho dedup scan — hết O(rows×canonical) trong tx 20s) · **F113** (run preview mồ côi khi fail gate → đánh dấu failed) · **F114** (2 test fragile phụ thuộc trạng thái DB → sửa bất biến).
- Test: **246/246 PASS** (113 unit + 133 integration; +17 mới: task-catalog 10 unit + seed integration 7). Dev DB H.01 hiện có 283 canonical + 532 phiếu submission.

### Lát 4j — Ủy quyền phân cấp (authoring_grant) · **11/07/2026 · HOÀN THÀNH — Reviewer PASS-WITH-FIXES → đã fix F115–F120, 264/264 test**
- **DDL:** bảng `authoring_grant` (granter/grantee/org_unit/capability/status + `user_role_id` — biết đúng bản ghi RBAC đã materialize để thu hồi) · partial unique 1-grant-active per (tenant,grantee,org_unit,capability) chống double-grant/race (P2002→409) · RLS tenant-bound fail-closed, GRANT không DELETE.
- **Vai trò mới (spec §5):** `staff_author` (taskcell:author + library:submit + task:feedback — KHÔNG gán tay, chỉ materialize qua grant) ⟂ `dept_head` (taskcell:delegate/approve, task:reopen, library:curate — scope org_unit; seed user dept@ mỗi tenant) · +4 permission catalog (delegate/approve/reopen/feedback — approve/reopen dùng ở 4k) · sod_rule mặc định `taskcell:author ⟂ taskcell:approve` mỗi tenant.
- **API `GET/POST/DELETE /authoring/grants`** (permission taskcell:delegate): grant materialize `user_role(staff_author, scope org_unit)` CÙNG tx + audit `authoring.grant`; revoke = conditional update version (F28) + soft-delete đúng user_role → **hiệu lực NGAY** (PermissionGuard F4 lọc role soft-deleted) + audit `authoring.revoke`.
- **Least-privilege TRONG CODE (F55), 4 lớp:** ① capability allowlist CỐ ĐỊNH `['taskcell:author']` — không cấp được quyền duyệt/publish/delegate, kể cả admin gọi API ② orgUnitId phải thuộc scope org_unit của granter (trưởng phòng chỉ cấp trong phòng mình) ③ grantee phải active + person thuộc ĐÚNG phòng đó ④ không tự cấp cho mình (SoD chủ động — dept_head giữ quyền duyệt).
- **Reviewer SoD PASS-WITH-FIXES — fix đủ trước commit:** **F115 MAJOR** (GET list truyền orgUnitId tường minh vượt scope — dept_head soi được grant phòng khác → chặn 403) · **F116** (SoD chặn TẠI NGUỒN: không cấp author cho người đang giữ approve theo sod_rule — không đợi 4k detect muộn) · **F117** (mọi vi phạm bị chặn để lại vết audit `authoring.grant_denied` ghi NGOÀI tx, chuẩn F48) · **F118** (uuid tại cửa query param, F74) · **F119** (unit test pin tầng enforce service — độc lập DTO validation) · **F120** (test tự-cấp expect 409 chính xác). **Backlog F121:** nhân viên CHUYỂN PHÒNG → grant phòng cũ vẫn active (dept_head phải tự thu hồi) — cần offboarding hook ở lát sau/Phase 4.
- Test: **264/264 PASS** (117 unit + 147 integration; +18 mới: authoring unit 4 + integration 14). Trọn vòng chứng minh end-to-end: TRƯỚC grant emp 403 → grant → emp soạn+submit được trong phòng (sai phòng vẫn 403) → revoke → 403 lại ngay.

### Go-live Từ điển Tác vụ — API tra cứu + màn browse read-only · **11/07/2026 · HOÀN THÀNH build & test; ⚠ Reviewer đối kháng CHƯA chạy xong (session limit) — CẦN RE-RUN**
> **Chủ dự án yêu cầu tính năng Từ điển Tác vụ go-live sớm nhất. Chọn hướng: browser read-only + gắn nav chính cho MỌI persona. Gác 4k lại.**
- **Vấn đề trước lát:** 283 cell canonical (seed 4i) + 20 KPI đã có trong DB nhưng KHÔNG có API đọc (GET /task-cells của Studio bắt buộc configVersionId/processStepId là UUID → không đọc được canonical configVersionId=NULL) và không có màn tra cứu. Prototype `06-tu-dien-tac-vu/*.html` có UX nhưng chạy JSON mẫu, không nối data thật.
- **Backend:** module `dictionary` (read-only): `GET /task-dictionary` (list + facets nhóm/AI/KPI + filter q/groupCode/aiLevel/kpiRef/role, lọc text bỏ dấu) + `GET /task-dictionary/:code` (detail đủ 7 nhóm + **KPI join** từ kpi_template: definition/grain/classification/aiBoundary/sourceSystem). CHỈ đọc canonical (`configVersionId=NULL, deletedAt=NULL`) — **không lộ cell version-scoped của Config Studio** (test chứng minh). Permission MỚI `taskdict:read` **tách khỏi** taskcell:read (không lộ config draft), cấp cho **MỌI persona** (tài nguyên tham chiếu toàn hàng) qua vòng lặp seed. `capped` flag khi vượt LIST_CAP=2000 (trung thực, chưa phân trang).
- **FE:** route `/dictionary` (layout + page + css) nối API thật; **cây Phòng→Nhóm→Tác vụ** (từ facets), tìm kiếm tức thời (client-side trên tập tải sẵn), lọc mức AI, **panel giải phẫu 7 nhóm A–G** + thẻ KPI, song ngữ VI/EN, light/dark theo Design System. Gate đăng nhập tách ra `StudioGate` dùng chung với /studio (session chia sẻ) — quick-login ưu tiên emp1@ (persona thường). **Gắn nav chính:** nhóm "Tra cứu" đầu sidebar, hiện cho mọi persona.
- **Kiểm chứng:** typecheck api+web PASS · web build PASS (`/dictionary` 6.92kB) · **272/272 test** (117 unit + 155 integration; +8 dictionary) · **live verify:** emp1@ (nhân viên thường) gọi `/task-dictionary` OK — total 286, filter TS-G01 matched 6, detail trả đủ + KPI ADM-ENR-005.
- **⚠ NỢ QUY TRÌNH:** Reviewer Agent SoD độc lập bị cắt giữa chừng do session limit (mới đọc 8 file, chưa ra verdict). **Cần re-run reviewer đối kháng** cho lát này (các hướng đã liệt kê: rò rỉ quyền đọc taskdict cho mọi role, tách permission, read-model đúng, DoS/cap, FE client-filter, regression StudioGate, coverage). Tự-review đã xử lý điểm thật duy nhất phát hiện: cap truncation → thêm cờ `capped`. Chưa mạo nhận PASS.
- **Vẫn thiếu để "go-live đầy đủ":** phân trang/tìm-kiếm server khi thư viện phình >2000 · auth production (dev-token → Entra SSO) · có thể cho tra cứu KHÔNG cần đăng nhập trong tenant (hiện vẫn cần dev-token).
- **Cập nhật 12/07:** Reviewer re-run XONG — **PASS-WITH-FIXES**, đã fix đủ trước commit: **F122 MAJOR** (detail trả nguyên row → lộ contributedBy/createdBy/attrs — whitelist select + test chống leak) · **F123 MAJOR** (tìm theo MÃ không match do normalize lệch — fix + test) · **F124** (KPI join ưu tiên tenant trước global) · **F125** (+2 assert). F126–F129 minor/chấp nhận có ghi chú. Test dictionary 9/9. Nợ quy trình ĐÃ TRẢ.

### Lát 4k — Vòng lặp tối ưu liên tục (trái tim spec) · **12/07/2026 · HOÀN THÀNH — Reviewer verdict đầu FAIL → fix TOÀN BỘ F130–F139, 290/290 test; ⚠ re-verdict chính thức chờ session limit**
> **Vòng đời sống thật:** ACTIVE → góp ý sử dụng → trưởng phòng reopen (giao nhân viên có grant 4j) → sửa → submit → trưởng phòng approve-active → **ACTIVE v+1** + lịch sử bất biến. Mỗi vòng làm tác vụ tốt dần — đúng yêu cầu gốc của chủ dự án.
- **DDL (migration task_loop + hardening):** task_cell +status(draft|active|reopened|deprecated)/owner_org_unit_id/active_version/supersedes_id · `task_revision` APPEND-ONLY (trigger chặn UPDATE/DELETE kể cả owner + GRANT không cấp UPDATE/DELETE — 2 lớp) · `task_feedback` (optimize|defect|question, vòng đời open→triaged→reopened→resolved/wontfix) · RLS fail-closed · **backfill**: 286 cell canonical hiện hữu → active v1 + revision v1; hardening F133 demote cell KPI treo (fail-closed, Q1 không ngoại lệ kể cả migration).
- **API mới (modules/taskloop/):** `POST /task-cells/:id/claim` (trưởng phòng NHẬN cell về đúng phòng trong scope — Q5 seed để trống owner; cell có chủ → 409, chỉ B1/admin chuyển) · `GET/POST /task-cells/:id/feedback` (mọi người dùng — employee/manager đã cấp task:feedback; chỉ cell đang vận hành; cap 4KB) · `POST /task-cells/:id/reopen` (spawn phiếu draft TÁC GIẢ = người được giao, payload = snapshot bản active; validate người giao thuộc ĐÚNG phòng + CÓ quyền soạn F131c; feedback được chọn gắn vào vòng) · `POST /library/contributions/:id/approve-active` (SoD bất biến người-sửa≠người-duyệt + sod_rule author⟂approve + scope phòng + gate 7 nhóm + **Q1 assertKpiRefExists** + CẤM đổi mã + flip v+1 conditional F28 + revision + feedback resolved + audit) · `POST /task-cells/:id/reopen-cancel` (F131b — lối thoát vòng) · `GET /task-cells/:id/revisions[/:v]` (taskdict:read — lịch sử là phần tra cứu).
- **[F108] TRẢ NỢ:** config publish giờ CHẶN 422 nếu version chứa cell version-scoped thiếu/treo KPI (helper chung kpi-guard.ts — publish là active-transition). Mọi cửa vào active đều qua MỘT helper Q1: canonical publish · import as_canonical · approve-active · config publish.
- **Reviewer SoD verdict đầu: FAIL (đúng và đáng giá)** — bắt 1 BLOCKER + 3 MAJOR hở ngoài happy-path, ĐÃ FIX HẾT: **F130 BLOCKER** (cell publish/import SAU 4k kẹt draft vĩnh viễn — vòng lặp chỉ sống cho cell backfill → giờ publish canonical + import as_canonical = active-transition: active v1 + revision v1) · **F131** (reopened là NGÕ CỤT khi phiếu bị reject/giao nhầm người → reject tự trả cell về active + reopen-cancel + validate assignee fail-fast) · **F132** (3 đường vòng sửa cell active không vết: import as_canonical đè → giờ so-nội-dung, y hệt = unchanged không nhiễu, ĐỔI = revision + bump; phiếu vòng tối ưu bị chặn khỏi đường curation approve/publish 422; publish merge vào cell active → revision) · **F133** (backfill demote KPI treo) · **F134** (deprecate set status + chặn giữa vòng + mã deprecated không tái sử dụng) · **F135** (drift guard hết fail oan với phiếu đã sửa hợp lệ) · **F136** (claim không stamp updatedBy) · **F137** (whitelist status; ghi nhận: feedback mở TOÀN TENANT — deviation §5 self/org_unit CÓ CHỦ ĐÍCH: cell canonical là tài nguyên chung, phòng khác dùng phải góp ý được) · **F139** (test không phá published version).
- **⚠ NỢ QUY TRÌNH:** re-verdict chính thức của Reviewer bị cắt do session limit (2 lần). Điều kiện lật verdict Reviewer ĐÃ GHI RÕ ("F130+F131+F132+3 test → PASS-WITH-FIXES") đã thoả và vượt (fix cả 9 + 5 test), nhưng chưa có re-verdict độc lập — sẽ chạy khi limit reset. **F138 (MINOR, chưa fix):** snapshot backfill phát key null tường minh vs snapshot TS bỏ key — FE diff (lát 4l) phải coi null ≡ absent.
- **Test: 290/290 PASS** (117 unit + 173 integration; task-loop 17 test — 12 vòng đời + 5 theo reviewer), full suite chạy 2 lần liên tiếp đều xanh (state-clean).

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

---

## Từ điển Tác vụ go-live (chốt sổ) + Copilot P3 — Inline AI Agents · **19/07/2026 · HOÀN THÀNH — Reviewer PASS-WITH-FIXES → fix F153–F156, 327/327 + live E2E 22/22**

> **Bối cảnh:** toàn bộ go-live Từ điển Tác vụ G1–G7 (verified 18/07: 303/303 + E2E 13/13) VẪN CHƯA COMMIT — nằm trần trong working tree. Lát 0 = chốt sổ. Sau đó build P3 inline agents trên MOCK (chưa có ANTHROPIC_API_KEY, cờ ai_gateway_live TẮT, chi phí 0đ).

**Lát 0 — chốt sổ G1–G7 (3 commit sạch, CHỈ trong 05-build):** `2712e56` generator+data (parse-task-dashboard.mjs, harvest-kpi-fin.mjs, task-catalog-v2.data.ts 1194 tác vụ, kpi-dictionary-ext.data.ts 21 KPI FIN-EXT) · `3aa8feb` mapper+seed+dọn legacy (task-catalog-v2.ts, seed, deprecate-legacy-catalog.ts, unit spec) · `e12a4a4` G6 phân trang (dictionary.* + integration test). Thư mục tài liệu (06-/08-/09-/10-/gg-io-nhg/*.docx) KHÔNG commit — chờ chủ dự án tự quyết. Không seed lại (data H.01 đã verified), không push.

**Cổng thiết kế đã CHỐT với chủ dự án:** tách permission MỚI **`ai:assist`** (gợi ý inline: chỉ đọc + đẻ ai_suggestion PENDING) khỏi `ai:invoke` (chat Copilot + MCP propose). Lý do: ai:invoke chỉ cấp designer@/admin@ nhưng inline agent nằm đúng chỗ author@/curator@ → mọi nút sẽ 403. Cấp ai:assist cho bu_author/library_curator/dept_head/config_designer/admin; KHÔNG cấp employee/auditor. Cùng tinh thần least-privilege như tách taskdict:read khỏi taskcell:read.

**Lát 1 — backend inline assist (`212a105`):** module `apps/api/src/modules/ai/inline/` — controller `POST /ai/inline/:task` + `/suggestions/:id/apply|dismiss` (guard ai:assist), service + 4 tác vụ (inline-assist.tasks.ts): `taskcell.draft` (điền A–G thiếu theo quality gate) · `taskcell.kpi_link` (gợi ý kpiRef từ Từ điển KPI 41 + lý do) · `derivation.rule` (match/emit + vì-sao) · `curation.dedup` (khác biệt 2 cell trùng → merge/keep_both). Dùng AiGatewayService.complete() (non-streaming, tự log ai_interaction). MockLlmClient thêm 4 nhánh tất định. **Bất biến:** KHÔNG tự ghi — output vào ai_suggestion PENDING, accept mới materialize qua config_change DRAFT (F28) · cap input 16KB bytes → 422 (F149) · parse/gate lỗi → 422 không tạo suggestion · tổng cost=0.

**Lát 2 — FE nút "✦ AI gợi ý" (`8414fd8`):** `<InlineAssist>` (web/src/components/ai/) gắn /studio/library (form + KPI Linker), /studio/derivation, /studio/curation. Thẻ gợi ý dạng diff + 3 nút Chấp nhận / Sửa rồi chấp nhận / Bỏ + footer "AI có thể sai". Song ngữ VI/EN. KHÔNG đụng CopilotMount (widget nổi giữ nguyên).

**Lát 3 — Reviewer đối kháng (`80f4260`), verdict PASS-WITH-FIXES 0 BLOCKER:** **F153 MAJOR** (self-apply gate thêm createdByTool 'inline.*' — suggestion MCP type derivation_rule không tự chốt lệch vòng accept config:write) · **F154 MAJOR** (curation.dedup đòi library:curate HOẶC là tác giả contribution — ai:assist không thành cửa đọc contribution người khác trong tenant) · **F155 MINOR** (accept whitelist type materialize org_change/derivation_rule — suggestion form-fill không đổ rác vào journal config_change) · **F156 MINOR** (BE orderBy tất định + trả candidateId; FE resolve đúng). F157 xác minh không xảy ra. **Backlog:** F158 (TTL/auto-expire suggestion pending mồ côi).

**VERIFY (chạy lại độc lập 19/07 sau khi agent bị session-limit giữa lúc báo cáo):** typecheck API PASS · unit **135/135** (126 cũ + 9 inline) · integration **192/192** (gồm inline-assist.spec) = **327/327** runInBand · **live E2E driver đánh API :4000 thật (mock): 22/22 PASS** — emp1@ 403, suggestion PENDING+diff, kpi_link→FIN-EXT-004 thật, accept→config_change materialize (không lách published→409), audit+ai_interaction có vết, double-apply 409, 16KB/gate-đủ/task-lạ→422 không tạo suggestion, tổng costUsd inline=0 (RED-LINE). SERVERS: DB :55432 + Redis :56379 (up), API :4000 restart code mới.

**CÒN NỢ (không chặn):** Copilot P0 live (implement AnthropicLlmClient.stream thật + PII scrub F59 + lật cờ ai_gateway_live — CẦN KEY) · re-verdict Reviewer 4k · Từ điển đợt 2 HR/PC/HIU/ADM 1063 phiếu (chờ B1 định nghĩa KPI) · Entra G5 · vé tồn F42/F43/F55/F59/F70/F76/F79/F82/F85/F86/F97–F102/F105/F121/F138/F152/~~F158~~ *(F158 ĐÃ TRẢ ở trục Learning Loop 20/07)*.

---

## Trục AI Learning Loop + Eval + Unit Economics (PRD §14/§15/§16) · **20/07/2026 · HOÀN THÀNH — Reviewer PASS-WITH-FIXES → fix đủ F159–F168, FULL SUITE 391/391 + live E2E 23/23**

> **Chủ dự án duyệt kế hoạch 20/07, chốt trục này** (trong 4 ứng viên: learning loop / Copilot P2 scaffold / work_item P1 / trả nợ). Mục tiêu: khép vòng quản trị trên chính inline agents 80f4460 — đóng 3 ô 🔴/🟡 của AI-Native PRD Mapping (§15 learning loop, §14 golden set + launch bar, §16 unit economics). TOÀN MOCK, chi phí 0đ, RED-LINE nguyên vẹn. 6 commit: `13dad40`+`bb5c421`+`5469947`+`f994fe1`+`3230b9f`+`3ac8477`.

- **L0 telemetry học (`13dad40`):** bảng `ai_learning_signal` APPEND-ONLY (trigger chặn cả owner, CHECK outcome, RLS) — mỗi quyết định trên gợi ý AI thành 1 tín hiệu: `accepted` / `accepted_with_edits` / `rejected` / `expired`, kèm `finalPayload` (cái người dùng THẬT SỰ dùng) + `editedFields` (diff dotted 1 tầng — "AI sai field nào"). FE `<InlineAssist>` nâng "Sửa rồi chấp nhận" thành **edit-in-place** (sửa trực tiếp cột AI đề xuất → bắt finalPayload thật). **[F158 TRẢ NỢ]** job expire suggestion PENDING mồ côi quá TTL (env `AI_SUGGESTION_TTL_DAYS`, mặc định 14d) → `expired` + tín hiệu hệ thống. `GET /ai/learning/stats` (ai:eval).
- **L1 Golden Set có SoD (`bb5c421`):** suggestion lưu `replay {prompt, context}` = đúng request đã gửi LLM → golden case **chạy lại tất định, không phụ DB**. Bảng `ai_golden_candidate` (unique per signal); vòng: harvest tín hiệu dương → **curator duyệt → ai_eval_case** (suite `golden-learned`). **Permission MỚI `ai:eval:curate`** (library_curator/admin) + **SoD trên THƯỚC ĐO**: người duyệt ≠ người tạo tín hiệu, chặn CẢ ADMIN + incident `ai_golden.sod_denied` — đóng đúng bài học E2 red-team KPI Designer ("golden set tự-ra-đề-tự-chấm"). `expected` = bản người dùng ĐÃ SỬA (chuẩn vàng = hành vi thật). Seed **golden-fin-baseline**: 4 suite / 9 case FIN curated (`pnpm --filter @ipms/api seed:golden` — B1 hiệu chỉnh file seed-golden-fin.ts).
- **L2 Eval + Launch Bar (`5469947`):** runner eval chấm suite `inline.*` trên **proposal đã qua parser fail-closed** của tác vụ (inline-replay.ts — không chấm raw output; parse lỗi = case fail có note). Bảng `ai_launch_bar` (seed mặc định 4 agent: minPassRate 0.85 / minCases 5 — B1 hiệu chỉnh). `GET /ai/eval/readiness`: pass-rate run mới nhất TỪNG suite vs bar, **fail-closed** (thiếu bar/suite/run/case = not-ready + reasons); **`liveQualified` tách riêng** — kết quả mock chỉ chứng minh pipeline, KHÔNG chứng minh model thật (bật live cần đo trên model thật). `PUT /ai/eval/launch-bars/:agent` (audited).
- **L3 Unit Economics (`f994fe1`):** MockLlm ước lượng token GỒM context (16KB context lấn át prompt — bỏ qua là projection nói dối). Bảng giá `ai_model_price` GLOBAL app-read-only (Opus 4.8 $5/$25 · Sonnet 5 $3/$15 · Haiku $1/$5 · Fable $10/$50 /MTok, as-of 2026-06-24 — cập nhật = sửa seed). `GET /ai/economics`: per agent token+latency **P50/P95** (nearest-rank), **chi thực = $0** (RED-LINE), **projection tháng ×0.5/×1/×2** (sensitivity PRD §16) — mọi số dán nhãn `estimated` + `basis`. → khi anh cấp key: đây là bộ số quyết "bật live agent nào, tốn bao nhiêu".
- **L4 FE + Reviewer (`3230b9f` + `3ac8477`):** trang **`/studio/ai-governance`** (nav Studio, ai:eval → designer@/admin@): ① tỷ lệ Chấp nhận/Sửa/Bỏ + field AI hay sai ② readiness 🟢/🔴 vs bar ③ economics + projection. **Reviewer đối kháng (fresh context) verdict PASS-WITH-FIXES — fix đủ 10 vé:** **F159 MAJOR** (golden approve lách cap createSuite → giờ qua đúng bộ cap ≥1/≤20 assertion, ≤32KB, suite ≤100 case) · **F160 MAJOR** (finalPayload không validate → đầu độc corpus/golden không cần curator → giờ validate ĐÚNG whitelist/shape per type, 422) · **F161 MAJOR** (payload.replay rò dữ liệu gate library:curate qua GET /ai/suggestions (config:read) + config_change → strip replay, journal chỉ nhận proposal — vá hồi quy F154) · **F162 MAJOR** (harvest starvation cửa sổ 2000 → FK candidate→signal + lọc trong query) · **F163 MAJOR** (economics đếm cả traffic eval CI → projection sai hàng chục lần → loại toolName eval:*) · F164 (so ngưỡng trước làm tròn) · F165 (+filter expired) · F166 (SoD fail-closed thiếu actor) · F167 (giá tenant thắng global) · F168 (MCP accept/reject phát learning signal — corpus đủ).
- **VERIFY:** typecheck api+web PASS · regression fixes 9/9 · **FULL SUITE 391/391 runInBand (37 suites**; baseline cũ 327 + 64 test mới) · **LIVE E2E driver đánh API :4000 thật: 23/23** (trọn vòng assist→sửa-rồi-nhận→signal→harvest→SoD→duyệt→eval case→run tất định→readiness→economics→expire→RED-LINE cost=0) · web build 31 route + `/studio/ai-governance` render 200. SERVERS: DB :55432 + Redis up, API :4000 + web :3001 đang chạy code mới.

**Giả định tự chốt (theo ủy quyền):** ① ngưỡng launch bar mặc định 0.85/5 case — B1/anh hiệu chỉnh qua PUT hoặc seed ② giá as-of 2026-06-24 từ bảng niêm yết Anthropic — cập nhật = sửa seed ③ golden baseline FIN do Claude curated (đánh dấu B1 hiệu chỉnh trong file) ④ TTL suggestion 14 ngày ⑤ dashboard read-only — thao tác harvest/duyệt golden qua API (UI curation golden để lát sau nếu cần.

**Ý nghĩa cho quyết định bật live (khi anh cấp ANTHROPIC_API_KEY):** quy trình chuẩn giờ là — bật cờ `ai_gateway_live` ở DEV → chạy lại golden suites trên model thật → `GET /ai/eval/readiness` phải `liveQualified=true` per agent → đối chiếu `GET /ai/economics` projection với budget → mới cân nhắc bật cho người dùng. Không còn quyết "cảm tính".

**Backlog mới (không chặn):** UI curation golden candidates (duyệt qua API được rồi) · Redis pub/sub invalidation khi multi-replica (chuỗi F70) · gộp learning signal vào ai_conversation (Copilot chat) khi P0 live.

---

## Last-mile bật AI thật (F59 trả nợ + §9/§11 AI-Native PRD) · **21/07/2026 · HOÀN THÀNH — Reviewer đối kháng PASS-WITH-FIXES → đã fix đủ F169–F172, FULL SUITE 449/449**

> Chủ dự án duyệt kế hoạch 20/07 (4 ứng viên: **last-mile bật AI thật** / Copilot P2 / work_item P1 / trả nợ). Mục tiêu: lật cờ `ai_gateway_live` khi có key là AN TOÀN — 1 bước duy nhất, có kiểm chứng. TOÀN MOCK trong test, chi phí 0đ, 5 commit `cbf8f41`→`bccee27`.

- **Lát 1 — F59 PII scrub thuận-nghịch (`cbf8f41`):** `pii-scrubber.ts` (pure) phát hiện email/SĐT VN/CCCD/tiền VNĐ + tên nhân sự (đối chiếu `person.fullName` tenant, cache TTL) → token hoá `[[PII:kind:n]]` tất định. Scrub TRƯỚC khi request rời gateway (client mock/thật CHỈ THẤY bản đã scrub — `ai_interaction` log ĐÚNG bản đó, đếm `piiScrubbed` theo loại không lộ giá trị) + rehydrate NGHỊCH cho caller nội bộ (map chỉ sống RAM 1 lượt gọi — không dựng kho PII thứ hai). `StreamRehydrator` giữ token vỡ giữa 2 chunk (bug thật tự bắt: 1 dấu `[` lẻ bị bắn đi khi stream chia từng ký tự — đã fix giữ speculative). Test: 16 unit + 4 integration qua API thật.
- **Lát 2 — Egress Policy Engine (`1c77940`):** `ai_egress_policy` (tenant override) + bất biến CỨNG trong CODE: `confidential`/`pii` + đích≠mock **LUÔN CHẶN**, không tenant nào override được (self-host chưa triển khai). `public`/`internal` mặc định cho phép (đã qua cổng flag+key), tenant chỉ THU HẸP THÊM. `guardEgress()` chạy SAU scrub, TRƯỚC gọi client — chặn → `status='blocked'`, KHÔNG bao giờ chạm client. GET/PUT `/ai/egress-policies`. Test: 6 unit + 15 integration (2 qua HTTP thật).
- **Lát 3 — AnthropicLlmClient.stream() THẬT (`0455a17`):** cài `@anthropic-ai/sdk`, map đủ `RawMessageStreamEvent`→`LlmStreamChunk` (text/tool_use/usage; thinking_delta chủ đích KHÔNG forward — backlog FE). Transport TIÊM ĐƯỢC (`withTransport()`, test không mạng/không key) + `@Injectable` DI (không còn `new` cứng — cho phép override provider trong integration test). costUsd tính THẬT qua `EconomicsService.priceForModel()` (F167 tenant thắng global, dùng chung luật với báo cáo §16). **Sự cố tự bắt+tự sửa:** test đầu tiên tạo costUsd>0 thật cho tenant H.01 — `ai_interaction` APPEND-ONLY (không xoá được) làm đỏ oan 2 suite khác assert "tổng cost H.01=0" (RED-LINE) → đã data-repair 1 lần (disable trigger tạm) + CHUYỂN hẳn test sang tenant `T2.TEST`. Test: 15 unit + 2 integration end-to-end.
- **Lát 4 — Model-Qualification Gate, cấm silent-swap (`c2bfc88`):** `ai_agent_model` (model đang PHỤC VỤ agent, pin tường minh) + `ai_model_qualification` APPEND-ONLY (bằng chứng model X chạy TOÀN BỘ golden suite agent Y, đạt bar, kèm `runIds` thật, TTL `AI_QUALIFICATION_TTL_DAYS`=90). `setServingModel()` = CỔNG DUY NHẤT đổi model phục vụ — model≠mock PHẢI có qualification CHƯA HẾT HẠN + đạt bar HIỆN TẠI, không thì 422 fail-closed. `readiness().liveQualified` viết lại hoàn toàn: KHÔNG còn suy từ "từng thấy model không-phải-mock chạy qua" (lỗ hổng thật — đổi model phục vụ mà không re-run vẫn đọc liveQualified cũ) — giờ RE-CHECK độc lập mỗi lần đọc (bar bị siết sau qualify ⇒ tự vô hiệu). API: GET/PUT `/ai/eval/agent-model[/:agent]` · POST `/ai/eval/qualify/:agent` · GET `/ai/eval/qualifications`. Test: 9 integration (Phần A mock/H.01 an toàn, Phần B model thật qua transport giả/T2.TEST — chứng minh cả đường qua được lẫn đường bị chặn).
- **Lát 5 — FE checklist + fix tự bắt (`bccee27`):** `/studio/ai-governance` thêm ① Checklist sẵn sàng Live (4 thẻ: key có/không · cờ ON/OFF+backend · N/M agent đạt bar · N/M agent đã qualify model đang phục vụ) ② bảng Egress Policy (pii/confidential read-only "LUÔN CHẶN", public/internal có nút Cho phép/Chặn) ③ card readiness thêm servingModel + nút Qualify/Đặt model phục vụ. **[Fix tự bắt qua verify SỐNG, không qua test]** `EgressPolicyController.list()` quên `await` → `policies` là Promise lồng trong response, Nest không tự đợi, `JSON.stringify(Promise)` ⇒ `"{}"` thay vì mảng — phát hiện khi curl API dev thật (test cũ chỉ kiểm dataClasses/destinations, không kiểm chính field lỗi) → đã fix + thêm assertion `Array.isArray`.
- **VERIFY (trước Reviewer):** typecheck api PASS · FULL SUITE 445/445 runInBand (44 suites) · verify sống trên API dev :4000 thật (readiness/egress-policies/agent-model đều 200 đúng dữ liệu) · web `next build` PASS (31 route) + web dev :3001 render 200 cho /studio, /studio/ai-governance, /dictionary, /kpi-dictionary.

**Reviewer đối kháng (fresh context, worktree cô lập) — verdict PASS-WITH-FIXES → đã fix đủ F169–F172 (commit `fac1930`):**
- **F169 BLOCKER** (regex phone/cccd chỉ khớp chuỗi số LIÊN TỤC — bypass hoàn toàn ở định dạng có dấu phân cách phổ biến nhất tiếng Việt: "090.123.4567", "CCCD: 001204 012345" — Reviewer verify bằng script độc lập chạy chính regex trong code, xác nhận bypass thật, đây chính là RED-LINE mà cả track hướng tới bảo vệ) → fix cho phép dấu phân cách `[.\-\s]` tuỳ chọn trước mỗi chữ số, verify không tạo false-positive trên mã tác vụ dạng chữ-số.
- **F172 MAJOR** (FE 3 nút hành động không khoá trong lúc gọi API — double-click/mạng chậm bắn nhiều request song song; nghiêm trọng vì `qualify()` chạy LẠI TOÀN BỘ suite qua Anthropic THẬT khi live đã bật = tốn tiền thật 2 lần cho 1 lượt bấm) → fix `pendingRef` (kiểm tra đồng bộ, state React batched không đủ nhanh) + disable nút/đổi nhãn "Đang chạy…" khi in-flight.
- **F170 MINOR** (tên nhân sự so khớp case-sensitive tuyệt đối, "NGUYỄN VĂN A" viết hoa lọt) → so khớp không phân biệt hoa/thường, giữ nguyên cách viết gốc khi rehydrate.
- **F171 MINOR** (N+1 query trong readiness() — mỗi agent tốn thêm 1 query qualification) → nạp trước 1 lượt, lookup trong bộ nhớ.
- **F173 MINOR (khuyến nghị, không fix ngay):** `ai:eval` gộp đọc+ghi cho hành động giờ có sức nặng tài chính (qualify chạy thật) — pattern CŨ từ trước track này, Lát 4 chỉ mở rộng phạm vi. Cân nhắc tách permission riêng (vd `ai:model:manage`) cho qualify/setServingModel khi có thời gian kiểm thử kỹ seed/role wiring — **ghi backlog, không chặn**.
- Reviewer cũng xác nhận (không phải ticket, để tránh hiểu nhầm là còn hở): egress ordering đúng (không đường nào gọi client trước khi check egress) · StreamRehydrator không leak khi trace tay các edge case · scrub lỗi (DB down) fail-closed đúng (nằm ngoài try/catch, throw trước khi chạm client) · `runIds` không giả mạo được (server tự tính, không nhận từ client) · TOCTOU bar-đổi-giữa-chừng có test integration xác nhận tự vô hiệu · quy tắc T2.TEST vs H.01 (bài học Lát 3) được tuân thủ đúng trong toàn bộ test mới.
- **VERIFY SAU FIX:** FULL SUITE 449/449 runInBand (44 suite, +4 test mới) · `next build` PASS (31 route, ai-governance 8.21kB).

**Ý nghĩa cho quyết định bật live (khi anh cấp ANTHROPIC_API_KEY):** quy trình giờ là — set key trong .env DEV → bật `ai_gateway_live` (tenant hoặc global) → vào `/studio/ai-governance`, checklist "Sẵn sàng Live" phải đủ 4 xanh (key ✓, cờ ON, agent đạt bar, agent đã qualify) → với TỪNG agent muốn bật, bấm **Qualify** (chạy suite thật trên model đang phục vụ) → nếu đạt bar, bấm **Đặt làm model phục vụ** để pin chính thức → egress policy không chặn dataClass của agent đó → mới cân nhắc để người dùng thật chạm vào. Đổi model sau này (vd hạ chi phí sang Haiku) PHẢI qualify lại trước — không có đường vòng.

**Giả định tự chốt (theo ủy quyền):** ① TTL qualification 90 ngày — B1/anh hiệu chỉnh qua env ② thinking_delta/signature_delta của Claude CHƯA forward ra FE (backlog — cần bề mặt tách reasoning trace) ③ `type:'suggestion'` streaming CHƯA làm cho Anthropic thật (mock vẫn demo được — cần thiết kế tool-schema riêng cho "đề xuất thay đổi", ngoài phạm vi hạ tầng last-mile) ④ scrub PII theo tên nhân sự dựa `person.fullName` — CHƯA scrub các dạng định danh khác (mã nhân viên, biệt danh).

**Ticket nợ:** F42/F43/F55/F70/F76/F79/F82/F85/F86/F97–F102/F105/F121/F138/F152 (tồn từ trước) · re-verdict Reviewer 4k (Từ điển Tác vụ, nợ dài hạn) · **F173** (tách permission `ai:eval` cho hành động có sức nặng tài chính — khuyến nghị Reviewer, ghi backlog).

---

## Trục B — Quản trị 3 tầng · **Lát 0: đập bỏ god-account** · **28/07/2026 · XONG — FULL SUITE 516/516**

> Chủ dự án duyệt kế hoạch `02-dac-ta/NHG_iPMS_Ke_Hoach_Truc_B_Quan_Tri_3_Tang.md` ngày 28/07, chốt 4 điểm: chạy đủ L0→L7 · **CÓ làm Impersonation** (lát L4 mới, J11–J13) · **chưa push** (tích luỹ tiếp) · danh sách hạ quyền **áp rồi báo cáo** — đây là bản báo cáo đó. Commit `ab2d215`.

**Vấn đề:** `packages/db/src/seed.ts` khai `tenant_admin: PERMISSIONS.filter((p) => p !== 'audit:read')` — god-account trừ đúng một quyền. `admin@` finalize được đánh giá, xuất được bảng lương, publish được config, duyệt KPI/tác vụ, xác minh bằng chứng. Toàn bộ hệ SoD dựng công phu từ Phase 0 (F26/F30/F41/F91/F116) đi vòng qua được bằng **một** tài khoản.

**Sau L0, `tenant_admin` giữ đúng 25 quyền** = quản trị người dùng + cơ cấu tổ chức + cấu hình đơn vị + đọc rộng để hỗ trợ. Không một quyền ghi nghiệp vụ nào. Vẫn **không có `audit:read`** (J3).

### Danh sách quyền TƯỚC khỏi `tenant_admin` — kèm ai giữ thay

| Quyền bị tước | Ai giữ thay |
|---|---|
| `rating:approve` | manager / hrbp |
| `payroll:export` · `calibration:run` · `review:manage` · `integration:run` | hrbp |
| `review:write` · `goal:write` | employee / manager |
| `checkin:review` · `evidence:verify` | manager / hrbp |
| `checkin:write` · `evidence:write` | employee |
| `kpi:write` · `kpi:approve` · `scorecard:write` · `strategy:write` | hrbp |
| `config:write` · `brand:write` · `org:design` · `derivation:run` · `process:design` · `taskcell:write` | config_designer |
| `config:publish` | config_approver |
| **`integration:connect` · `integration:bind`** | **config_designer (MỚI nhận)** — đấu nối hệ ngoài là việc *cấu hình*, không phải việc quản trị người dùng; trước đây chỉ god-account có nên tước mà không giao lại sẽ làm chết tính năng |
| `taskcell:author` · `kpi:propose` · `library:submit` | bu_author / staff_author |
| `library:curate` · `library:publish` · `library:deprecate` · `library:import:canonical` · `ai:eval:curate` | library_curator |
| `taskcell:delegate` · `taskcell:approve` · `task:reopen` | dept_head |
| `ai:invoke` · `ai:eval` · `ai:assist` | config_designer / bu_author / library_curator / dept_head |
| `flag:write` | **KHÔNG AI** — thuộc tầng ① Platform Admin, lộ trình B1 (ghi nhận để không quên) |
| `audit:read` | auditor (giữ nguyên từ trước — J3) |

### Thêm vào
- **13 permission tầng ②③:** `user:invite` `user:deactivate` `role:read` `role:revoke` `orgunit:update` `orgunit:archive` `tenant.config:read` `tenant.config:update` `settings.self:read/update` `access.self:read` `notify.self:read/update`.
- **Role MỚI `org_admin`** (scope `org_unit`) + seed `orgadmin@`: quản trị người trong **một phòng**; KHÔNG tạo được tài khoản (việc tenant-level), KHÔNG đụng cơ cấu/cấu hình đơn vị.
- **Quyền cá nhân cấp cho MỌI role** — không ai phải xin để xem quyền của chính mình.
- **Seed RECONCILE:** xoá `role_permission` không còn được khai báo. Không có bước này thì `upsert` chỉ THÊM ⇒ DB đã seed trước đó **vẫn giữ nguyên god-account** và cả trục B chỉ đúng trên máy chạy DB sạch.

### Test đóng đinh mới — `rbac-matrix.spec` (21 test)
Đọc ma trận **từ DB thật**, không từ khai báo trong mã: cái có hiệu lực lúc chạy là hàng trong `role_permission`. Kiểm: snapshot chính xác từng role (thừa/thiếu đều đỏ) · mọi quyền tước đều có vai giữ thay · chỉ `auditor` giữ `audit:read` · SoD cấp role · không role nào giữ `audit:read` cùng quyền ghi · hai catalog (`@ipms/shared` ↔ DB) khớp nhau.

**Phân biệt quan trọng rút ra khi viết test:** hệ có **hai loại SoD**. ① *cấp role* — giữ cả hai vế là đã sai (config:write ⟂ config:publish). ② *cấp bản ghi* — giữ cả hai vế là **bình thường và cần thiết** (trưởng phòng phải vừa viết đánh giá vừa duyệt hạng, cho cấp dưới), cái bị cấm là làm cả hai trên **cùng một đối tượng**; thực thi ở service (`review.service.ts` F26/F30, `golden.service.ts` F166). Trộn hai loại vào một test là cách chắc chắn để người sau "sửa cho xanh" bằng cách tước một quyền hoàn toàn hợp lệ.

### 13 suite gãy — mỗi chỗ là bằng chứng đang dựa vào god-account
Tất cả đã chuyển sang **đúng vai**, không trả quyền lại cho `admin@` (J3):
- **3 suite dùng `findFirst` KHÔNG lọc** (evidence/kpi-scorecard/strategy-goal) → rơi vào `admin@` mà không hề khai báo. Đây là "tài khoản tiện tay" ẩn, tệ hơn cả dùng admin công khai. Nay chỉ đích danh `hr@`.
- **review-loop:** cả vòng đánh giá chạy bằng một tài khoản → tách `hrbp` (quản trị vòng: kpi/scorecard/cycle/review/calibration/export) và `manager` (chốt hạng — vai **duy nhất** giữ `rating:approve`). Đúng SoD nghiệp vụ, không phải mẹo cho test xanh.
- **5 ca SoD runtime mượn god-account** (config-studio/policy/library/task-loop/ai-golden) → helper `test/helpers/sod-mix-user.ts` dựng đúng tình huống mà `sod_rule` sinh ra để chặn: **tenant tự cấu hình sai, cấp cho một người hai vai lẽ ra phải tách**. Ý nghĩa ca kiểm được giữ nguyên, và còn đúng hơn trước.
- **ai-gateway:** ca kiểm **lớp 2** (scope_permission) không còn chạm tới thứ nó định kiểm, vì `admin@` bị chặn ngay **lớp 1** (mất `ai:invoke`) → chuyển sang `designer` (có `ai:invoke`, không có `audit:read`).
- **process-integration:** nhân tiện vá điểm yếu *"assert chạy 0 lần"* ở ca cô lập tenant — mảng rỗng cũng làm `every` trả `true` (bài học ② trục A).

**VERIFY:** FULL SUITE **516/516** runInBand (47 suite), **chạy 2 lần đều xanh, seed lại giữa hai lần** · số test **không giảm** (495 → 516; giảm là dấu hiệu xoá nhầm) · typecheck api + shared + db + web PASS · **J9 nguyên vẹn**: Từ điển Tác vụ **419 cell canonical không đổi** (135 active + 284 legacy đã deprecated từ lát chốt sổ G1–G7 trước đây), tổng cost AI H.01 = `0`, cờ `ai_gateway_live` TẮT.

**Cần biết cho lát sau:** `admin@` giờ vào khu `/studio` sẽ bị 403 ở phần lớn thao tác (đúng thiết kế). Quick-login `admin@` trong StudioGate của web vì thế không còn là "tài khoản xem được mọi thứ" — nav role-gated ở **L6** sẽ xử lý tử tế; trước đó FE có thể hiện nút mà API từ chối, đúng lỗ **B-b** trục này đang đi đóng.

---

## Trục B — Quản trị 3 tầng · **Lát 1: Hợp đồng API quản trị** · **28/07/2026 · XONG — 📍 DỪNG BÁO CÁO theo kế hoạch**

> Lát backend lớn nhất của trục, chốt sổ hợp đồng API trước khi sang FE (đúng nhịp trục A). Commit `ceabc43`.

**15 endpoint dựng đủ theo bảng §4 Lát 1** — mỗi endpoint: scope fail-closed · whitelist select · cap phân trang · audit khi ghi · optimistic lock khi update. `GET/POST/PATCH /admin/users` + disable/enable · `GET /admin/roles` + `POST/DELETE .../roles` + `GET .../effective-access` · `PATCH/DELETE /org-units/:id` · `GET/PATCH /admin/tenant-config` · `GET/PATCH /me/access` + `/settings` + `/notifications`.

**[J8] Điểm rủi ro số 1 của lát — đã xác minh và vá:** `PermissionGuard` trước lát này chỉ lọc `user_role` đã soft-delete, **không đọc `app_user.status`**. Nghĩa là "khoá tài khoản" chỉ đổi một cột trong DB mà không ai đọc lại — JWT ký sống 8 giờ nên token phát TRƯỚC khi khoá vẫn dùng nguyên vẹn tới khi hết hạn. Đã sửa: guard đọc `status` **cùng một query** với role/permission (không tốn round-trip DB thêm), 401 ngay nếu khác `active`. Test chứng minh bằng token phát TRƯỚC lệnh khoá — 401 ngay sau khoá, sống lại ngay sau mở khoá, không cần token mới.

**2 lỗ tự vá TRƯỚC KHI CHẠM TEST — không đợi Reviewer:**
1. **J1② thiếu vế "người NHẬN".** Bản đầu chỉ kiểm scope khi `scopeType='org_unit'` — một `org_admin` chỉ cần chọn `scopeType='self'` là né sạch mọi kiểm scope, gán vai cho bất kỳ ai ở bất kỳ phòng nào. Đã vá: **luôn** đòi `grantee.person.orgUnitId ⊆ scope người cấp`, bất kể scopeType nào được yêu cầu. `revoke()` cũng được vá đối xứng (bản đầu chỉ cho thu hồi vai `scopeType='org_unit'`, không đối xứng với `assign()` — cấp được mà không thu hồi lại được).
2. **Mâu thuẫn thiết kế J1① × mục tiêu §1 của trục.** Áp J1① tuyệt đối ("không cấp quyền mình không có"), `tenant_admin` (đã tước sạch quyền ghi nghiệp vụ ở L0) **không gán được vai sàn `employee`** cho chính người nó vừa tạo tài khoản — nghĩa là mốc demo "hết L3 onboard được người thật, đăng nhập, thấy đúng khu vực" **không đạt được**. Không sửa bằng cách nới quyền cho tenant_admin (J3 cấm rõ). Sửa đúng khuôn đã có ở `authoring.service.ts` (`CAPABILITY_ALLOWLIST`): thêm `BASE_ROLE_ALLOWLIST=['employee']` — ngoại lệ hẹp, tường minh trong code, **không áp cho `auditor`** (J3 vẫn nguyên vẹn: không ai thiếu `audit:read` cấp được `audit:read`). `GET /admin/roles` và `POST .../roles` dùng chung allowlist — không liệt kê một lựa chọn rồi bấm vào ăn 403 (J4).

**1 bug tự bắt khi viết code (trước khi chạy test):** `updateNotifications()` bản đầu gọi lại `getNotifications()` sau khi upsert — nhưng đó là một **transaction MỚI**, đọc dữ liệu trước khi transaction ngoài commit ⇒ trả về dữ liệu **cũ** ngay sau khi vừa ghi. Sửa: đọc lại trong CÙNG transaction.

**Migration (2):** `app_user.preferences` jsonb + bảng `notification_setting` (RLS tenant-bound, bảng mới DUY NHẤT của lát — không có row = mặc định BẬT) · `user_role.created_by/revoked_by` (trước đây KHÔNG có cột này ⇒ `effective-access` không thể trả "ai cấp" — một phần của yêu cầu §4 Lát 1).

**VERIFY:** `admin-api.spec.ts` 46/46 (chạy 2 lần đều xanh) · **FULL SUITE 564/564 runInBand** (48 suite, +48 so với L0, chạy 2 lần đều xanh, seed lại giữa 2 lần) · typecheck api PASS · `next build` 32 route PASS (không đổi baseline) · J9 nguyên vẹn (419 cell, cost H.01 = 0, `ai_gateway_live` TẮT).

**Tiếp theo:** L2 màn "Người dùng & Vai trò" (`/admin/users`) — hợp đồng API đã chốt ở đây, an toàn để dựng FE trên nền này.

---

## Trục B — Quản trị 3 tầng · **Lát 3: Cơ cấu tổ chức + trả nợ F121** · **28/07/2026 · 🎯 MỐC DEMO — 📍 DỪNG BÁO CÁO theo kế hoạch**

> Commit `3903d74` (L2 `/admin/users` ở `bcce3da` liền trước, không phải mốc dừng nhưng đã xong trên đường tới đây).

**🎯 Mốc demo đạt được và ĐÃ DIỄN TẬP qua API dev thật (không phải chỉ đọc code):** tạo "Nguyễn Demo L3" bằng `admin@` → xếp vào phòng ADMISSIONS → gán vai `employee` (scope self) → người mới đăng nhập bằng chính email vừa tạo → `GET /me/access` trả đúng bộ quyền `employee` (`goal:write`/`checkin:write`/`review:write`/…) kèm `grantedBy: admin@h01.nhg.local` → `GET /admin/users` bị chặn 403 đúng thiết kế. Trọn vòng **"tạo → gán vai → đăng nhập → thấy đúng khu vực, không thấy khu vực khác"** — sống.

### Cơ cấu tổ chức (`/admin/org`)
- `tree()` thêm **"Đếm người theo từng đơn vị"** + tên người quản lý — `groupBy` một lượt trên toàn tenant, không N+1 theo số node.
- `PATCH /org-units/:id` nhận thêm `managerId` — mở rộng hợp đồng L1 (cột `manager_id` chưa tồn tại lúc chốt hợp đồng đó, thêm ở lát này khi màn thực sự cần).
- FE: bảng phẳng thụt lề theo cây (không phải canvas kéo-thả — đó là việc của `/studio/org` Configuration Studio, mục đích khác hẳn: đây là công cụ CRUD quản trị, không phải bàn thiết kế). Đổi tên/cha, gán quản lý, tạo/lưu trữ đơn vị — mọi hành động ẩn theo quyền (J4). `org_admin` chỉ đọc được cây, đúng thiết kế L0 (không giữ `org:write`/`orgunit:update`/`orgunit:archive`).

### F121 TRẢ NỢ
Nhân viên **chuyển phòng** (đổi `person.orgUnitId` qua `PATCH /admin/users/:id`) giờ **tự thu hồi** mọi `authoring_grant` đang active của người đó ở **phòng cũ**, cùng transaction với chính lần đổi phòng: soft-delete `user_role` đã materialize + audit `authoring.revoke_on_transfer` (ghi cả org unit cũ lẫn mới). Trước lát này, nhân viên chuyển phòng vẫn giữ quyền soạn tác vụ ở phòng đã rời đi — trưởng phòng cũ phải **nhớ** mà gỡ tay, một món nợ tồn từ lát 4l (không có UI để trả trước trục B). Đây là lần đầu tiên (và duy nhất) luồng chuyển phòng có UI trong app, nên đây đúng là **chỗ rẻ nhất** để trả — không có đường nào khác đổi được `person.orgUnitId`.

**VERIFY:** 51/51 test admin-api.spec (bổ sung khối personCount+manager + 2 ca F121: grant phòng cũ bị revoke đúng lúc, grant phòng KHÁC/đã-revoked-từ-trước KHÔNG bị đụng vào), chạy 2 lần đều xanh · **FULL SUITE 569/569 runInBand** (48 suite) · typecheck api+web PASS · `next build` **35 route** PASS · J9 nguyên vẹn (419 cell, cost H.01 = 0).

**Gotcha môi trường gặp lại lần 2 (xác nhận không phải may rủi, ghi cho L4 trở đi):** kill API dev server đúng PID trước `prisma generate` (giữ query-engine.dll) · `next build` production đè `.next` của `next dev` đang chạy ⇒ dev server vỡ (500), restart phải kill đúng PID đang **LISTEN** cổng bằng `Get-NetTCPConnection -LocalPort 3001` — PID nhớ từ lần khởi động trước có thể đã đổi qua nhiều lần restart, kill nhầm PID để lại tiến trình cũ (chưa biết route mới) vẫn âm thầm trả 404.

**Còn lại của trục B:** L4 Impersonation (chỉ-đọc, J11–J13) · L5 User Settings (menu avatar) · L6 Cấu hình đơn vị + nav role-gated toàn hệ (đóng lỗ B-b — hiện `Sidebar.tsx` đã có nhóm "Quản trị đơn vị" nhưng CHƯA gate theo quyền, đúng nhịp đã hoãn từ L2/L3) · L7 Verify + Reviewer đối kháng. Theo kế hoạch, L4→L7 chạy liền không dừng báo cáo trừ khi có bất thường.

---

## Trục B — Quản trị 3 tầng · **L7 (trước Reviewer): driver sống + render toàn hệ** · 28/07/2026

> Commit chuỗi L4→L6: `c43ebf5` (Impersonation) → `aa9d450` (User Settings) → `c9733d0` (nav gating + Cấu hình đơn vị). Chuẩn bị xong trước khi mời Reviewer đối kháng — đúng nhịp đã dùng cho mọi trục trước.

**Driver sống `verify-admin.mjs`** (đánh API :4000 THẬT, không phải jest transaction cô lập) — **29/29, chạy 2 vòng liên tiếp đều xanh**: J2 (finalize/export 403 sau L0) · J1③/J12③ (không tự nâng quyền, không tự đóng vai chính mình) · J1①/J3 (không có đường cấp `audit:read` cho tenant_admin) · J1② (org_admin không gán vai được cho người phòng khác) · J8 (token phát trước khi khoá → 401 ngay) · nhân viên thường bị 403 ở `/admin/users`, `/me/access` chỉ thấy của mình · F121 (chuyển phòng, hiệu ứng phụ xác nhận) · J9 (Từ điển đọc được, không đụng) · **trọn vòng đóng vai**: đọc 200 → ghi 403 (dù target thật giữ quyền) → Thoát 200 → token cũ dùng lại 401 ngay · cô lập tenant T2.

**Web render 200 cho toàn bộ 34 route** dưới `next dev` (33 route persona + `/admin/config` mới), kể cả các route mới của trục B (`/admin/users`, `/admin/org`, `/admin/config`, `/settings`).

**FULL SUITE 596/596 runInBand** (50 suite) — không đổi từ L4, xác nhận L5/L6 (thuần FE) không gây hồi quy. Typecheck api+web PASS.

**Đã gửi Reviewer đối kháng** (fresh-context, worktree cô lập, vé từ F184) — review toàn bộ 6 commit `ab2d215..HEAD`, trọng tâm theo đúng gợi ý của kế hoạch gốc: leo thang quyền qua API gán vai · rò PII `/admin/users` · whitelist `tenant.settings`/`preferences` · token sống sau khoá/thoát phiên · mồ côi scope khi đổi cha org unit · nav gating có bỏ sót màn nào · **ca đối chứng bắt buộc** cho việc hạ quyền tenant_admin (chứng minh không chặn oan) · đường vòng có thể né `PermissionGuard` trong phiên đóng vai (J11).

**Chờ verdict trước khi chốt sổ toàn trục.**

---

## Trục B — **VERDICT ĐÃ VỀ + CHỐT SỔ TOÀN TRỤC** · 29/07/2026

> Commit `4e5d4dc` — `fix(truc-b): áp verdict Reviewer đối kháng — F184–F190`.

**Verdict Reviewer đối kháng: `PASS-WITH-FIXES`, 0 BLOCKER, 7 vé F184–F190 (4 MAJOR) — đã vá đủ.**

**Bốn vé MAJOR đều là lỗ thật, không phải bắt bẻ hình thức:**

- **F184 — dựng lại god-account bằng đường vòng.** Ngoại lệ "vai sàn" trong `doAssign` không ép `scopeType='self'`. Hệ quả: `tenant_admin` — sau L0 đã không còn giữ **một** quyền ghi nghiệp vụ nào — vẫn gán được vai `employee` **scope=tenant** cho một tài khoản bất kỳ, và `assertScope` cho qua ngay khi thấy scope tenant mà **không xét chủ sở hữu tài nguyên** ⇒ tài khoản đó ghi được `goal/checkin/review/evidence` của **toàn tenant**. Đúng thứ mà cả trục B tồn tại để đập. Vá: `isBaseRole` đòi thêm `scopeType === 'self'`; `GET /admin/roles` trả cờ `selfOnly`; FE khoá cứng select scope (J4 — không hiện lựa chọn mà API sẽ từ chối).
- **F185 — prototype pollution ở whitelist cấu hình.** `KEY_WHITELIST[key]` trên object literal đọc cả thuộc tính **kế thừa**: `key='constructor'` → trả hàm `Object`, truthy **và gọi được** ⇒ qua cả hai lớp kiểm, ghi thẳng vào `tenant.settings` dù không có trong whitelist; `key='__proto__'` → trả `Object.prototype`, truthy nhưng không gọi được ⇒ TypeError chưa bắt ⇒ **500**. Vá: đổi sang `Map` (không có chuỗi kế thừa để đọc nhầm), bỏ DTO class cho `patch`, tự kiểm shape trước `Object.entries`.
- **F187 — lách J3 qua đóng vai.** `IMPERSONATION_READ_WHITELIST` dựng trên giả định ngầm *"mọi quyền đuôi `:read` đều an toàn để lộ qua kênh đóng vai"*. Sai: `audit:read` cũng đuôi `:read`, nên `tenant_admin` đóng vai `auditor@` đọc được vết kiểm toán — đúng cái J3 cấm. Vá: whitelist thành **tập con nghiêm ngặt** của tập `:read`, trừ ngoại lệ tường minh; test đổi từ "khớp tuyệt đối" sang "khớp trừ ngoại lệ" + ca đóng đinh `not.toContain('audit:read')`.
- **F188 — audit ghi nhầm người.** `policy.denied` ghi `actorUserId = claims.sub` (target đang bị đóng vai) thay vì `claims.act` (người thật) — xoá dấu vết actor thật đúng lúc actor thật đang bị Cedar từ chối. Vá theo đúng bất biến J13 mà `audit.interceptor.ts` đã áp cho mọi audit log khác.

**F189** (optimistic lock cho admin mutations: tenant-config PATCH, user disable/enable, org archive, `/me` preferences — GET trả kèm `version`) · **F190 MINOR** (phòng thủ theo chiều sâu ở nhánh kiểm quyền `tenant_admin`).

**VERIFY sau khi vá:** **606/606 runInBand** (50 suite — baseline 596, các vé thêm 10 test) · typecheck `shared`+`db`+`api`+`web` sạch · `next build` PASS · FE khớp hợp đồng mới (`version` trong `api.ts`, `selfOnly` khoá select scope ở `/admin/users`).

**⚠️ HAI GHI CHÚ QUY TRÌNH — quan trọng hơn bản thân các vé:**

① **Driver sống KHÔNG nằm trong repo.** `find . -name "verify-*.mjs"` ra **rỗng**. Toàn bộ driver của trục A (120/120) và trục B (29/29) được viết trong scratchpad của phiên và **mất cùng phiên đó**. Nghĩa là những con số kiểm chứng mạnh nhất trong STATUS **không tái lập được**. Từ trục C trở đi: driver phải nằm ở `05-build/scripts/verify/` và được commit như mã nguồn.

② **API dev server không watch — dễ kiểm nhầm trên mã cũ.** Probe `GET /admin/tenant-config` trên server :4000 đang chạy trả về **không có** trường `version` ⇒ server đó khởi động từ trước khi vá. Bất kỳ kiểm chứng "live" nào cũng phải kill PID :4000 và start lại trước, nếu không là đo mã cũ mà tưởng đã đo mã mới.

**Trục B ĐÓNG.** Việc kế tiếp: **trục C — "Lớp bảo vệ niềm tin"**, kế hoạch tại `02-dac-ta/NHG_iPMS_Ke_Hoach_Truc_C_Lop_Bao_Ve_Niem_Tin.md` (đã duyệt 29/07; vé Reviewer đánh số tiếp từ **F191**).

### Trả nợ ghi chú ① — driver sống đã vào repo · commit `0ad26c9`

`05-build/scripts/verify/verify-admin.mjs` — **29 check, chạy 3 vòng liên tiếp đều 29/29**, đánh API thật + DB thật. Phủ J1·J2·J3·J8·J9·J11·J12·J13 + toàn bộ vé F184/F185/F187/F189, mỗi nhóm siết quyền đều có **ca đối chứng** chứng minh không chặn oan. Driver tự dọn và đăng ký bước hoàn nguyên **trước** khi thao tác.

> Bản đầu của driver đăng ký hoàn nguyên **sau** thao tác; gặp mã trả `201` không lường trước thì return sớm và **để `emp1` bị khoá vĩnh viễn** — phải sửa tay. Đây chính là lý do thứ tự đăng ký phải đảo lại, ghi ra để không lặp ở trục C.

### ❓ PHÁT HIỆN THIẾT KẾ CẦN CHỦ DỰ ÁN QUYẾT — impersonation gần như không dùng được

Driver đo được một hệ quả không ai chủ ý tạo ra: **J12** (không đóng vai người giữ quyền mình không có) cộng với **L0** (hạ hết quyền nghiệp vụ của `tenant_admin`) khiến `admin@` chỉ còn đóng vai được **tài khoản không có quyền nào**. Mọi persona seed — `emp1`, `mgr`, `hr`, `exec`, `auditor`, `dept`, `designer`… — đều bị từ chối, vì ai cũng giữ ít nhất một quyền mà `tenant_admin` không có.

Nói cách khác: tính năng đóng vai đã build ở L4 **hiện không dùng được cho mục đích nó sinh ra** (hỗ trợ kỹ thuật xem màn hình của người dùng đang gặp sự cố). Ba hướng, cần chọn một:

1. **Giữ nguyên** — coi đóng vai chỉ dành cho tình huống hẹp; chấp nhận nó gần như không dùng tới. Rẻ nhất, nhưng L4 thành công sức bỏ phí.
2. **Vai hỗ trợ riêng** — tạo vai `support` giữ đúng tập quyền ĐỌC của các persona (không có quyền ghi nào), đóng vai được rộng hơn mà không leo thang. Hợp với hướng trục C.
3. **Nới J12 cho phiên chỉ-đọc** — vì phiên đóng vai đã bị whitelist chặn ghi rồi, điều kiện "quyền ⊆ của mình" có thể nới thành "chỉ áp cho quyền ghi". Mạnh nhất nhưng động vào bất biến, phải qua Reviewer.

Khuyến nghị **hướng 2** — không phá bất biến nào, và nằm đúng phạm vi trục C (lớp quản trị & kiểm soát).

> ✅ **CHỦ DỰ ÁN CHỐT 29/07/2026: hướng 2.** Đã đưa vào kế hoạch trục C thành **lát 2b — vai `support` chỉ-đọc**, kèm bất biến mới **K11** (`support` không giữ bất kỳ quyền ghi nào, kiểm bằng ca đối chứng quét toàn bộ endpoint mutation) và không giữ `audit:read` (giữ J3). Cổng ra: `support@` đóng vai được `emp1`/`mgr`/`hr`/`exec` với đọc 200 · mọi ghi 403 · `audit-logs` 403.

---

## Trục C — "Lớp bảo vệ niềm tin" · **30/07/2026 · L0 + L1 XONG — 📍 DỪNG BÁO CÁO theo nhịp đã thoả thuận**

> Kế hoạch: `02-dac-ta/NHG_iPMS_Ke_Hoach_Truc_C_Lop_Bao_Ve_Niem_Tin.md` (duyệt 29/07). Nhịp: dừng báo cáo hết **L1** (kiểm soát xuất) và hết **L2** (mốc demo Platform Admin). Vé Reviewer đánh số tiếp từ **F191** — L0+L1 **chưa có vé nào**, Reviewer đối kháng chạy ở L7.

### Lát 0 — sổ đăng ký dữ liệu + phân loại 4 mức · commit `9a7558b`

Bảng `data_asset`: bản chuẩn cấp tập đoàn (`tenant_id NULL`) + đơn vị **chỉ siết chặt được**, chặn bằng **trigger DB** chứ không chỉ validator tầng API — đường ghi trực tiếp (script vá dữ liệu, endpoint mới thêm sau này, job) vẫn bị chặn. Seed 9 nhóm theo BRD §12: `payroll.reward` và `opco.operational` = **restricted**, `review.result`/`hr.profile`/`finance.metric`/`audit.log` = confidential. Vai mới **`data_steward`** (B3+B5) là vai DUY NHẤT sửa được sổ, và **không kèm quyền nghiệp vụ nào** — người quyết định dữ liệu được xử lý thế nào không nên là người xử lý nó. Mã chưa đăng ký ⇒ **404 fail-closed**, không mặc định về `internal`.

**Hoà giải một lệch vựng âm thầm:** lớp AI dùng `pii` làm mức thứ tư, NHG Strategic Context §7 dùng `restricted`. Hai vựng song song là mầm rò: một chỗ siết `pii`, chỗ kia siết `restricted`, dữ liệu lọt qua khe giữa hai cách gọi. Đã chuẩn hoá về `restricted`, giữ `pii` làm bí danh tương thích ngược cho bản ghi `ai_egress_policy` đã có.

### Lát 1 — kiểm soát xuất dữ liệu · **cổng duy nhất, fail-closed**

**`export_log` append-only** (trigger chặn UPDATE/DELETE, không GRANT UPDATE/DELETE cho `ipms_app` — hai lớp), RLS tenant-bound. Bốn cột NOT NULL, không có đường ghi vết thiếu: **mã dữ liệu · mức phân loại · đích · số bản ghi**. Không thay `audit_log`: audit ghi "ai làm gì", export_log trả lời câu B0/B5 thực sự cần — *dữ liệu nào đã rời hệ, đi đâu, bao nhiêu dòng*.

**Trần xuất = bảng quyết định (mức phân loại × LOẠI ĐÍCH).** Loại đích là phần tự chốt thêm so với kế hoạch, vì mức phân loại một mình không đủ: "gửi kết quả đánh giá sang hệ lương nội bộ NHG" và "tải bảng điểm về máy cá nhân" là hai rủi ro khác hẳn dù cùng `confidential`. Ba loại: `internal_system` · `file_download` · `external_service`.

| | hệ nội bộ NHG | tệp về máy | dịch vụ ngoài |
|---|---|---|---|
| public / internal | cho | cho | cho |
| **confidential** | cần `export:confidential` | cần `export:confidential` | **CHẶN** (§9.3) |
| **restricted** | **CHẶN** | **CHẶN** (K3) | **CHẶN** |

**Hai lớp fail-closed, cố ý khác bản chất.** ① *Runtime:* route có đường dẫn dạng xuất mà không khai `@Exported` → **403**, không có chế độ cảnh báo-rồi-cho-qua. ② *Build-time:* snapshot đóng đinh chính xác các route đang khai — thêm/bớt một khai báo làm test đỏ. Cần cả hai: heuristic không thể biết `POST /integrations/jobs/morning-todos/run` là đường đẩy dữ liệu ra hệ ngoài (tên vô hại), còn snapshot một mình thì người thêm route mới có thể sửa cho xanh — nhưng khi đó là sửa tường minh, có vết.

### ⚠️ MỘT QUYẾT ĐỊNH LÀM MỘT TÍNH NĂNG ĐANG CHẠY DỪNG LẠI — cần chủ dự án biết

`GET /export/payroll` (xuất kết quả đánh giá sang OneOffice) mang `review.result` = **confidential** ⇒ từ nay đòi thêm `export:confidential`, và theo đúng kế hoạch §4 L1 quyền đó **không nằm trong bộ mặc định của bất kỳ vai nào — kể cả `hrbp` đang giữ `payroll:export`**. Nghĩa là **hôm nay không ai trong hệ xuất được bảng lương** cho tới khi B1 cấp quyền này cho một người cụ thể.

Đây là hệ quả CÓ CHỦ ĐÍCH, không phải hồi quy: "được chạy kỳ đánh giá" và "được mang dữ liệu cá nhân ra khỏi hệ" tách thành hai quyết định. Nhưng nó cần một hành động của B1 trước khi kỳ đánh giá tới chạy. Ba lựa chọn:

1. **Giữ nguyên (khuyến nghị)** — B1 cấp `export:confidential` cho 1–2 người phụ trách chuyển dữ liệu sang hệ lương, có vết trong `user_role`. Đúng tinh thần trục B (không gộp quyền) và không cần sửa mã.
2. **Cấp sẵn cho `hrbp`** trong seed — tiện, nhưng quay lại đúng kiểu gộp quyền mà trục B vừa đập: mọi HRBP tự động xuất được dữ liệu cá nhân toàn tenant.
3. **Tạo vai `export_officer`** trong seed, không gán cho ai — ở giữa hai hướng trên; thêm một vai để B1 gán bằng một cú bấm thay vì cấp quyền lẻ.

Bảng `payroll.reward` (restricted) **không** phải mã của đường xuất này: dữ liệu lương thật nằm ở hệ nhân sự, iPMS chỉ đẩy ra kết quả đánh giá + tỷ lệ thưởng suy từ hạng. Nếu sau này có đường xuất mang đúng `payroll.reward` thì theo K3 nó **không xuất được bằng bất kỳ đường nào**, và đó sẽ là một quyết định riêng của B1 chứ không phải mặc định lọt sẵn.

### Ba khoảng cách so với kế hoạch — báo trước để không bị phát hiện muộn

① **Kế hoạch nói "sáu đường xuất", trong mã hôm nay chỉ tồn tại BA.** Đã khai đủ ba: `GET /export/payroll` (→ OneOffice, internal_system) · `POST /integrations/outbox/dispatch` (→ connector ngoài) · `POST /integrations/jobs/morning-todos/run` (→ hệ todo ngoài). Ba đường còn lại kế hoạch nêu — tải bằng chứng, xuất Từ điển Tác vụ, xuất báo cáo — **chưa có route nào trong sản phẩm**, không phải bị bỏ sót. Hàng rào đã dựng trước chúng: thêm route dạng đó mà không khai là 403 + test đỏ.

② **Danh sách người dùng không tính là đường xuất.** Cân nhắc rồi bỏ: `GET /admin/users` là màn đọc có RBAC + scope, coi nó là "xuất" sẽ đòi `export:confidential` và làm chết màn quản trị — đúng loại "chặn oan đường hợp lệ" mà kế hoạch dặn tránh. Khi nào có nút "Tải danh sách (.xlsx)" thì route ĐÓ mới là đường xuất.

③ **Gọi LLM ngoài không ghi vào `export_log`.** Cũng là dữ liệu rời hạ tầng NHG, nhưng đã có cổng riêng + sổ riêng (`ai_egress_policy` + PII scrub + `ai_interaction` append-only). Ghi hai sổ cho một dòng dữ liệu thì hai sổ lệch nhau, và khi đó không sổ nào đáng tin. Gộp/tham chiếu chéo để lại **L6** (soát 11 mục governance).

**Một nợ đã ghi, chưa trả:** worker BullMQ gọi `dispatchTenant()` trực tiếp, không qua HTTP ⇒ **không qua ExportGuard** — đúng loại "đường không qua guard" đã thành bài học ở `POST /ai/chat`. Đường HTTP đã ghi vết; đường worker chưa. Ghi vào danh sách cho L7/Reviewer.

**VERIFY L0+L1:** **657 test / 54 suite runInBand** (baseline trước trục C: 606) · typecheck `shared`+`db`+`api` sạch · **driver sống `scripts/verify/verify-governance.mjs` 12/12 trên API :4000 thật** (đã kill+restart server trước khi đo — bài học ②), gồm ca sống chứng minh L0 điều khiển được L1: `data_steward` siết một mã lên `restricted` thì đường xuất dùng mã đó **đóng ngay request sau**, nới lại thì mở lại (đối chứng: không chặn vĩnh viễn).

> **Tự bắt khi chạy driver thật:** driver để lại một dòng `data_asset` cấp tenant (API sổ đăng ký chỉ có PUT, **không có DELETE** override) ⇒ một ca đối chứng của L0 ăn lỗi unique. Chỗ sai là TEST, không phải driver: một đơn vị CÓ override là trạng thái sản phẩm hợp lệ, nên mọi spec chạm sổ đăng ký phải tự dựng trạng thái đầu vào. Đã sửa hai spec dọn ở `beforeAll` chứ không chỉ `afterAll`. Đây đúng là loại lỗi mà jest-trong-transaction không bao giờ bắt được — lý do driver sống phải nằm trong repo.

### ✅ Chủ dự án chốt 30/07: **hướng 1 — giữ nguyên, B1 cấp cho 1–2 người**

Thực hiện xong. Nhưng kiểm để triển khai thì lộ ra hướng 1 **chưa chạy được** như tôi mô tả, và chỗ tắc nằm ở mô hình quyền chứ không ở lát L1:

- Quyền chỉ đến với người **qua một vai** (`user_role → role_permission`) — không có bảng "cấp quyền trực tiếp", và API quản trị **không có** endpoint tạo vai / gắn quyền vào vai lúc chạy.
- `GET /admin/roles` chỉ liệt kê vai mà **chính người gọi giữ đủ quyền**, và J1① chặn gán vai chứa quyền mình không có. `tenant_admin` không giữ `export:confidential` ⇒ không thấy vai nào chứa nó, không gán được.

Tức là "B1 cấp cho 1–2 người" nếu để nguyên **chỉ làm được bằng sửa DB tay** — không vết `user_role`, không audit, không ai rà được. Đúng thứ trục C tồn tại để loại bỏ.

**Đã dựng phần tối thiểu để nó thành một cú bấm trên màn Người dùng & Vai trò:** vai `export_officer` mang **đúng một quyền** `export:confidential`, **không gán sẵn cho ai**, cộng một ngoại lệ hẹp của J1① cho phép `tenant_admin` gán vai đó (cùng khuôn ngoại lệ `employee` đã có, nhưng ép `scopeType='tenant'` thay vì `'self'` — vì trần xuất không gắn với bản ghi nào).

**Ba chốt độc lập giữ cho ngoại lệ đó không thành cửa sau** — mất một vẫn còn hai, mỗi chốt có test riêng + ca sống trong driver:
1. `export:confidential` là quyền **NÂNG TRẦN**, không phải quyền hành động: tự nó không gọi được endpoint nào. Muốn xuất thật vẫn phải có quyền nghiệp vụ của đường xuất (`payroll:export` = hrbp) — thứ `tenant_admin` không có và **không gán được** (vai `hrbp` mang cả tá quyền ghi mà nó không giữ ⇒ J1① chặn như thường). Driver đo: gán vai này cho `emp1` thì `emp1` vẫn 403.
2. J1③ chặn tự gán ⇒ `tenant_admin` không tự thành người xuất.
3. Mọi lần gán/từ chối vào `audit_log`, mọi lần xuất vào `export_log` — B0 rà được cả hai đầu.

Kèm hai bất biến mới đóng đinh trong `rbac-matrix.spec`: `export:confidential` **chỉ** thuộc `export_officer` (không vai nghiệp vụ nào) · `export_officer` **không mang quyền năng lực nào khác** — thêm một quyền vào vai này là biến ngoại lệ J1① thành leo thang thật, và test sẽ đỏ.

**Việc của B1:** vào màn Người dùng & Vai trò → chọn người (đề xuất: 1–2 người đang giữ vai `hrbp` phụ trách chuyển dữ liệu sang hệ lương) → gán vai **"Cán bộ xuất dữ liệu" (`export_officer`)**, phạm vi Toàn đơn vị. Thu hồi cũng một cú bấm. Không cần B3 can thiệp DB.

**VERIFY:** driver sống **18/18** (thêm 6 check cho đường cấp quyền, gồm 3 ca đối chứng chống leo thang) · full suite xanh sau khi thêm vai + ngoại lệ.

### Lát 2 — Quản trị nền tảng cho B3 · **🎯 MỐC DEMO** · 30/07/2026

**B3 vận hành được toàn hệ mà không đọc được một dòng đánh giá nào.** Bề mặt `/platform/*`: danh sách đơn vị kèm trạng thái · sức khoẻ toàn hệ · cờ tính năng · chi phí AI theo đơn vị · số lần xuất dữ liệu · tạo đơn vị mới. Tài khoản demo `platform@h01.nhg.local`.

**Chỗ khó nhất của lát — xuyên đơn vị mà không có `BYPASSRLS` (K1).** Giải bằng cách tách hai chiều, và đây là phần đáng đọc nhất của L2:

- **Ghi:** job làm mới snapshot đi **từng đơn vị một** qua `withTenant(t)` — vẫn trong RLS như mọi truy vấn nghiệp vụ khác, đếm dữ liệu của đúng đơn vị đó, ghi đúng dòng của đơn vị đó. **Không tồn tại một truy vấn nào đọc dữ liệu hai đơn vị cùng lúc.**
- **Đọc:** một GUC riêng, và **cố ý KHÔNG set tenant context**. Nhờ vậy mọi bảng nghiệp vụ trả 0 dòng — bán kính nổ **đo được bằng test**, không phải một lời hứa trong tài liệu: trong đường đọc nền tảng, `review`/`person`/`evidence`/`app_user`/`audit_log`/`export_log`/`scorecard` đều = 0, còn `tenant` ≥ 2. Kèm ca đối chứng chứng minh dữ liệu **có** thật (rỗng vì RLS, không vì DB rỗng).

Ba cách làm sai đã cân nhắc và loại: cấp `BYPASSRLS` cho vai người dùng (phá K1) · nới policy bảng nghiệp vụ (cùng hệ quả, khó thấy hơn) · để job chạy bằng OWNER connection (owner bỏ qua RLS ⇒ một lỗi trong job là một lần đọc chéo toàn bộ nội dung).

**Phòng tuyến thứ hai của K9 — cái mà RBAC guard không bắt được.** Nếu ai đó cấp thêm một quyền nghiệp vụ cho vai `platform_admin` **trong DB** (seed sửa tay, script vá), guard vẫn cho qua vì quyền có thật. Nên allowlist được **khai trong mã** (`PLATFORM_ADMIN_PERMISSIONS`), service tự so mỗi request và **tự khoá cả bề mặt** nếu lệch. Test dựng đúng tình huống đó rồi hoàn nguyên.

### Ba lỗi tự bắt trong L2 — hai đáng ghi vào sổ

① **RÒ DỮ LIỆU THẬT, do trùng tên quyền giữa hai tầng.** Kế hoạch ghi `platform_admin` có `exportlog:read`. Ca quét K9 bắt ngay: route `GET /export-log` — sổ vết **chi tiết** trong phạm vi đơn vị, gác đúng quyền đó — trả **200** cho `platform@`, tức B3 đọc được *ai xuất dữ liệu gì đi đâu* của H.01, phá thẳng K1. Đã tách `exportlog:read_metadata` (chỉ số đếm) khỏi `exportlog:read` (chi tiết, của B0). **Bài học: trùng tên quyền giữa hai tầng là một đường rò không nhìn thấy khi đọc mã — chỉ ca quét toàn bộ endpoint mới thấy.** Đây chính là lý do kế hoạch đòi "ca đối chứng bắt buộc" thay vì tin vào thiết kế.

② **`INSERT ... RETURNING` bị RLS chặn, và thông báo lỗi trỏ sai hướng.** Postgres áp policy **SELECT** lên mệnh đề RETURNING, mà `prisma.create()` **luôn** sinh RETURNING. Lỗi báo *"new row violates row-level security policy"* — nghe như WITH CHECK sai, thực tế là SELECT sai. Ba cách sửa, chọn cách **giữ** bất biến thay vì nới nó: không dùng RETURNING (id tự sinh), thay vì bật thêm quyền đọc cho đường ghi.

③ **Và một bài học về cách tôi ĐO.** Probe đầu tiên của tôi nối bằng `ipms_owner` — owner **bỏ qua RLS hoàn toàn** — nên nó "chứng minh" RLS cho qua trong khi thực tế đang chặn. Cùng họ với bài học "API dev server không watch ⇒ đo mã cũ": **kiểm chứng sai đối tượng thì kết quả xanh là vô nghĩa.** Đã đo lại bằng đúng role runtime (`ipms_app`).

**Lệch có chủ đích so với chữ trong kế hoạch:** kế hoạch ghi màn "nhật ký xuất dữ liệu" cho B3; tôi cho B3 **số lần xuất + lần gần nhất theo đơn vị**, không phải từng dòng. Vì đọc từng dòng nghĩa là biết đơn vị nào xuất dữ liệu gì đi đâu — đó là hồ sơ giám sát của B0, và K1 nói tầng nền tảng chỉ đọc metadata. Muốn xem chi tiết ⇒ đi qua ngoại lệ có thời hạn ở **L3**, đúng như kế hoạch đã định sẵn.

**Xác nhận thêm rằng L1 hoạt động:** khi L2 thêm route `/platform/export-activity`, snapshot bề mặt xuất của L1 **đỏ ngay** và buộc tôi phải khai `@ExportExempt` + cập nhật danh sách đã rà. Lớp fail-closed build-time làm đúng việc nó tồn tại để làm — trên một route do chính tôi thêm.

**VERIFY L2:** **687 test / 55 suite** · typecheck `shared`+`db`+`api` sạch · driver sống **25/25** trên API thật đã restart (+7 check cho L2, gồm ca quét 23 endpoint nghiệp vụ → 403 hết và ca chứng minh metrics chỉ chứa số đếm).

---

## Trục C — L2b · **31/07/2026 · Vai `support` chỉ-đọc — và một mâu thuẫn trong chính kế hoạch đã phải sửa**

**Tóm tắt cho người bận:** hỗ trợ kỹ thuật giờ đóng vai được người dùng thật để nhìn đúng cái họ nhìn, mà tự nó không ghi được một dòng nào. Tài khoản demo `support@h01.nhg.local`. Kèm theo: tính năng đóng vai xây ở trục B — vốn **không dùng được cho bất kỳ ai** — nay chạy.

### Việc đầu tiên phải làm là báo rằng kế hoạch sai

Kế hoạch §4 L2b dựa trên một tiền đề: vì `support` giữ *hợp của các quyền đọc*, điều kiện **J12①** ("không đóng vai người giữ quyền mình không có") sẽ **tự thoả với hầu hết persona**. Đọc mã thì tiền đề đó không đứng: J12① so với **toàn bộ** tập quyền của target, mà `employee` giữ `goal:write`/`checkin:write`, `manager` thêm `rating:approve`, `hrbp` thêm `payroll:export`. Một vai không-quyền-ghi (**K11**) không thể bao trùm tập đó. Ba điều **K11 ∧ J12① ∧ "support đóng vai được emp1/mgr/hr/exec"** không cùng đúng được — xây đúng như chữ trong kế hoạch thì 3/4 ca cổng ra đỏ.

Chủ dự án chốt hướng **siết lại phát biểu của J12① thay vì nới nó**: so actor với **quyền HỮU HIỆU** của phiên (= quyền target ∩ whitelist chỉ-đọc), không với toàn bộ quyền target. Đây không phải nới lỏng, và lý do đáng nhớ: thứ actor **thực sự nhận được** khi mở phiên đúng bằng phần giao đó — `PermissionGuard` đã cắt sạch quyền ghi (J11). Đòi actor phải giữ sẵn thứ nó không bao giờ nhận được không mua thêm an toàn nào; cái nó mua là một tính năng chết. Nhánh **chặn** vẫn nguyên: target đọc được thứ gì mà actor không có quyền đọc thì phiên vẫn bị từ chối.

**Hệ quả kèm theo, đáng giá hơn cả lát này:** sau khi sửa, `admin@` đóng vai lại được `emp1@`/`hr@`. Trước đó — do L0 tước sạch quyền ghi nghiệp vụ của `tenant_admin` (J2) giao với J12① bản cũ — `tenant_admin` chỉ đóng vai được người **không có quyền nào**, tức người mà đọc gì cũng 403. Driver sống trục B đã đo được triệu chứng đó; L2b là chỗ chữa nguyên nhân.

### Vai `support`

Tập quyền **suy ra, không liệt kê tay**: đúng bằng whitelist chỉ-đọc + `user:impersonate`. Nhờ nó *bằng* whitelist, `support` đóng vai được **mọi** persona mà không cần một ngoại lệ nào trong J12 — và permission đọc thêm vào whitelist sau này tự động có mặt, không lặng lẽ tạo ra một persona không đóng vai được. `user:impersonate` là quyền ghi duy nhất và cũng là năng lực định nghĩa vai; nó không nằm trong whitelist nên trong một phiên đang đóng vai thì bị cắt ⇒ không có phiên lồng nhau.

### Hai lỗ tự bắt khi dựng lát này

① **J12 chỉ so MÃ QUYỀN, hoàn toàn không xét SCOPE** — trong khi phiên đóng vai giao cho actor đúng **scope của target**. Một người giữ `user:impersonate` ở scope `org_unit`, đóng vai một người scope `tenant`, sẽ đọc được toàn đơn vị: leo thang theo chiều **phạm vi**, không theo chiều mã quyền, nên J12① không nhìn thấy. Hôm nay chưa khai thác được (chỉ `tenant_admin`/`support` giữ quyền này, đều scope tenant) — nhưng "chưa ai cấp sai" không phải một cơ chế bảo vệ, cấp sai chỉ là một lần bấm ở màn Người dùng & Vai trò. Đã thêm **J12⑤**: quyền đóng vai chỉ có hiệu lực ở scope tenant, kèm ca kiểm dựng đúng tình huống đó.

② **SoD "support ⟂ tenant_admin" không phát biểu được bằng `sod_rule`.** Bảng SoD hiện có làm việc theo **cặp quyền**, mà `support` là **tập con** quyền của `tenant_admin` — không tồn tại cặp quyền nào diễn tả được ràng buộc này. Đây là ràng buộc **về vai**, nên đã thêm một cơ chế nhỏ tương ứng (`MUTUALLY_EXCLUSIVE_ROLES`, thực thi **hai chiều** ở J1⑤) thay vì bẻ cong bảng cũ. Ghi lại để lần sau gặp SoD kiểu này biết nó có hai loại.

### Giao diện

`support` thấy đúng **một** mục quản trị: màn Người dùng & Vai trò — nơi duy nhất có nút "Đóng vai". Màn Cơ cấu tổ chức bị ẩn khỏi vai này (J4: không hiện thứ API sẽ từ chối). Các nút sửa/khoá/gán vai trên màn đó vốn đã gate theo permission nên tự động không hiện.

**VERIFY L2b:** **719 test / 56 suite** (baseline 687, +32) · typecheck `shared`+`db`+`api`+`web` sạch · `next build` PASS · driver sống **34/34** trên API :4000 **đã kill+restart** (+9 check cho L2b: quét 22 bề mặt ghi → 403 hết, bốn persona đóng vai được, J12②/J12⑤/J1⑤ hai chiều, và ca đối chứng `admin@ → emp1@`).

**Việc kế tiếp:** L3 — ngoại lệ chính sách có thời hạn (K4 trần 72h, K5 người xin ≠ người duyệt).

---

## Trục C — L3 · **31/07/2026 · Ngoại lệ chính sách có thời hạn — đường nới quyền hợp lệ duy nhất**

**Tóm tắt cho người bận:** từ nay khi một bất biến chặn đúng người vào đúng lúc cần, có một đường đi hợp lệ: xin → người khác duyệt → quyền mở trong tối đa 72 giờ → tự rụng. Không ai gia hạn được, kể cả sửa thẳng DB. Mỗi lần dùng đều để lại vết đếm được.

**Vì sao lát này đáng làm thay vì "cứ để chặt":** mọi bất biến của trục C đúng cho ngày thường và sai cho một ca sự cố lúc 2 giờ sáng. Hệ không có đường nới hợp lệ thì người ta nới bằng đường không hợp lệ — cấp vai thẳng trong DB, hoặc mượn tài khoản người khác. Cả hai đều không để lại vết đọc được, tức mất luôn thứ mà cả trục này dựng lên để có.

### Bốn chốt, mỗi chốt đặt ở đúng tầng

| Bất biến | Thực thi ở đâu | Vì sao ở đó |
|---|---|---|
| Trần 72 giờ (đơn vị **hạ** được, không nâng) | service + validator cấu hình | chính sách, đổi theo đơn vị |
| **Không gia hạn** | **trigger DB** | phải sống lâu hơn mọi bản deploy — đây là chỗ "72 giờ" biến thành vĩnh viễn nếu để hở |
| **Hết hạn là hết** | `PermissionGuard`, mỗi request | job dọn hỏng cũng không mở ra quyền nào |
| Người xin ≠ người duyệt ≠ người nhận (K5) | service, ba vế | thiếu vế "người duyệt ≠ người nhận" thì nhờ người khác đứng tên xin hộ là lách xong |

**Kiểm tại cửa, không tin job dọn** — đây là điểm tôi muốn chủ dự án để ý nhất. Cách làm hiển nhiên là để một job nền quét và gỡ vai hết hạn; khi đó giữa mốc hết hạn và lần job chạy kế tiếp luôn có một khoảng quyền vẫn dùng được, dài ngắn tuỳ job còn sống hay không — tức một bất biến an ninh phụ thuộc sức khoẻ của một tiến trình nền. Test chứng minh điều ngược lại: rút hạn xuống 2,5 giây, chờ thật, **không gọi job nào**, quyền mất — và hàng `user_role` vẫn nằm nguyên đó chưa ai dọn.

**Ngoại lệ mở quyền ĐỌC, không mở đường XUẤT và không mở quyền GHI.** Không phải "cho chắc": hết hạn thu hồi được một quyền đọc, nhưng không thu hồi được một tệp đã rời hệ hay một bản ghi đã hỏng. Bất đối xứng về khả năng hoàn tác là toàn bộ lý do. Nên `export:confidential` (K3) và `audit:read` (J3) **không** nới được — có ca kiểm cho cả hai.

**Ai duyệt:** `data_steward` (B5 tuân thủ) — vai **duy nhất** giữ `exception:approve`, và cố ý **không** có `exception:request`. Người vận hành cần nới (B3 nền tảng, quản trị đơn vị) chỉ xin được. Ma trận RBAC có test đóng đinh: không vai nào giữ đồng thời hai quyền đó — vì nếu có, K5 chỉ còn là "đừng bấm nhầm nút".

**Lối ra mà L2 đã hẹn nay chạy thật:** `platform_admin` bị L2 giới hạn ở số đếm; muốn xem sổ vết chi tiết một sự cố thì đi qua đúng đường này. Driver sống chứng minh trọn vòng trên API thật.

### Hai phát hiện khi chạy thật

① **`ipms_app` KHÔNG có quyền INSERT vào `role`.** Bản đầu tạo vai tạm lúc duyệt đơn và ăn `permission denied for table role`. Đó không phải thiếu sót cấu hình mà là một bất biến có từ Phase 0: tầng ứng dụng không đúc ra vai và quyền (cùng họ [F1] "app chỉ ĐỌC feature_flag"). **Cách sửa sai mà tôi đã loại: `GRANT INSERT ON role`** — nó biến "một request bất kỳ đúc được một vai mang quyền bất kỳ" thành chuyện có thể xảy ra. Cách chọn: seed dựng sẵn đúng một vai cho mỗi quyền trong allowlist; thiếu vai thì fail-closed 422, không có đường "tự tạo cho tiện". Các vai này tenant-scoped nên **không lọt vào danh mục `tenant_admin` gán tay được**.

② **Một lỗi thật trong báo cáo unit economics, không liên quan L3, lộ ra vì DB dev vượt ngưỡng.** `GET /ai/economics` lấy 10.000 dòng mới nhất **rồi mới** loại traffic eval. Dưới ngưỡng thì hai cách cho kết quả giống hệt nhau — nên lỗi ngủ yên từ trục AI. Vượt ngưỡng thì mẫu bão hoà: mỗi dòng eval mới **đẩy một dòng người dùng thật ra khỏi mẫu**, và con số "calls" **tụt xuống** khi hệ chạy eval nhiều hơn. DB dev đang có 11.287 dòng/30 ngày, **8.765 trong đó là eval** — tức báo cáo đang đếm thiếu hành vi người dùng thật, đúng con số PRD §16 dùng để quyết "có bật live không". Đã chuyển phép lọc vào truy vấn (giữ lớp lọc trong bộ nhớ làm lưới chắn thứ hai).

### Nợ kỹ thuật đã trả

`packages/db/src/seed.ts` **hết chép tay `PERMISSIONS`** — nay import thẳng từ `@ipms/shared`. Món này đã cắn đúng ba lần (L0, L1, L3), mỗi lần cùng một kịch bản: seed ném `Argument 'permissionId' is missing` không kèm tên quyền, phải dò tay. Hai lần trước hoãn với lý do "thêm một cạnh vào đồ thị build, xứng một lát riêng"; cạnh đó hoá ra là **một dòng trong package.json + một dòng import**. Ghi lại vì bài học không nằm ở kỹ thuật mà ở ước lượng: cái giá của việc hoãn đã lớn hơn cái giá của việc làm từ lần thứ hai.

Cũng gom về một mối: mệnh đề "vai còn hiệu lực" (`activeUserRoleWhere`) — có **bảy** chỗ trong API đọc `user_role` để suy ra quyền; thêm cột `expires_at` mà chỉ nhớ ở sáu chỗ thì chỗ thứ bảy hoặc chặn oan, hoặc coi vai đã hết hạn là còn hiệu lực.

**VERIFY L3:** **761 test / 58 suite** (baseline 719, +42) · typecheck `shared`+`db`+`api`+`web` sạch · `next build` PASS · driver sống **42/42** trên API :4000 đã kill+restart, **chạy hai vòng liên tiếp cùng kết quả** (+8 check cho L3).

**Việc kế tiếp:** L4 — cờ rủi ro sinh tự động + luồng sự cố + dashboard bốn khối.

---

## Trục C — L4 · **31/07/2026 · Cờ rủi ro sinh tự động + luồng sự cố + bốn đường đọc**

**Tóm tắt cho người bận:** hệ tự dựng sổ rủi ro từ những gì nó đã ghi — không có màn nhập tay. Một vi phạm thật xảy ra là cờ hiện ngay trên bốn bề mặt, mỗi bề mặt đúng mức chi tiết mà vai đó được thấy. Màn mới cho B5/B0: `/compliance/risk`.

### Vì sao K8 ("sinh tự động") là bất biến chứ không phải tiện ích

Một sổ rủi ro nhập tay đo lường **sự chăm chỉ của người nhập**, không đo lường rủi ro. Nó đầy lúc mới triển khai rồi rỗng dần, và cái rỗng đó bị đọc nhầm thành "hệ thống an toàn". Cờ suy ra từ sự kiện thì rỗng chỉ có một nghĩa: không có sự kiện nào xảy ra. Vì vậy màn hình **không có** nút tạo cờ, và **không có** nút bỏ qua/xoá cờ — xử lý một cờ nghĩa là gắn nó vào một sự cố và đóng sự cố đó, có người phụ trách và nguyên nhân gốc ≥20 ký tự (ràng buộc ở tầng DB, "đã xong" bị từ chối).

### Bốn đường đọc, ba mức chi tiết

| Đường | Ai | Thấy gì |
|---|---|---|
| `/compliance/risk` (màn mới) | B5 tuân thủ · B0 kiểm toán | Chi tiết từng cờ + hồ sơ sự cố |
| `/risk/summary` | V1 điều hành | Chỉ số đếm theo loại và mức |
| `/platform/risk` | B3 nền tảng | Số đếm **theo đơn vị**, xuyên đơn vị qua snapshot |
| `/audit-logs` (sẵn có) | B0 | Nguồn gốc — cờ chỉ là lớp suy ra, không phải nguồn sự thật thứ hai |

`risk:read` (chi tiết) và `risk:read_summary` (số đếm) là **hai quyền tách biệt**, đúng bài học đắt nhất của L2: một cái tên dùng cho hai tầng là đường rò không nhìn thấy khi đọc mã. B3 và V1 gọi `/risk` đều nhận 403 — có ca kiểm.

**SoD:** B5 (`data_steward`) là vai **duy nhất** mở/đóng sự cố; B0 (`auditor`) đọc được mọi thứ nhưng không xử lý — người soát không phải người xử lý.

### Lỗ hổng phát hiện khi rà nguồn, đã vá

**L1 chỉ ghi vết lần xuất THÀNH CÔNG.** Một lần xuất bị chặn không để lại gì ngoài mã 403 trả về client. Nhưng "có người vừa thử mang dữ liệu `restricted` ra ngoài" mới đúng là tín hiệu B0/B5 cần thấy nhất: lần thành công nghĩa là chính sách cho phép, lần thất bại nghĩa là **có người chạm vào tường**. Đã thêm vết `export.blocked` ở `ExportGuard` (ghi vào `audit_log`, **không** vào `export_log` — sổ xuất là sổ những gì đã *rời* hệ, nhét một dòng "không rời" vào đó sẽ làm mọi phép đếm trên sổ đó sai).

### Hai hệ quả hệ thống tự bắt khi chạy đủ suite và driver

① **Ai đọc được chi tiết thì đương nhiên phải đọc được số đếm.** Bản đầu chỉ cấp `risk:read` cho B5, và `GET /risk/summary` trả **403 cho chính B5** — quyền hẹp hơn lại bị chặn ở chỗ quyền rộng hơn cho qua. Guard so từng permission một, không suy diễn quan hệ bao hàm, nên "chi tiết ⊇ tổng hợp" phải khai tường minh. Driver sống bắt được, không phải test.

② **Thêm một quyền cho vai persona có thể làm gãy đường onboard persona đó.** Khi `exec_viewer` nhận `risk:read_summary`, J1① (không gán vai chứa quyền mình không có) khiến `tenant_admin` **không còn onboard được người điều hành** — mốc demo của trục B gãy vì một thay đổi ở trục C, và nó lộ ra ở `admin-api.spec` chứ không ở bất kỳ test nào của L4. Ràng buộc chung rút ra, đã đóng đinh bằng test: *mọi quyền của một vai persona phải nằm trong tập quyền của vai onboard nó.*

③ **Một lỗi ĐO trong driver, đáng ghi vì sẽ lặp:** ca cổng ra so độ dài danh sách `/risk` trước/sau. Danh sách có trần trang 100 dòng, mà DB dev đã có 744 cờ mức cao — độ dài đứng yên dù cờ mới vẫn sinh, và driver báo đỏ một tính năng đang chạy đúng. Đã đổi sang đếm bằng bản tổng hợp (không trần). Mọi phép so trên danh sách có phân trang đều dính bẫy này.

### Khoảng cách so với kế hoạch, đã báo

- **"Đăng nhập bất thường" KHÔNG có cờ** — hệ chưa có nguồn: `/auth/dev-token` không ghi phiên, và đăng nhập thật sẽ do Entra ID đảm nhiệm (ngoài phạm vi trục). Bịa một nhóm cờ không có nguồn sẽ tạo ra một nhóm vĩnh viễn bằng 0 trên dashboard — trông như "an toàn" trong khi thực ra là "không đo". Có test đóng đinh việc **không** có nhóm này.
- **B3 chưa có màn hình** — `/platform/risk` là API, đúng như toàn bộ bề mặt `/platform/*` từ L2 (chưa có màn nào). Màn duy nhất của lát này là `/compliance/risk` cho B5/B0.

**VERIFY L4:** **794 test / 60 suite** (baseline 761, +33) · typecheck `shared`+`db`+`api`+`web` sạch · `next build` PASS (35 route, thêm `/compliance/risk`) · driver sống **48/48** trên API đã kill+restart, **chạy hai vòng liên tiếp cùng kết quả** (+6 check cho L4).

**Việc kế tiếp:** L5 — thời hạn lưu trữ & xoá dữ liệu cá nhân (chế độ thử bắt buộc chạy trước, K6 không đụng sổ vết, K7 không xoá dữ liệu kỳ chưa chốt).

---

## Trục C — L5 · **31/07/2026 · Thời hạn lưu trữ & xoá dữ liệu cá nhân (NĐ13)**

**Tóm tắt cho người bận:** hệ giờ có chính sách lưu trữ cho từng nhóm dữ liệu, và một cơ chế xoá **bắt buộc chạy thử trước**. Không ai xoá được gì mà chưa nhìn thấy trước mình sắp xoá cái gì. Sổ kiểm toán và sổ xuất dữ liệu nằm ngoài tầm với của job, ở ba tầng độc lập.

### Vì sao lát này thận trọng hơn hẳn các lát trước

Đây là lát duy nhất của trục có khả năng **phá huỷ** dữ liệu. Một job xoá chạy đúng thì im lặng — nên chạy sai cũng im lặng. Bốn rào, mỗi rào chặn một kiểu hỏng khác nhau:

| Rào | Chặn kiểu hỏng nào |
|---|---|
| Chạy thật phải trỏ tới một lượt **chạy thử** còn hạn, cùng vân tay kế hoạch | "bấm nhầm nút" và "dữ liệu đã đổi kể từ lúc xem" |
| **K6** — hai sổ giám sát không có executor, không lưu được chính sách xoá (CHECK ở DB) | hệ tự xoá bằng chứng của chính mình |
| **K7** — bản ghi thuộc kỳ chưa chốt bị loại, và **số bị loại được ghi lại** | xoá dữ liệu đang dùng; và làm nó *đo được* thay vì tin lời |
| Chạy theo **danh sách id đã lập kế hoạch**, không chạy lại theo điều kiện | phạm vi lúc chạy rộng hơn phạm vi lúc duyệt |

**Ba con số của B5 (§6 giả định 2) đã vào seed** dưới dạng chính sách chuẩn tập đoàn: kết quả đánh giá **5 năm** (khử danh) · nhật ký hệ thống **2 năm** (xoá cứng) · nhật ký kiểm toán **10 năm** (kho lạnh). Ghi vào seed thay vì để trống có chủ đích — không có chính sách thì hệ rơi về mặc định suy từ mức phân loại, và một con số suy diễn trông y hệt một con số đã được người có thẩm quyền duyệt. Nay `source` trả về "chuẩn tập đoàn" và **B5 biết chính xác cái gì đang chờ mình chốt**.

**Khử danh chứ không xoá hàng** với kết quả đánh giá: điểm số và hạng là dữ liệu thống kê hợp pháp để giữ; thứ nhận dạng được một con người là các trường văn bản tự do. Xoá cả hàng sẽ phá số liệu lịch sử mà không thu thêm lợi ích riêng tư nào.

**Đơn vị chỉ RÚT NGẮN được thời hạn, không kéo dài** (trigger DB) — giữ lâu hơn là tăng phơi nhiễm, đúng chiều NĐ13 hạn chế.

### Ba lỗi tự bắt, đều đắt nếu lọt

① **`ipms_app` không có quyền DELETE trên `ai_interaction`** — lượt chạy thật đầu tiên ăn `permission denied`. Đây là bất biến có thật của hệ (nhật ký chỉ thêm), cùng họ với phát hiện ở L3 (app không đúc được `role`). **Cách sửa sai đã loại:** `GRANT DELETE` trần trụi — nó mở khả năng xoá cho *mọi* đoạn mã, kể cả một lỗi lập trình ở route không liên quan. **Cách chọn:** cấp quyền nhưng chốt sau GUC `app.retention_run` mà trong mã chỉ đúng một hàm bật, gọi từ đúng nhánh `apply` — cùng khuôn `app.platform_write` L2 đã dựng. Có ca kiểm: cùng lệnh xoá đó, chạy ngoài đường lưu trữ thì **không một dòng nào mất**.

② **Job khử danh không idempotent.** Phép lọc "còn thứ để khử" dùng `IS NOT NULL`, nhưng khử danh **ghi đè một chuỗi** chứ không đặt NULL — nên hàng đã xử lý vẫn lọt vào kế hoạch lượt sau: mỗi lượt chạy lại báo đúng con số cũ và `affected` phồng lên vô hạn. Hồ sơ tuân thủ khi đó nói dối theo hướng nguy hiểm nhất — **luôn còn việc phải làm, nên không ai nhận ra công việc đã xong từ lâu.**

③ **Một test bất định theo thứ tự dữ liệu.** Ca "hồ sơ lượt chạy không sửa lại được" lấy dòng đầu tiên rồi gán lại đúng giá trị cũ: chạy riêng spec thì dòng đầu tình cờ khác giá trị gán ⇒ xanh; chạy full suite thì thứ tự đổi ⇒ không có thay đổi nào ⇒ trigger không phản đối ⇒ đỏ. **Test chỉ xanh nhờ thứ tự dữ liệu là test không nói lên điều gì** — cùng họ với bài học "assert chạy 0 lần" của trục A.

### Khoảng cách đã báo

- **`cold_archive` chưa thực thi được** — hệ chưa có kho lưu trữ lạnh. Chính sách vẫn **lưu được** (ghi nhận ý định của B5) nhưng lượt quét trả lỗi nói rõ "chưa thực thi được" thay vì im lặng trả 0 bản ghi: một lượt chạy "thành công, 0 bản ghi" sẽ bị đọc thành "đã lưu trữ xong".
- **Chỉ hai nhóm dữ liệu có bộ thực thi** (`review.result`, `system.log`). Mã có chính sách nhưng chưa có executor → báo thẳng "chưa hỗ trợ", fail-closed. Danh sách mở rộng khi B5 chốt thêm nhóm nào cần xử lý.
- **Chưa có màn hình** — L5 là API + driver, đúng nhịp L2/L3.

**VERIFY L5:** **825 test / 62 suite** (baseline 794, +31) · typecheck `shared`+`db`+`api`+`web` sạch · `next build` PASS · driver sống **55/55** trên API đã kill+restart, **chạy hai vòng liên tiếp cùng kết quả** (+7 check cho L5).

**Việc kế tiếp:** L6 — soát toàn hệ 11 mục governance (§7 Strategic Context) + cập nhật ngược `so-nang-luc-ipms.md` và bộ BRD.

---

## Trục C — L6 · **31/07/2026 · Soát 11 mục governance + cập nhật ngược tài liệu**

**Tóm tắt cho người bận:** điểm xuất phát của trục C là "đủ 6, hở 5". Hết L6: **9/11 đạt, 2 mục còn một phần, 0 mục trống**. Bảng đối chiếu không nằm trong tài liệu — nó là một **test chạy được**, và tài liệu bán hàng bị khoá vào nó.

### Bảng đối chiếu là test, không phải tài liệu

Kế hoạch đòi "mục → nơi hiện thực → test chứng minh; mục nào không chỉ ra được test là chưa xong". Một bảng trong Markdown chỉ đúng vào ngày người ta viết nó, nên bảng này sống trong `governance-conformance.spec.ts` và tự kiểm ba lớp:

- **Spec chứng minh phải TỒN TẠI** trên đĩa — đổi tên hay xoá một spec ⇒ đỏ ngay, không phải phát hiện sau sáu tháng.
- **Bất biến cứng đo ở DB** — 8 bảng governance, 8 trigger, quyền `UPDATE/DELETE` trên hai sổ giám sát, cột hạn của vai tạm, CHECK constraint K6. Kiểm bằng `pg_catalog`, không bằng niềm tin rằng migration đã chạy.
- **Không có đường đánh dấu xong cho đẹp** — mục `partial` bắt buộc kèm ghi chú ≥80 ký tự mô tả còn thiếu gì.

### Hai mục còn "một phần" — và vì sao tôi không tự nâng lên "đạt"

**Mục 4 — luồng phê duyệt dùng chung (BR-M13-03).** Cả bốn loại đối tượng (KPI, cấu hình, kết quả đánh giá, ngoại lệ chính sách) đều có phê duyệt và đều cưỡng chế người-duyệt-khác-người-tạo — nhưng bằng **bốn cơ chế riêng**. Tiêu chí đòi "cùng một cơ chế". Gộp lại là refactor chạm cả bốn module đang chạy đúng: rủi ro hồi quy cao hơn lợi ích tuân thủ, nên tôi tách thành việc riêng có kế hoạch thay vì nhét vào L6. **Cần B5 quyết ưu tiên.**

**Mục 11 — dashboard bốn khối.** Bốn *đường đọc* đều có và đều có test, nhưng chỉ B5/B0 có **màn hình**. B3 và V1 mới có API — đúng nhịp đã chọn từ L2. Tiêu chí nói "dashboard", mà dashboard nghĩa là màn hình, nên không tự nâng.

### Nợ đã trả: worker đẩy dữ liệu ra ngoài mà không qua cổng xuất

Ghi nợ từ L2, trả ở đây. Từ L1 tới L5, route `POST /integrations/outbox/dispatch` khai `@Exported` và được `ExportGuard` gác đúng như K2 đòi — **nhưng worker BullMQ gọi thẳng `dispatchTenant()`**, không qua HTTP, không qua guard, không ghi vết. Nghĩa là đường chạy thật trong production nằm ngoài cổng, còn đường bấm tay thì được gác. Đã dời cổng + ghi vết xuống tầng service để cả hai người gọi đi qua cùng một chỗ; route chuyển sang `@ExportExempt` để không ghi vết hai lần.

Kèm một tính chất mới đáng giá: **job nền không mang theo quyền của ai**, nên mọi mã dữ liệu cần quyền bổ sung đều không tự động xuất được. Ngày nào có người đổi `system.log` thành `confidential`, đường này **đóng** thay vì âm thầm mang dữ liệu nhạy cảm ra ngoài bằng quyền của một tiến trình nền.

### Ba lỗi tự bắt khi soát

① **Dời chốt kiểm soát suýt làm mất phần ghi vết của nó.** Guard ghi audit `export.blocked` khi chặn; service bản đầu chỉ ném lỗi. Driver sống bắt: "chặn xuất nhưng không sinh cờ". **Bài học: dời một chốt thì phải dời cả phần ghi vết — phần từ chối thì người dùng thấy ngay, phần ghi vết thì không ai thấy thiếu.**

② **`GET /export-log` trả `total` là số dòng của TRANG, không phải tổng.** Sổ có 500 lần xuất thì nó báo 200 và đứng yên mãi mãi — một trường tên `total` mà không phải tổng là kiểu sai lệch không ai kiểm chứng lại. Đây là **lần thứ hai trong trục** một phép đo bị trần trang đánh lừa (lần đầu ở L4 với danh sách cờ rủi ro). Đã trả số đếm thật + `returned` tách bạch.

③ **Một mã BR trải trên nhiều mục thì trạng thái của nó là mục YẾU NHẤT.** Bản đầu của test đối chiếu so từng cặp, nên đòi BRD ghi "Đã có" cho `BR-M13-04` trong khi phần dashboard chưa xong. Hứa theo phần mạnh nhất là cách tài liệu bán hàng bắt đầu nói dối.

### Cập nhật ngược tài liệu — và khoá lại bằng test

`brd-nen-tang.mau.json`: **6 mã đổi trạng thái** — `BR-M08-06`, `BR-M11-06`, `BR-M13-02`, `BR-M13-05`, `BR-M13-06` → **Đã có**; `BR-M13-04` → **Một phần**. Bộ BRD đã sinh lại: **74 yêu cầu / 13 module, còn 8 "Chưa có"** (trước trục C là 13).

`so-nang-luc-ipms.md`: dòng NĐ13 đổi từ *"PT — chưa có retention engine"* sang *"VH cho hai nhóm dữ liệu · PT cho phần còn lại"*, **giữ nguyên cảnh báo ⛔ không hứa "tuân thủ NĐ13 sẵn"**; thêm 5 dòng năng lực mới của trục C (sổ đăng ký dữ liệu, kiểm soát xuất, ngoại lệ có hạn, cờ rủi ro, quản trị nền tảng) — mỗi dòng ghi rõ phần nào VH, phần nào PT.

Hai test khoá vòng lặp này lại: trạng thái BRD phải khớp bảng đối chiếu, và sổ năng lực không được còn câu đã sai. **Lệch theo chiều "tài liệu hứa nhiều hơn mã làm được" thì thành cam kết với khách** — đó là chiều nguy hiểm.

**VERIFY L6:** **869 test / 63 suite** (baseline 825, +44) · typecheck `shared`+`db`+`api`+`web` sạch · `next build` PASS · driver sống **55/55** trên API đã kill+restart, **chạy hai vòng liên tiếp cùng kết quả**.

**Việc kế tiếp:** L7 — verify toàn trục + mời Reviewer đối kháng (vé đánh số từ **F191**).

---

## Trục C — L7 · **31/07/2026 · Verify toàn trục + đội đỏ tự đánh — SẴN SÀNG MỜI REVIEWER**

**Trạng thái:** mọi phép kiểm của kế hoạch §4 L7 đã chạy và xanh. **Reviewer đối kháng là bước của chủ dự án** (`/code-review ultra`) — tôi không tự gọi được, và cũng không nên: một bên tự chấm mình thì không còn là đối kháng.

### Verify toàn trục

| Phép kiểm | Kết quả |
|---|---|
| Bộ test đầy đủ, `runInBand` | **869/869 · 63 suite** (điểm xuất phát trục C: 633) |
| Typecheck `shared` + `db` + `api` + `web` | sạch |
| `next build` | PASS |
| Render mọi route web | **36/36** (35 trang trả 200; `/` là redirect 307 sang `/exec/cockpit` — đúng thiết kế) |
| Driver sống `verify-governance.mjs` | **55/55**, chạy **hai vòng liên tiếp cùng kết quả**, trên API đã kill+restart |
| Đội đỏ `verify-redteam-truc-c.mjs` *(mới)* | **16/16 đòn bị chặn**, 0 lỗ |

### Đội đỏ tự đánh — đánh đúng sáu trọng tâm Reviewer sẽ soi

Kế hoạch §4 L7 chỉ định sẵn năm hướng tấn công cộng một ca đối chứng bắt buộc. Tôi viết một driver riêng đi tìm **đường vòng**, khác hẳn driver kia (chứng minh tính năng chạy đúng). Kết quả: **không tìm thấy lỗ nào**.

Những đòn đáng kể đã bị chặn: mượn quyền người khác qua phiên đóng vai để xuất dữ liệu · nới trần xuất bằng ngoại lệ có hạn (K3 không có đường vòng) · đẩy outbox qua đường worker khi dữ liệu bị siết lên `restricted` · quét toàn bộ 13 bề mặt nghiệp vụ bằng token `platform_admin` · tự duyệt đơn ngoại lệ của chính mình, và duyệt cho chính mình qua người khác đứng tên xin · chạy job xoá bằng lượt thử của **mã dữ liệu khác** · đặt chính sách xoá cho sổ kiểm toán · sửa/xoá một cờ rủi ro bằng tay.

**Ca đối chứng bắt buộc cũng xanh:** nhân viên, HR, quản trị đơn vị và kiểm toán viên đều làm được đúng việc của mình — **các hạn chế mới không chặn oan luồng nghiệp vụ đang chạy**. Đặc biệt: `tenant_admin` vẫn gán được `employee` và `exec_viewer`, tức mốc demo onboard của trục B còn nguyên sau bảy lát.

### Ba ghi nhận cần chủ dự án quyết — đúng thiết kế, không phải lỗi

① **K9 nới được tạm thời qua đường ngoại lệ hợp lệ — và bề mặt nền tảng TỰ KHOÁ khi đó.** `platform_admin` xin được quyền `person:read`, B5 duyệt, và nó đọc được `/persons`. Nhưng ngay lúc đó `GET /platform/tenants` trả **409**: phòng tuyến thứ hai của L2 (`assertWithinAllowlist`) phát hiện vai giữ quyền ngoài allowlist và khoá cả bề mặt nền tảng. Hai lớp bảo vệ tương tác **đúng chiều** — nới quyền đọc thì mất quyền vận hành, không có trạng thái "vừa xuyên đơn vị vừa đọc nội dung". Đáng ghi vào hồ sơ vì hành vi này không hiển nhiên với người vận hành: họ sẽ thấy màn nền tảng "hỏng" ngay sau khi được duyệt một ngoại lệ.

② **Không có trần TỔNG thời gian ngoại lệ.** Trần 72 giờ chặn đúng từng đơn, nhưng xin đơn mới nối nhau thì một quyền có thể duy trì lâu dài. Mỗi lần vẫn cần B5 duyệt và để lại vết đầy đủ, nên đây là **quyết định chính sách** chứ không phải lỗ kỹ thuật: có nên thêm trần "tối đa N giờ trong 30 ngày cho cùng một người + cùng một quyền" không?

③ **`cold_archive` vẫn chưa thực thi được** (chưa có kho lạnh) và **`BR-M13-03` — luồng phê duyệt dùng chung — vẫn "một phần"** (bốn cơ chế riêng). Cả hai đã ghi ở L5/L6, nhắc lại ở đây để không trôi khi đóng sổ trục.

### Gợi ý trọng tâm cho Reviewer đối kháng

Vé đánh số tiếp từ **F191**. Sáu hướng tôi đã tự đánh và không thấy lỗ — nên Reviewer nên soi **những chỗ tôi có thiên kiến**: ① bề mặt nào KHÔNG đi qua guard (job nền, `@Res` raw, SSE) mà chạm được dữ liệu — L6 vừa vá một chỗ như thế, khả năng còn chỗ khác ② chỗ tôi tự viết cả mã lẫn test chứng minh cho cùng một bất biến ③ tương tác GIỮA các lát (ngoại lệ × nền tảng đã lộ ra một cái ở ①; còn cặp nào?) ④ các phép ĐO trong test/driver — trục này đã có **ba lỗi đo** (L4 danh sách có trần, L6 `total` là số dòng trang, L7 đội đỏ bắt nhầm dữ liệu cũ), nên chỗ nào tôi khẳng định "đã chứng minh" cần soi lại cách đo.

**Ba lát cuối không phát sinh vé nào của chính tôi** — mọi lỗi tìm được đều đã vá trong cùng lát và ghi lại ở mục tương ứng.

---

## Trục C — vá theo Reviewer đối kháng · **05/08/2026 · 11/11 vé đã đóng (F191–F200)**

Reviewer đối kháng đã chạy trên toàn trục (`2f5c1ec..d8ce716`, 75 tệp) và trả **11 phát hiện**. Toàn bộ đã vá. Ba trọng tâm nặng nhất mà Reviewer **không** tìm được lỗ vẫn giữ nguyên kết luận: cách ly `withPlatform` (K1), chuỗi trigger K4/K6/K7 ở DB, và K5 ba vế.

### Ba vé đáng đọc kỹ

**F191 — khử danh ghi đè bản ghi vốn rỗng, không hoàn tác được.** Từ Prisma 4.0, `not`/`notIn` **trả về cả hàng NULL** (thay đổi phá vỡ tương thích; repo dùng 5.22). Bộ lọc `{ not: ANON }` vì thế kéo cả những phiếu đánh giá chưa ai viết gì vào kế hoạch, rồi ghi đè sáu chuỗi `[đã khử danh…]` lên chúng. Hai hậu quả: hồ sơ tuân thủ đếm sai, và hồ sơ đọc sau này sẽ tưởng ở đó **từng có** dữ liệu cá nhân.

Điều đáng ghi hơn cả bản vá: **một ghi chú trong mã đã khẳng định điều ngược lại** — và chính câu đó được đọc như bằng chứng khi viết bộ lọc. Câu sai ấy nằm ở `economics.service.ts` từ L3, nay đã đính chính tại chỗ. Bài học: một ngữ nghĩa thư viện mà ta chỉ **suy ra** rồi viết vào ghi chú sẽ được tin ở mọi lần sửa sau. Bản vá thêm hai thứ: điều kiện ba vế (`not: null` + loại `ANON` + loại chuỗi rỗng), và **chạy từng cột** thay vì đè cả sáu — cột vốn NULL nay giữ nguyên NULL.

**F192 — ngoại lệ đã duyệt làm khoá cả bề mặt nền tảng.** Đúng như ghi nhận ① của L7, nhưng Reviewer chỉ ra thêm: `exportlog:read` nằm trong danh mục quyền nới được **kèm đúng ca dùng "B3 điều tra sự cố xuất dữ liệu"** — tức hai danh sách trong mã đang mâu thuẫn nhau. Theo quyết định của chủ dự án (giữ cơ chế, làm cho nó nói rõ), bản vá làm ba việc: cảnh báo hiện **ngay lúc nộp đơn** và **ngay lúc duyệt** khi người nhận là tài khoản nền tảng; 409 nay phân biệt *quyền tạm hợp lệ* (nói rõ hết hạn lúc nào, gỡ bằng `revoke`) với *trôi cấu hình* (rà lại vai trong DB); và vết duyệt ghi luôn `platform_surface_locked` để sau này không ai phải tranh cãi người duyệt có biết hệ quả hay không.

**F195 — cổng GUC ở tầng DB chưa từng có hiệu lực.** `feature_flag` có policy PERMISSIVE `tenant_or_global` khai `FOR ALL` chỉ-USING từ Phase 0; Postgres lấy USING làm WITH CHECK, và nhiều policy PERMISSIVE thì **OR** với nhau ⇒ phép kiểm thật là `(cờ toàn cục hoặc cờ của đơn vị) OR (GUC bật)` — vế trái luôn đúng, vế phải không bao giờ được hỏi tới. Nghĩa là từ L2, tầng ứng dụng ghi được cờ tính năng mà không cần đi qua `withPlatformWrite()`. Chưa có đường khai thác thực tế (permission `flag:write` vẫn chặn ở tầng trên), nhưng lớp phòng thủ dựng ra để **sống sót một lỗi ở tầng trên** thì đã mất từ lâu mà không ai biết. Vá bằng policy **RESTRICTIVE** (được AND vào, nên đúng bất kể sau này ai thêm policy PERMISSIVE nào nữa).

### Tám vé còn lại

| Vé | Nội dung | Ghi chú |
|---|---|---|
| F193 | Đường xuất kiểu **đẩy** hỏng giữa chừng không để lại vết | Interceptor chỉ móc nhánh thành công. Nay nhánh lỗi cũng ghi `export_log`, `rule` nói rõ **không hoàn tất** và số bản ghi đã rời hệ **không xác định** — không bịa số 0. Lỗi gốc luôn được ném lại. |
| F194 | Duyệt không nêu giờ = cấp trần 72h | Thao tác nhanh nhất đang là thao tác nới rộng nhất. Nay lấy đúng số giờ **người xin đề nghị** (đã lưu vào bảng + hiện trên hàng chờ); đơn cũ không có số thì đòi nhập tường minh. |
| F196 | Mỗi lượt dùng ngoại lệ sinh một cờ rủi ro | 300 lượt xem/ngày = 300 cờ. Nay gom theo **đơn ngoại lệ**; số lần dùng đọc từ `used_count` nên luôn là con số hiện tại. |
| F197 | `total` bị trần trang cắt ở **bốn** chỗ nữa | Lần thứ tư trong dự án. Nay có `common/list-page.ts`: helper **đòi** một tham số `total` riêng và tự suy `returned`/`capped` — viết sai phải cố tình. |
| F198 | jobId outbox cố định `t-<tenant>` | Hai người nạp dữ liệu cách nhau <2s ⇒ lô sau ghi vào sổ xuất dưới tên người trước. Nay khoá gồm actor; job cũ thiếu actor bị bỏ qua có tiếng thay vì ném (trước đây làm outbox kẹt `pending` vĩnh viễn). |
| F199 | `setMonth` tràn ngày cuối tháng | 31/03 lùi 1 tháng ra 03/03 ⇒ mốc cắt chạy về **tương lai**, quét xoá thừa 1–3 ngày. `planHash` không bắt được vì băm số tháng. Nay kẹp về ngày cuối cùng có thật. |
| F200 | Ô thống kê màn rủi ro tính từ danh sách đã lọc | Lọc "Trung bình" thì ô "Mức cao" hiện 0. Nay lấy từ `/risk/summary`. |
| — | Ghi chú NULL ở `economics.service.ts` | Đính chính cùng F191, xem trên. |

### Verify

| Phép kiểm | Kết quả |
|---|---|
| Bộ test đầy đủ, `runInBand` | **896/896 · 65 suite** (trước khi vá: 869/63 — thêm 27 ca, 2 suite) |
| Typecheck `shared`+`db`+`api`+`web` | sạch |
| `next build` | PASS |
| Driver `verify-governance.mjs` | **55/55** |
| Đội đỏ `verify-redteam-truc-c.mjs` | **16/16 đòn bị chặn**, 0 lỗ |
| Render màn đã sửa + bốn màn đối chứng | 200 |

Hai migration mới: `20260805100000_exception_requested_hours` (thêm cột + đóng băng nó trong trigger bất biến) và `20260805110000_feature_flag_write_gate`.

### Ba quyết định chính sách — chủ dự án đã chốt 05/08

① **K9 tự khoá:** giữ cơ chế, làm cho nó nói rõ — đã thực thi ở F192. ② **Trần TỔNG thời gian ngoại lệ:** giữ nguyên, ghi vào sổ nợ; trần 72h là **theo từng đơn**, xin đơn nối nhau thì một quyền có thể duy trì lâu dài, mỗi lần vẫn có người duyệt và vết đầy đủ. Đội đỏ vẫn báo ghi nhận này ở mỗi lượt chạy — đúng như thiết kế. ③ **`cold_archive`:** quyết phân loại sổ kiểm toán trước rồi mới build. Dữ kiện đã tra: `audit.log` hiện là `confidential` (không phải `restricted`), nên kho lạnh **trong hạ tầng NHG** là làm được, **thuê ngoài** thì §9.3 chặn; nếu chuyển kho có xoá bản gốc thì đụng K6 và phải dùng lại khuôn GUC `app.retention_run` của L5. Phương án không phải nới bất biến nào: giữ `confidential` + kho lạnh nội bộ + **không xoá bảng nóng** (partition lạnh + đánh dấu).
