/** @ipms/shared — types + hằng số dùng chung FE/BE/AI gateway. */

/** Permission catalog Phase 0 (đồng bộ với packages/db seed). */
export const PERMISSIONS = [
  'tenant:read',
  'org:read', 'org:write',
  'person:read', 'person:write',
  'user:read', 'user:write', 'role:assign',
  'audit:read',
  'flag:read', 'flag:write',
  // Phase 1 — KPI & Scorecard
  'kpi:read', 'kpi:write', 'kpi:approve',
  'scorecard:read', 'scorecard:write',
  // Phase 1 — Strategy & Goal
  'strategy:read', 'strategy:write',
  'goal:read', 'goal:write',
  // Phase 1 — Evidence & Integration
  'evidence:read', 'evidence:write', 'evidence:verify',
  'integration:run',
  // Phase 2 — Check-in, Review, Calibration, Payroll
  'checkin:read', 'checkin:write', 'checkin:review',
  'review:read', 'review:write', 'review:manage', 'rating:approve',
  'calibration:run',
  'payroll:export',
  // Phase 3 — Configuration Studio
  'config:read', 'config:write', 'config:publish',
  'brand:write',
  'org:design',
  'derivation:run',
  'taskcell:read', 'taskcell:write',
  'process:design',
  'integration:connect', 'integration:bind',
  // Phase 3 lát 4a — ai-gateway + MCP + eval harness
  'ai:invoke', 'ai:eval',
  // Phase 3 lát 4f — BU Authoring Gate
  'taskcell:author', 'kpi:propose',
  'library:submit', 'library:curate', 'library:publish', 'library:deprecate',
  'library:import', 'library:import:canonical',
  // Phase 3 lát 4j–4k — Từ điển Tác vụ hoàn thiện (ủy quyền + vòng lặp tối ưu)
  'taskcell:delegate', 'taskcell:approve', 'task:reopen', 'task:feedback',
  // Go-live Từ điển Tác vụ — tra cứu canonical toàn hàng (read-only, mọi persona)
  'taskdict:read',
  // Phase 3 lát AI inline — gợi ý inline (chỉ đọc + đẻ ai_suggestion PENDING).
  // TÁCH khỏi ai:invoke (chat/MCP propose): inline nằm đúng chỗ author/curator/dept_head.
  'ai:assist',
  // [Learning Loop L1] Duyệt golden case từ tín hiệu học — TÁCH khỏi ai:eval (chạy eval)
  // và ai:assist (tạo tín hiệu): SoD trên THƯỚC ĐO — người chấp nhận gợi ý không tự
  // nạp case của mình vào golden set (bài học E2 red-team KPI Designer).
  'ai:eval:curate',
  // [Trục B L0] Quản trị tenant (tầng ②) — tách hành động PHÁ HUỶ khỏi quyền ghi thường:
  // mời/khoá người dùng và thu hồi vai là ba việc không nên đi kèm 'user:write'.
  'user:invite', 'user:deactivate',
  'role:read', 'role:revoke',
  'orgunit:update', 'orgunit:archive',
  'tenant.config:read', 'tenant.config:update',
  // [Trục B L0] Tuỳ chọn cá nhân (tầng ③) — cấp cho MỌI role. 'access.self:read'
  // ("Quyền của tôi") là cam kết trust-by-design: ai cũng xem được quyền của chính mình.
  'settings.self:read', 'settings.self:update',
  'access.self:read',
  'notify.self:read', 'notify.self:update',
  // [Trục B L4] Impersonation chỉ-đọc có kiểm soát — cấp cho tenant_admin, KHÔNG org_admin.
  'user:impersonate',
  // [Trục C L0] Sổ đăng ký dữ liệu. ':read' cấp rộng (mọi vai quản trị cần tra mức phân
  // loại trước khi xuất dữ liệu); ':write' CHỈ data_steward (B3 + B5).
  'datacatalog:read', 'datacatalog:write',
  // [Trục C L1] Kiểm soát xuất dữ liệu.
  //  · 'export:confidential' — trần theo mức phân loại: xuất dữ liệu `confidential` đòi
  //    quyền RIÊNG này, và nó KHÔNG nằm trong bộ mặc định của BẤT KỲ vai nào (kể cả hrbp
  //    đang giữ `payroll:export`). Ai được xuất dữ liệu cá nhân là quyết định TƯỜNG MINH
  //    của B1 trên từng người, không phải hệ quả phụ của việc được gán một vai nghiệp vụ.
  //  · 'exportlog:read' — đọc sổ nhật ký xuất. Cấp cho `auditor` (B0) ở L1; `platform_admin`
  //    nhận ở L2. KHÔNG cấp cho vai vận hành: người xuất không tự soát vết xuất của mình.
  'export:confidential', 'exportlog:read',
  // [Trục C L3] Ngoại lệ chính sách có thời hạn. Ba quyền TÁCH nhau vì K5 (người xin ≠
  // người duyệt) chỉ có nghĩa khi hai việc đó là hai quyền khác nhau — gộp lại thì bất biến
  // biến thành lời khuyên. `exception:read` tách tiếp: B0 phải rà được đơn mình không xin,
  // không duyệt.
  'exception:request', 'exception:approve', 'exception:read',
  // [Trục C L2] Quản trị NỀN TẢNG (tầng ①) — vận hành toàn hệ, KHÔNG đọc nội dung nghiệp vụ.
  // Không quyền nào ở đây chạm được một dòng `review`/`scorecard_item`/`evidence`/`person`:
  // chúng chỉ mở read model metadata (`platform_snapshot`) + hai hành động vận hành
  // (tạo đơn vị, bật/tắt cờ tính năng). Bất biến K9 + ca đối chứng ở `platform-admin.spec`.
  'tenant:list', 'tenant:create',
  'system:health', 'integration:status', 'ai:usage_read', 'audit:read_metadata',
  // [Trục C L2 — tự bắt bằng ca đối chứng] `exportlog:read_metadata` TÁCH khỏi
  // `exportlog:read`. Bản đầu cấp `exportlog:read` cho platform_admin, và ca quét K9 phát
  // hiện ngay: route `GET /export-log` (sổ vết CHI TIẾT trong phạm vi đơn vị, gác đúng quyền
  // đó) trả về 200 cho `platform@` — tức B3 đọc được ai xuất dữ liệu gì đi đâu của H.01, phá
  // thẳng K1. Trùng tên quyền giữa hai tầng là một đường rò không ai nhìn thấy khi đọc mã.
  'exportlog:read_metadata',
] as const;
export type PermissionCode = (typeof PERMISSIONS)[number];

