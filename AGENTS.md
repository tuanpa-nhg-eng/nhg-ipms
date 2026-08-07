<!-- bmad:context -->
# Kernel — NHG iPMS

## Đọc trước khi làm bất cứ việc gì
- Tiến độ thật: `OWNER_DIGEST.md` (gốc repo) — kênh async duy nhất với chủ dự án. `STATUS.md` đã bỏ, không dùng để quyết định.
- Kế hoạch trục đang chạy: `02-dac-ta/NHG_iPMS_Ke_Hoach_Truc_D_Lop_AI_Co_Danh_Tinh.md`.
- Bất biến J/K/N: [bat-bien-quan-tri.md](docs/bat-bien-quan-tri.md). Lát nào phá là lát đó sai.

## Nhịp làm việc — bắt buộc
- Lập kế hoạch → chủ dự án duyệt → mới build. Chưa duyệt thì không viết dòng nào.
- Build tuần tự L0→L7; hết mỗi lát thì DỪNG, ghi OWNER_DIGEST, chờ phản hồi. Chi tiết: [nhip-lam-viec.md](docs/nhip-lam-viec.md).
- Kết trục = Reviewer đối kháng độc lập. Vé F đánh số liên tục toàn dự án (mới nhất F200), không reset.
- RED-LINE: cờ `ai_gateway_live` giữ TẮT, tổng chi phí AI = 0, tới khi chủ dự án cấp API key + trần budget.
- Mọi tài liệu và giao tiếp bằng tiếng Việt.

## Lệnh — chạy trong `05-build/`
- DB: `pnpm db:up` (docker PG16+Redis) · `pnpm db:migrate` · `pnpm db:seed`
- API dev: `pnpm --filter @ipms/api start:dev` (:4000) — **KHÔNG watch**; sửa mã phải kill PID :4000 rồi chạy lại.
- Web dev: `cd web && npx next dev -p 3001` — `web/` **không** thuộc pnpm workspace (`05-build/pnpm-workspace.yaml` chỉ có `apps/*`, `packages/*`).
- Test: `pnpm --filter @ipms/api test` (unit) · `test:integration` (`jest --runInBand`, cần Postgres đang chạy).
- Typecheck: `pnpm -r typecheck` (shared + db + api; web riêng qua `next build`).
- Driver sống: `node scripts/verify/verify-*.mjs` — đánh vào API :4000 thật đã restart.
- Seed phụ: `seed:perfdemo` (phòng sống) · `seed:taskcatalog` (815 tác vụ) · `seed:golden`.
- Health đúng: `GET /api/v1/auth/health`. `dev-token` trả `access_token` + `tenant_id`.
- Tài khoản demo (`@h01.nhg.local`): `demo1@`…`demo6@`, `mgr@`, `hr@`, `exec@`, `auditor@`, `admin@`, `dept@`, `curator@`, `platform@`, `support@`.

## Quy ước khác mặc định
- Mọi truy vấn nghiệp vụ qua `withTenant()` (`05-build/packages/db/src/index.ts`). Không cấp `BYPASSRLS` cho vai người thật. Chi tiết: [rls-multi-tenant.md](docs/rls-multi-tenant.md).
- `prisma.create()` luôn sinh `RETURNING` ⇒ dính policy **SELECT** của RLS. Đường ghi không có quyền đọc phải tránh RETURNING, không nới policy.
- `audit_log`, `export_log`, `task_revision`, `ai_interaction` append-only: trigger chặn UPDATE/DELETE kể cả owner, và `ipms_app` không được GRANT UPDATE/DELETE.
- Route trả dữ liệu ra ngoài phải khai `@Exported` (`05-build/apps/api/src/common/export/`) — không khai = 403, và snapshot bề mặt xuất sẽ đỏ. Xem [cong-xuat-du-lieu.md](docs/cong-xuat-du-lieu.md).
- Mức nhạy cảm dữ liệu **suy từ sổ `data_asset`**, không ai tự khai; không suy được = chặn. Xem [so-dang-ky-du-lieu.md](docs/so-dang-ky-du-lieu.md).
- Mã `agent` phải có trong danh bạ `ai_agent`; agent lạ = 422. Trần phân loại thuộc về agent, không thuộc phiên.
- Permission catalog + các allowlist là **mã**, không phải cấu hình: `05-build/packages/shared/src/index.ts`.
- Mọi cửa vào trạng thái `active` của task cell đi qua một helper duy nhất: `05-build/apps/api/src/modules/library/kpi-guard.ts`.
- Read-model whitelist từng trường; không trả nguyên row (F122, F183).
- Mutation admin: optimistic lock `version`; thao tác **bị từ chối** vẫn ghi `audit_log`, ghi NGOÀI transaction để không rollback theo.
- Trang persona fetch phía **client**; không server-fetch dữ liệu thật (rò qua RSC payload).
- Không render nav/nút mà API sẽ từ chối; cũng không ẩn ở FE rồi để API mở.
- Không nới quyền để UI chạy. Màn 403 thì sửa màn hoặc báo cáo.

## Bẫy
- **Kiểm chứng sai đối tượng = kết quả xanh vô nghĩa.** `ipms_owner` bỏ qua RLS; API dev không watch. Đo bằng `ipms_app` và server đã restart. Xem [kiem-chung-song.md](docs/kiem-chung-song.md).
- Test xanh trong khi assert chạy **0 lần** — `expect(length).toBeGreaterThan(0)` trước mọi vòng lặp assert bảo mật.
- Driver phải quét **đủ mọi vai** được phép mở màn đó, không chỉ vai thuận tay (F176, F177).
- Lọc một nguồn trong khi kết quả gộp từ nhiều nguồn — bug sống sót qua full suite xanh.
- Không bịa số. Thà để trống và nêu rõ thiếu gì, còn hơn số trông-như-thật. Xem [khong-bia-so.md](docs/khong-bia-so.md).
- Driver sống viết vào `05-build/scripts/verify/` và commit như mã nguồn; viết trong scratchpad là mất.
- Windows/OneDrive: lỗi `EINVAL readlink .next` → xoá `web/.next`; kill node đang giữ `query_engine-windows.dll` trước khi `prisma generate`.
- `02-dac-ta/`, `STATUS.md`, `00-boi-canh/`, `gg-io-nhg/` nằm **ngoài git** (`.gitignore`) — chỉ trên đĩa máy này. Xem [tai-lieu-ngoai-git.md](docs/tai-lieu-ngoai-git.md).
<!-- /bmad:context -->