export type ScopeType = 'tenant' | 'org_unit' | 'self';

/**
 * [Trục C L0] Bốn mức phân loại dữ liệu theo NHG Strategic Context §7.
 *
 * ⚠️ LỆCH VỰNG ĐÃ HOÀ GIẢI Ở ĐÂY: lớp AI (`modules/ai/egress/*`) trước đó dùng `pii` làm
 * mức thứ tư. Strategic Context — văn bản gốc mà cả tập đoàn tuân theo — dùng `restricted`.
 * Hai vựng song song là mầm drift: một chỗ siết `pii`, chỗ kia siết `restricted`, và dữ
 * liệu lọt qua khe giữa hai cách gọi. Chuẩn hoá về `restricted`; `pii` giữ làm bí danh
 * TƯƠNG THÍCH NGƯỢC cho các bản ghi `ai_egress_policy` đã tồn tại, chuẩn hoá tại cửa.
 */
export const DATA_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

/** Thứ tự nghiêm ngặt — PHẢI khớp `data_class_rank()` trong migration 20260729100000. */
const CLASS_RANK: Record<DataClassification, number> = {
  public: 0, internal: 1, confidential: 2, restricted: 3,
};

export function dataClassRank(c: DataClassification): number {
  return CLASS_RANK[c];
}

/** `pii` (vựng cũ của lớp AI) ⇒ `restricted`. Giá trị lạ trả về null — fail-closed ở nơi gọi. */
export function normalizeDataClass(raw: string): DataClassification | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'pii') return 'restricted';
  return (DATA_CLASSIFICATIONS as readonly string[]).includes(v) ? (v as DataClassification) : null;
}

/** Mức nhạy cảm — không rời hạ tầng do NHG kiểm soát (Strategic Context §9.3). */
export function isSensitiveClass(c: DataClassification): boolean {
  return dataClassRank(c) >= CLASS_RANK.confidential;
}

/**
 * [Trục C L1] LOẠI ĐÍCH ĐẾN của một đường xuất dữ liệu. Trần xuất KHÔNG thể quyết chỉ bằng
 * mức phân loại: "gửi kết quả đánh giá sang hệ lương nội bộ NHG" và "tải bảng điểm về máy
 * cá nhân" là hai rủi ro khác hẳn nhau dù cùng một mức `confidential`.
 *
 *  · internal_system  — hệ khác BÊN TRONG hạ tầng NHG (OneOffice, hệ nhân sự…)
 *  · file_download    — tệp về máy người dùng: rời vùng kiểm soát, không thu hồi được
 *  · external_service — dịch vụ NGOÀI hạ tầng NHG (SaaS, connector bên thứ ba)
 */
export const EXPORT_DEST_KINDS = ['internal_system', 'file_download', 'external_service'] as const;
export type ExportDestKind = (typeof EXPORT_DEST_KINDS)[number];

export interface ExportVerdict {
  allowed: boolean;
  /** Quyền BỔ SUNG mà người xuất phải có (ngoài permission nghiệp vụ của route). */
  requires: PermissionCode | null;
  /** Mã bất biến/lý do — vào thẳng thông báo lỗi và `export_log`, để tra được "vì sao chặn". */
  rule: string;
}

/**
 * [Trục C L1] TRẦN XUẤT DỮ LIỆU — bảng quyết định DUY NHẤT (mức phân loại × loại đích).
 *
 * Đặt ở @ipms/shared chứ không trong guard: FE cần biết trước để KHÔNG vẽ nút xuất mà bấm
 * vào ăn 403, và cùng một bảng phải dùng lại được ở L3 (ngoại lệ có hạn) và L5 (lưu trữ).
 *
 * Bất biến K3 nằm ở hàng `restricted`: KHÔNG có ô nào allowed — kể cả `internal_system`, kể
 * cả khi có ngoại lệ ở L3 (ngoại lệ mở được quyền ĐỌC, không mở được đường XUẤT). Hôm nay
 * không đường xuất nào trong sản phẩm mang dữ liệu `restricted` (xuất lương mang
 * `review.result` = confidential; dữ liệu lương thật nằm ở hệ nhân sự, iPMS không giữ). Khi
 * nào thực sự cần một đường như vậy thì đó là QUYẾT ĐỊNH của B1 kèm mức phân loại mới, chứ
 * không phải mặc định lọt sẵn ở đây.
 */
export function exportDecision(cls: DataClassification, dest: ExportDestKind): ExportVerdict {
  if (cls === 'restricted') {
    return {
      allowed: false, requires: null,
      rule: 'K3: dữ liệu `restricted` không rời hệ thống dưới bất kỳ hình thức nào',
    };
  }
  if (isSensitiveClass(cls)) {          // confidential
    if (dest === 'external_service') {
      return {
        allowed: false, requires: null,
        rule: 'Strategic Context §9.3: dữ liệu nhạy cảm không rời hạ tầng do NHG kiểm soát',
      };
    }
    return {
      allowed: true, requires: 'export:confidential',
      rule: 'confidential: cần quyền riêng `export:confidential` (không nằm trong vai nào)',
    };
  }
  return { allowed: true, requires: null, rule: `${cls}: trong trần cho phép` };
}

/**
 * [Trục C L2 — K9] ALLOWLIST QUYỀN CỦA `platform_admin` — KHAI TRONG MÃ, không trong seed.
 *
 * Vì sao ở đây chứ không chỉ ở `seed.ts`: cạm bẫy lớn nhất của lát này là `platform_admin`
 * lặng lẽ trở thành god-account MỚI — đúng thứ trục B vừa đập bỏ. Một danh sách nằm trong
 * seed thì lớn dần theo từng lần "thêm cho tiện"; một danh sách nằm ở đây, được test đóng
 * đinh và được service tự kiểm lúc chạy, thì mỗi lần mở rộng là một sửa đổi tường minh có
 * người rà.
 *
 * Ba nhóm, và KHÔNG có nhóm thứ tư:
 *   ① metadata xuyên đơn vị — đọc `platform_snapshot` (chỉ số đếm + trạng thái)
 *   ② hai hành động vận hành — tạo đơn vị mới, bật/tắt cờ tính năng
 *   ③ vết giám sát ở mức đếm — `exportlog:read` (số lần xuất/đơn vị), `audit:read_metadata`
 *
 * KHÔNG có `audit:read` (đó là của `auditor`, giữ J3 — đọc VẾT ĐẦY ĐỦ là việc của B0, không
 * phải của người vận hành hạ tầng), không một quyền `*:write` nghiệp vụ nào, và không
 * `datacatalog:write` (sổ phân loại là của `data_steward`).
 */
export const PLATFORM_ADMIN_PERMISSIONS: readonly PermissionCode[] = [
  'tenant:list', 'tenant:create',
  'system:health', 'integration:status', 'ai:usage_read',
  'flag:read', 'flag:write',
  // KHÔNG phải `exportlog:read` — đó là quyền đọc sổ vết CHI TIẾT trong phạm vi đơn vị
  // (`auditor`/B0). Tầng nền tảng chỉ được số đếm (K1). Xem ghi chú ở catalog phía trên.
  'exportlog:read_metadata', 'audit:read_metadata',
  // [Trục C L3] XIN được ngoại lệ, KHÔNG duyệt được (K5). Đây là lối ra cho đúng giới hạn mà
  // L2 cố ý đặt: B3 thấy SỐ LẦN xuất dữ liệu, muốn xem chi tiết một sự cố thì đi xin quyền
  // đọc có thời hạn và có người duyệt — không phải được cấp sẵn vĩnh viễn.
  'exception:request',
];

/**
 * [Trục C L2 — K9] Hậu tố/mã của quyền NGHIỆP VỤ. Dùng cho ca đối chứng: không một quyền nào
 * của `platform_admin` được khớp danh sách này. Viết dưới dạng suy diễn thay vì liệt kê tay
 * để permission nghiệp vụ THÊM SAU NÀY tự động nằm trong phạm vi kiểm.
 */
export function isBusinessPermission(p: string): boolean {
  if ((PLATFORM_ADMIN_PERMISSIONS as readonly string[]).includes(p)) return false;
  if (p.includes('.self:')) return false;          // quyền cá nhân, mọi vai đều có
  if (p === 'taskdict:read') return false;         // tài nguyên tham chiếu toàn hàng
  return /^(kpi|scorecard|strategy|goal|evidence|checkin|review|rating|calibration|payroll|config|brand|org|person|user|role|taskcell|task|library|process|derivation|ai|integration|datacatalog|audit|tenant\.config|orgunit|export)[:.]/.test(p);
}

/**
 * [Trục B L4 — J11] Danh sách TƯỜNG MINH quyền được giữ khi đang đóng vai (chỉ đọc
 * tuyệt đối). ĐÂY LÀ WHITELIST, KHÔNG PHẢI BLACKLIST theo suy diễn hậu tố (":write",
 * ":approve"…): một số quyền GHI không theo quy ước hậu tố đó (`task:feedback` là nộp góp
 * ý — mutation; `ai:invoke`/`ai:assist`/`ai:eval` gọi LLM thật — có phí + tác dụng phụ dù
 * tên không có hậu tố ghi). Danh sách này PHẢI khai TƯỜNG MINH từng permission — permission
 * MỚI thêm vào catalog ở trên mặc định KHÔNG có ở đây cho tới khi ai đó chủ động thêm vào
 * (đối lập blacklist theo pattern: blacklist hở ngay lần thêm permission tiếp theo không
 * khớp pattern cũ — đã là bài học từ chính rbac-matrix.spec.ts của trục này).
 * Test đóng đinh: `impersonation-whitelist.spec.ts`.
 */
// [F187 — Reviewer đối kháng, MAJOR] KHÔNG có 'audit:read' ở đây dù nó kết thúc bằng ':read'.
// J3 cấm tenant_admin đọc vết kiểm toán CỦA CHÍNH MÌNH — nếu whitelist này giữ audit:read,
// tenant_admin đóng vai auditor@ (người CÓ audit:read) sẽ lách được đúng cái cấm đó qua
// impersonation, biến J11 (đọc-thôi khi đóng vai) thành đường vòng phá J3. Whitelist đọc-thôi
// không có nghĩa "mọi quyền :read" — vẫn phải xét TỪNG quyền có nên lộ qua kênh này không.
export const IMPERSONATION_READ_WHITELIST: readonly PermissionCode[] = [
  'tenant:read', 'org:read', 'person:read', 'user:read', 'role:read',
  'flag:read', 'kpi:read', 'scorecard:read', 'strategy:read', 'goal:read', 'evidence:read',
  'checkin:read', 'review:read', 'config:read', 'taskcell:read', 'taskdict:read',
  'tenant.config:read', 'settings.self:read', 'access.self:read', 'notify.self:read',
  // [Trục C L0] tra sổ đăng ký dữ liệu — chỉ đọc, an toàn trong phiên đóng vai
  'datacatalog:read',
];

/**
 * [Trục C L2b] QUYỀN HỮU HIỆU của một phiên đóng vai = quyền target thật sự giữ ∩ whitelist
 * chỉ-đọc. Đây là thứ `PermissionGuard` giao cho request (J11) — nghĩa là con số DUY NHẤT
 * mô tả "actor nhận được gì khi mở phiên này".
 *
 * Tách thành hàm ở @ipms/shared vì nó có HAI chỗ dùng phải luôn khớp nhau: guard (lúc thực
 * thi) và `ImpersonationService` (lúc quyết cho mở phiên hay không). Hai chỗ tính khác nhau
 * là kiểu lệch không test nào bắt trực tiếp — nó chỉ hiện ra dưới dạng "chặn oan" hoặc
 * "cho qua rộng hơn dự tính".
 */
export function effectiveImpersonationPermissions(target: Iterable<string>): Set<string> {
  const wl = new Set<string>(IMPERSONATION_READ_WHITELIST as readonly string[]);
  return new Set([...target].filter((p) => wl.has(p)));
}

/**
 * [Trục C L2b — J12① siết lại theo QUYỀN HỮU HIỆU] Những quyền mà actor sẽ NHẬN ĐƯỢC qua
 * phiên đóng vai nhưng CHÍNH ACTOR không có. Rỗng ⇒ không leo thang ⇒ được mở phiên.
 *
 * Vì sao đổi khỏi bản đầu (so với TOÀN BỘ quyền của target):
 *
 * Bản đầu đòi actor ⊇ mọi quyền target giữ, kể cả quyền GHI. Nhưng quyền ghi của target đã
 * bị guard cắt sạch khỏi phiên (J11) — actor không bao giờ dùng được chúng. Đòi actor phải
 * giữ sẵn thứ nó không nhận được không mua thêm an toàn nào; cái nó mua là một tính năng
 * chết: sau khi trục B L0 tước sạch quyền ghi nghiệp vụ khỏi `tenant_admin` (J2), mọi
 * persona nghiệp vụ đều giữ ít nhất một quyền ghi (`employee` có `goal:write`), nên `admin@`
 * chỉ còn đóng vai được người KHÔNG có quyền nào — người mà đọc gì cũng 403. Driver sống
 * trục B đo được đúng hệ quả đó.
 *
 * Bản này giữ NGUYÊN bất biến "không leo thang", chỉ phát biểu đúng đối tượng: actor phải
 * giữ đúng phần nó THỰC SỰ nhận. Chặt ở chỗ nào cần chặt — nếu target đọc được một thứ
 * whitelisted mà actor không có quyền đọc (vd `datacatalog:read`, `config:read`), phiên vẫn
 * bị chặn, vì đó mới đúng là mượn tầm nhìn của người khác.
 *
 * KHÔNG thay thế J12② (`audit:read`): quyền đó không nằm trong whitelist nên sẽ luôn bị hàm
 * này cho là "không nhận được" ⇒ vô hình với phép kiểm này. Cấm đóng vai auditor là một luật
 * RIÊNG, kiểm riêng, trong service — xem `impersonation.service.ts`.
 */
export function impersonationEscalation(
  actor: Iterable<string>, target: Iterable<string>,
): string[] {
  const actorSet = new Set<string>(actor);
  return [...effectiveImpersonationPermissions(target)].filter((p) => !actorSet.has(p)).sort();
}

/**
 * [Trục C L2b — K11] Vai `support` — hỗ trợ kỹ thuật: NHÌN THẤY cái người dùng thấy, không
 * làm được gì. Khai ở đây (không chỉ trong seed) đúng khuôn `PLATFORM_ADMIN_PERMISSIONS`.
 *
 * Danh sách SUY RA, không liệt kê tay: `support` = đúng whitelist chỉ-đọc + `user:impersonate`.
 * Đó không phải mẹo cho gọn, nó là chỗ dựa của cả lát: vì tập quyền của `support` BẰNG
 * whitelist, `impersonationEscalation(support, bất kỳ ai)` luôn rỗng ⇒ hỗ trợ kỹ thuật đóng
 * vai được MỌI persona nghiệp vụ mà không cần một ngoại lệ nào trong J12. Liệt kê tay thì
 * mỗi permission đọc thêm vào whitelist sau này lại lặng lẽ tạo ra một persona `support`
 * không đóng vai được, và không ai biết cho tới khi có người báo lỗi.
 *
 * `user:impersonate` là quyền GHI duy nhất — chính là năng lực định nghĩa vai này. Nó KHÔNG
 * nằm trong whitelist, nên trong một phiên đang đóng vai nó bị cắt ⇒ không có đóng vai lồng
 * nhau (J12④ có thêm một phòng tuyến nữa ở service).
 */
export const SUPPORT_ROLE_PERMISSIONS: readonly PermissionCode[] = [
  ...IMPERSONATION_READ_WHITELIST,
  'user:impersonate',
];

/**
 * [Trục C L2b] SoD CẤP VAI — các cặp vai không ai được giữ đồng thời.
 *
 * Vì sao không dùng `sod_rule` (bảng, theo cặp QUYỀN) như mọi SoD khác: `support` là tập con
 * quyền của `tenant_admin` — nó không mang một quyền nào mà `tenant_admin` không có, nên
 * KHÔNG tồn tại cặp quyền nào phát biểu được "support ⟂ tenant_admin". Ràng buộc ở đây là
 * ràng buộc VỀ VAI (ai làm hỗ trợ kỹ thuật thì không đồng thời là người quản trị đơn vị —
 * người mở phiên đóng vai không nên là người tự cấp cho mình quyền mở phiên), nên phải phát
 * biểu ở cấp vai. Thực thi trong `admin-roles.service.ts` (J1⑤), kiểm cả hai chiều.
 */
export const MUTUALLY_EXCLUSIVE_ROLES: ReadonlyArray<readonly [string, string]> = [
  ['support', 'tenant_admin'],
  ['support', 'org_admin'],
];

/**
 * [Trục C L3 — K4] TRẦN CỨNG thời hạn ngoại lệ: 72 giờ (§6 giả định 1 — đủ cho một ca xử lý
 * sự cố cuối tuần, ngắn hơn một chu kỳ báo cáo).
 *
 * "Cấu hình được XUỐNG thấp hơn, KHÔNG lên cao hơn" (§4 L3). Hằng số này là trần trên của
 * mọi cấu hình đơn vị — đặt trong MÃ chứ không trong `tenant.settings` để một đơn vị không
 * tự nới trần của chính mình; xem `resolveExceptionTtlCap()`.
 */
export const EXCEPTION_MAX_TTL_HOURS = 72;

/**
 * Trần hiệu lực cho một đơn vị = min(trần cứng, cấu hình đơn vị nếu có). Viết bằng `min` chứ
 * không bằng "nếu có cấu hình thì dùng cấu hình": khác biệt lộ ra đúng lúc ai đó đặt
 * `exceptionMaxTtlHours: 720` — bản `min` bỏ qua, bản kia mở toang trần cứng. Validator ở
 * `tenant-config.service` cũng chặn giá trị >72, nhưng một giá trị cũ nằm sẵn trong
 * `tenant.settings` từ trước khi có validator vẫn đọc được — nên chặn ở CẢ HAI đầu.
 */
export function resolveExceptionTtlCap(configuredHours?: unknown): number {
  const n = typeof configuredHours === 'number' && Number.isFinite(configuredHours)
    ? configuredHours : EXCEPTION_MAX_TTL_HOURS;
  return Math.max(1, Math.min(EXCEPTION_MAX_TTL_HOURS, Math.floor(n)));
}

/**
 * [Trục C L3 — K4] Quyền được phép nới bằng ngoại lệ — ALLOWLIST TƯỜNG MINH, không suy diễn.
 *
 * Nguyên tắc đứng sau danh sách: **ngoại lệ mở được quyền ĐỌC, không mở được đường XUẤT và
 * không mở được quyền GHI.** Lý do không phải "cho chắc" mà là bất đối xứng về khả năng hoàn
 * tác: một lần đọc sai thẩm quyền là một sự cố có thể điều tra và đóng lại; một lần GHI hoặc
 * XUẤT sai thẩm quyền để lại dữ liệu hỏng hoặc một tệp đã rời hệ, mà hết hạn ngoại lệ không
 * thu hồi được. Vì vậy `export:confidential` KHÔNG có ở đây — K3 và bảng trần xuất
 * (`exportDecision`) không có đường vòng, kể cả có ngoại lệ.
 *
 * `audit:read` cũng KHÔNG có: J3 nói người quản trị không đọc vết của chính mình, và một
 * ngoại lệ 72 giờ do chính tầng quản trị xin là đúng cách lách nó. Vết kiểm toán muốn mở cho
 * ai thì đó là quyết định của B0 qua vai `auditor`, không qua đơn xin.
 *
 * Ca dùng thật đã biết, để danh sách này không phải phỏng đoán:
 *   · `exportlog:read` — B3 điều tra một sự cố xuất dữ liệu ở một đơn vị (L2 cố ý chỉ cho
 *     tầng nền tảng SỐ ĐẾM; chi tiết đi qua đây, đúng như ghi chú ở L2)
 *   · `person:read` / `review:read` / `evidence:read` / `checkin:read` — hỗ trợ hoặc tuân
 *     thủ cần nhìn một hồ sơ cụ thể ngoài phạm vi thường ngày
 *   · `datacatalog:read`, `config:read`, `taskcell:read` — tra cứu cấu hình khi xử lý sự cố
 */
export const EXCEPTION_GRANTABLE_PERMISSIONS: readonly PermissionCode[] = [
  'exportlog:read',
  'person:read', 'review:read', 'evidence:read', 'checkin:read', 'goal:read',
  'scorecard:read', 'kpi:read', 'strategy:read',
  'datacatalog:read', 'config:read', 'taskcell:read',
  'org:read', 'user:read', 'role:read', 'tenant.config:read',
];

/** Trạng thái một đơn ngoại lệ. `expired` do đường đọc/job suy ra, không ai bấm. */
export const EXCEPTION_STATUSES = ['pending', 'approved', 'rejected', 'revoked', 'expired'] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

/** JWT claims chuẩn nội bộ — map sẵn theo Entra ID để cắm SSO sau. */
export interface IpmsJwtClaims {
  sub: string;          // app_user.id — TRONG phiên đóng vai: là TARGET (quyền tính theo người này)
  tid: string;          // tenant.id (Entra: tenant id — ở đây là iPMS tenant)
  oid?: string;         // Entra object id (khi có SSO)
  email: string;
  person_id?: string;
  // [Trục B L4 — J13] Danh tính kép khi đang đóng vai: `act` = actor THẬT (app_user.id),
  // tách khỏi `sub` = người đang bị đóng vai. `imp_sid` = impersonation_session.id — khoá
  // để endpoint thoát phiên định danh ĐÚNG phiên cần kết thúc mà không cần targetUserId.
  act?: string;
  imp_sid?: string;
  iat?: number;
  exp?: number;
}

/** Error model chuẩn TDD §8.2 */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; issue: string }>;
    trace_id?: string;
  };
}

export const ORG_LEVELS = ['group', 'bu', 'department', 'team'] as const;
export type OrgLevel = (typeof ORG_LEVELS)[number];

export const PERSON_STATUSES = ['active', 'leave', 'terminated'] as const;
