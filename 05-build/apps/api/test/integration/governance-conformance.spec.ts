/**
 * Integration [Trục C — L6] SOÁT TOÀN HỆ 11 MỤC GOVERNANCE (§7 NHG Strategic Context).
 *
 * Kế hoạch §4 L6 đòi "bảng đối chiếu: mục → nơi hiện thực → test chứng minh. Mục nào không
 * chỉ ra được test là mục chưa xong." Bảng đó nằm ở ĐÂY chứ không trong một tệp Markdown, vì
 * một bảng trong tài liệu chỉ đúng vào ngày người ta viết nó. Bảng này:
 *
 *   · CHẠY ĐƯỢC — mỗi mục trỏ tới tệp spec chứng minh, và test kiểm tệp đó CÓ THẬT trên đĩa.
 *     Đổi tên/xoá một spec chứng minh ⇒ đỏ, không phải "phát hiện sau sáu tháng".
 *   · ĐO ĐƯỢC Ở DB — các bất biến cứng (append-only, trigger, cột hạn) kiểm bằng truy vấn
 *     `pg_catalog`, không bằng niềm tin vào migration đã chạy.
 *   · KHÔNG CHO KHOE — mục `partial`/`gap` bắt buộc có ghi chú đủ dài mô tả CÒN THIẾU GÌ.
 *     Không có đường "đánh dấu xong cho đẹp bảng".
 *
 * Đây cũng là bản đối chiếu ngược ra tài liệu bán hàng (`so-nang-luc-ipms.md`) và BRD Nền tảng
 * — mục nào ở đây là `met` thì tài liệu mới được ghi "Đã có".
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createPrismaClient, PrismaClient } from '@ipms/db';

jest.setTimeout(120_000);

type Status = 'met' | 'partial' | 'gap';

interface GovernanceItem {
  no: number;
  /** Tên mục theo §7 Strategic Context. */
  name: string;
  /** Mã yêu cầu BRD Nền tảng tương ứng (nếu có). */
  br: string[];
  status: Status;
  /** Nơi hiện thực — đường dẫn mã/tên bảng, viết cho người rà chứ không cho máy. */
  where: string[];
  /** Spec CHỨNG MINH — đường dẫn tương đối từ `apps/api/test/`. Test dưới kiểm tệp có thật. */
  provenBy: string[];
  /** Bắt buộc với `partial`/`gap`: còn thiếu gì, vì sao chưa làm. */
  gapNote?: string;
}

const ITEMS: GovernanceItem[] = [
  {
    no: 1,
    name: 'Phân loại dữ liệu 4 mức + sổ đăng ký + chủ dữ liệu',
    br: ['BR-M11-06'],
    status: 'met',
    where: ['bảng `data_asset` (trigger `data_asset_no_loosen`)', 'modules/datacatalog', 'vai `data_steward`'],
    provenBy: ['integration/datacatalog.spec.ts', 'unit/data-classification.spec.ts'],
  },
  {
    no: 2,
    name: 'RBAC / ABAC',
    br: ['BR-M08-01', 'BR-M08-02'],
    status: 'met',
    where: ['common/auth/permission.guard.ts (RBAC + scope)', 'modules/policy (Cedar guardrail)'],
    provenBy: ['integration/rbac-matrix.spec.ts', 'integration/policy.spec.ts', 'unit/scope-util.spec.ts'],
  },
  {
    no: 3,
    name: 'Nhật ký kiểm toán bắt buộc, append-only',
    br: ['BR-M13-01'],
    status: 'met',
    where: ['bảng `audit_log` (không grant UPDATE/DELETE + trigger)', 'common/audit/audit.interceptor.ts'],
    provenBy: ['integration/admin-api.spec.ts', 'integration/tenant-isolation.spec.ts'],
  },
  {
    no: 4,
    name: 'Luồng phê duyệt dùng chung',
    br: ['BR-M13-03'],
    status: 'partial',
    where: [
      'KPI: `kpi:approve` (HITL)', 'cấu hình: config_designer ⟂ config_approver',
      'kết quả đánh giá: `rating:approve` + calibration',
      'ngoại lệ chính sách: `exception:approve` (L3)',
    ],
    provenBy: ['integration/kpi-scorecard.spec.ts', 'integration/config-studio.spec.ts', 'integration/policy-exception.spec.ts'],
    gapNote:
      'Bốn loại đối tượng ĐỀU có phê duyệt và đều cưỡng chế người-duyệt-khác-người-tạo, nhưng '
      + 'bằng BỐN cơ chế riêng (permission `*:approve`, cặp vai SoD, `sod_rule`, và bảng '
      + '`policy_exception`). Tiêu chí BR-M13-03 đòi "cùng MỘT cơ chế". Gộp lại là một lát '
      + 'refactor chạm cả bốn module đang chạy đúng — rủi ro hồi quy cao hơn lợi ích tuân thủ, '
      + 'nên tách thành việc riêng có kế hoạch, không nhét vào L6. Ghi rõ để B5 quyết ưu tiên.',
  },
  {
    no: 5,
    name: 'Kiểm soát xuất dữ liệu — một cổng duy nhất, ghi vết đủ bốn thông tin',
    br: ['BR-M13-02'],
    status: 'met',
    where: [
      'common/export/export.guard.ts + export-log.interceptor.ts',
      'bảng `export_log` (append-only, 4 cột NOT NULL)',
      '[L6] cổng của outbox dời xuống `OutboxDispatcher.dispatchTenant` — worker cũng đi qua',
    ],
    provenBy: ['integration/export-control.spec.ts', 'unit/export-ceiling.spec.ts'],
  },
  {
    no: 6,
    name: 'Nhật ký sử dụng AI, có chi phí',
    br: ['BR-M12-05'],
    status: 'met',
    where: ['bảng `ai_interaction`', 'modules/ai/economics'],
    provenBy: ['integration/ai-economics.spec.ts', 'unit/economics.spec.ts'],
  },
  {
    no: 7,
    name: 'Human-in-the-loop cưỡng chế bằng mã',
    br: ['BR-M12-02'],
    status: 'met',
    where: ['ai_suggestion trạng thái PENDING', 'modules/ai/inline + golden (SoD per-candidate)'],
    provenBy: ['integration/inline-assist.spec.ts', 'integration/ai-golden.spec.ts'],
  },
  {
    no: 8,
    name: 'Cờ rủi ro sinh tự động',
    br: ['BR-M13-04'],
    status: 'met',
    where: ['bảng `risk_flag` (unique theo nguồn + trigger bất biến)', 'modules/risk'],
    provenBy: ['integration/risk-incident.spec.ts', 'unit/risk-rules.spec.ts'],
  },
  {
    no: 9,
    name: 'Ngoại lệ chính sách có thời hạn, tự hết hiệu lực',
    br: ['BR-M13-05'],
    status: 'met',
    where: [
      'bảng `policy_exception` (trigger chặn gia hạn)',
      '`user_role.expires_at` + lọc tại cửa ở `PermissionGuard`',
    ],
    provenBy: ['integration/policy-exception.spec.ts', 'unit/policy-exception.spec.ts'],
  },
  {
    no: 10,
    name: 'Luồng xử lý sự cố',
    br: ['BR-M13-04'],
    status: 'met',
    where: ['bảng `incident` (trạng thái một chiều, đóng bắt buộc nguyên nhân gốc)', 'modules/risk'],
    provenBy: ['integration/risk-incident.spec.ts'],
  },
  {
    no: 11,
    name: 'Dashboard cho B3 · B5 · B0 · V1',
    br: ['BR-M13-04'],
    status: 'partial',
    where: [
      'B5+B0: màn `/compliance/risk` (web)',
      'V1: `GET /risk/summary` (số đếm)',
      'B3: `GET /platform/risk` (số đếm xuyên đơn vị)',
      'B0: `GET /audit-logs` + `/export-log` sẵn có',
    ],
    provenBy: ['integration/risk-incident.spec.ts', 'integration/platform-admin.spec.ts'],
    gapNote:
      'Bốn ĐƯỜNG ĐỌC đều có và đều có test chứng minh, nhưng chỉ B5/B0 có MÀN HÌNH '
      + '(`/compliance/risk`). B3 và V1 hiện chỉ có API — đúng nhịp đã chọn từ L2 (toàn bộ bề '
      + 'mặt `/platform/*` chưa có màn nào). Không tự đánh dấu `met` vì tiêu chí BR-M13-04 nói '
      + '"xuất hiện đúng trên dashboard của bốn khối", mà dashboard nghĩa là màn hình.',
  },
];

/** Thư mục gốc của test — dùng để kiểm tệp spec chứng minh có thật. */
const TEST_ROOT = join(__dirname, '..');

describe('[Trục C L6] Đối chiếu 11 mục governance §7', () => {
  let owner: PrismaClient;

  beforeAll(async () => { owner = createPrismaClient(process.env.OWNER_DATABASE_URL); });
  afterAll(async () => { await owner?.$disconnect(); });

  it('đủ 11 mục, đánh số liên tục, không trùng', () => {
    expect(ITEMS).toHaveLength(11);
    expect(ITEMS.map((i) => i.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(ITEMS.map((i) => i.name)).size).toBe(11);
  });

  /**
   * Luật của lát: **mục nào không chỉ ra được test là mục chưa xong.** Ở đây nó không phải một
   * câu khẩu hiệu — mọi mục đều phải nêu spec, và spec phải TỒN TẠI.
   */
  describe.each(ITEMS)('mục $no — $name', (item) => {
    it('có nêu nơi hiện thực và spec chứng minh', () => {
      expect(item.where.length).toBeGreaterThan(0);
      expect(item.provenBy.length).toBeGreaterThan(0);
    });

    it('mọi spec chứng minh đều TỒN TẠI trên đĩa', () => {
      const missing = item.provenBy.filter((p) => !existsSync(join(TEST_ROOT, p)));
      expect(missing).toEqual([]);
    });

    it('nếu chưa đạt thì phải mô tả CÒN THIẾU GÌ (không có đường đánh dấu xong cho đẹp)', () => {
      if (item.status === 'met') return;
      expect(item.gapNote ?? '').not.toHaveLength(0);
      // Đủ dài để buộc phải viết một câu thật, không phải "đang làm".
      expect((item.gapNote ?? '').length).toBeGreaterThan(80);
    });
  });

  it('không mục nào ở trạng thái `gap` — hết trục C phải không còn mục TRỐNG', () => {
    const gaps = ITEMS.filter((i) => i.status === 'gap').map((i) => `${i.no}. ${i.name}`);
    expect(gaps).toEqual([]);
  });

  /**
   * Chốt tiến độ so với điểm xuất phát: kế hoạch §1 soi ra "đủ 6, hở 5" (5 mục ❌ + 2 mục ⚠️).
   * Hết trục C phải còn ĐÚNG hai mục `partial`, và cả hai đều là mục đã ghi rõ lý do ở trên.
   */
  it('tiến độ: ≥9/11 mục ĐẠT, hai mục còn lại là partial có lý do', () => {
    const met = ITEMS.filter((i) => i.status === 'met');
    expect(met.length).toBeGreaterThanOrEqual(9);
    const partial = ITEMS.filter((i) => i.status === 'partial').map((i) => i.no);
    expect(partial).toEqual([4, 11]);
  });

  // ═══════════ Đo ở DB — bất biến cứng không kiểm bằng niềm tin ═══════════

  /**
   * Mọi bảng hồ sơ giám sát/kiểm soát của trục C phải TỒN TẠI THẬT. Kiểm bằng `pg_catalog`
   * chứ không bằng "migration đã chạy" — một môi trường thiếu migration sẽ đỏ ở đây thay vì
   * đỏ ở một test nghiệp vụ ngẫu nhiên với thông báo khó hiểu.
   */
  it('[nền] mọi bảng governance của trục C tồn tại trong DB', async () => {
    const want = [
      'data_asset', 'export_log', 'platform_snapshot', 'policy_exception',
      'risk_flag', 'incident', 'retention_policy', 'retention_run',
    ];
    const rows = await owner.$queryRawUnsafe<Array<{ tablename: string }>>(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1)`,
      want,
    );
    expect(rows.map((r) => r.tablename).sort()).toEqual([...want].sort());
  });

  it('[nền] mọi trigger bất biến của trục C tồn tại (không tin migration đã chạy)', async () => {
    const want = [
      'data_asset_no_loosen_check',        // L0 — không nới lỏng mức phân loại
      'policy_exception_immutable_trg',    // L3 — không gia hạn, không sửa đơn
      'user_role_no_extend_trg',           // L3 — không kéo dài hạn vai tạm
      'risk_flag_immutable_trg',           // L4 — cờ là sự kiện đã xảy ra
      'incident_forward_only_trg',         // L4 — trạng thái một chiều
      'retention_policy_no_extend_ins',    // L5 — đơn vị chỉ rút ngắn
      'retention_run_append_only_trg',     // L5 — hồ sơ lượt chạy
      'ai_interaction_delete_gate_trg',    // L5 — cổng xoá chỉ mở trong lượt lưu trữ
    ];
    const rows = await owner.$queryRawUnsafe<Array<{ tgname: string }>>(
      `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($1)`,
      want,
    );
    const missing = want.filter((w) => !rows.some((r) => r.tgname === w));
    expect(missing).toEqual([]);
  });

  /**
   * [K6] Hai sổ giám sát không được cấp quyền XOÁ/SỬA cho vai runtime. Đây là tầng THỨ NHẤT
   * của append-only (trigger là tầng thứ hai) — và là tầng dễ bị nới nhất khi ai đó chạy một
   * `GRANT ALL` cho tiện.
   */
  it('[K6] `ipms_app` KHÔNG có quyền UPDATE/DELETE trên audit_log và export_log', async () => {
    const rows = await owner.$queryRawUnsafe<Array<{ table_name: string; privilege_type: string }>>(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'ipms_app' AND table_name IN ('audit_log','export_log')
          AND privilege_type IN ('UPDATE','DELETE')`,
    );
    expect(rows).toEqual([]);
  });

  it('[L3] cột hạn của vai tạm tồn tại và có index — nền của "hết hạn là hết"', async () => {
    const cols = await owner.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name='user_role' AND column_name IN ('expires_at','policy_exception_id')`,
    );
    expect(cols.map((c) => c.column_name).sort()).toEqual(['expires_at', 'policy_exception_id']);
  });

  /**
   * [L5 — K6] Ràng buộc "không lưu được chính sách xoá cho sổ giám sát" phải tồn tại ở tầng DB.
   * Kiểm sự tồn tại của CHECK theo tên: nếu ai đó DROP nó, mọi test nghiệp vụ khác vẫn xanh.
   */
  it('[L5] CHECK constraint chặn chính sách xoá sổ giám sát còn nguyên', async () => {
    const rows = await owner.$queryRawUnsafe<Array<{ conname: string }>>(
      `SELECT conname FROM pg_constraint WHERE conname = 'retention_policy_k6_audit_untouchable'`,
    );
    expect(rows).toHaveLength(1);
  });

  /**
   * Bản chuẩn tập đoàn của sổ đăng ký dữ liệu + chính sách lưu trữ phải có mặt: hai thứ này là
   * ĐẦU VÀO của mọi quyết định xuất/xoá. Thiếu chúng thì hệ fail-closed (đúng), nhưng đó là
   * trạng thái "chưa cấu hình xong", không phải trạng thái sản phẩm.
   */
  it('[nền] sổ đăng ký dữ liệu và chính sách lưu trữ chuẩn tập đoàn đã seed', async () => {
    const assets = await owner.dataAsset.count({ where: { tenantId: null, deletedAt: null } });
    expect(assets).toBeGreaterThanOrEqual(9);
    const policies = await owner.retentionPolicy.findMany({ where: { tenantId: null, deletedAt: null } });
    expect(policies.length).toBeGreaterThanOrEqual(4);
    // Ba con số B5 đã chốt giả định (§6) — đổi số ở seed mà quên báo cáo thì đỏ ở đây.
    const byCode = Object.fromEntries(policies.map((p) => [p.assetCode, p]));
    expect(byCode['review.result'].retentionMonths).toBe(60);
    expect(byCode['system.log'].retentionMonths).toBe(24);
    expect(byCode['audit.log'].retentionMonths).toBe(120);
    expect(['cold_archive', 'keep']).toContain(byCode['audit.log'].action);
  });
  // ═══════════ Đối chiếu NGƯỢC ra tài liệu bán hàng ═══════════

  /**
   * [L6 — cập nhật ngược tài liệu] Kế hoạch đòi cập nhật `so-nang-luc-ipms.md` và BRD Nền tảng
   * khi một mục chuyển sang "Đã có". Việc đó dễ làm một lần rồi quên mãi mãi — nên khoá lại
   * bằng test: trạng thái trong BRD phải KHỚP bảng đối chiếu ở trên.
   *
   * Đây là chỗ tài liệu bán hàng gặp mã nguồn. Lệch theo chiều nào cũng tệ, nhưng lệch theo
   * chiều "tài liệu hứa nhiều hơn mã làm được" thì tệ hơn hẳn — nó thành cam kết với khách.
   */
  it('[cập nhật ngược] trạng thái trong BRD Nền tảng khớp bảng đối chiếu', () => {
    const brdPath = join(
      __dirname, '..', '..', '..', '..', '..',
      '.claude', 'skills', 'ipms-presales-common', 'templates', 'brd-nen-tang.mau.json',
    );
    if (!existsSync(brdPath)) {
      // Tài liệu tiền bán hàng nằm ngoài `05-build/`. Không có nó thì bỏ qua thay vì đỏ —
      // nhưng KHÔNG im lặng: một lần chạy không kiểm được điều này phải nói ra.
      // eslint-disable-next-line no-console
      console.warn(`[L6] Bỏ qua đối chiếu BRD — không tìm thấy ${brdPath}`);
      return;
    }
    const brd = JSON.parse(readFileSync(brdPath, 'utf8')) as {
      yeu_cau: Array<{ ma: string; trang_thai: string }>;
    };
    const statusOf = new Map(brd.yeu_cau.map((r) => [r.ma, r.trang_thai]));

    // Ánh xạ: `met` ⇒ "Đã có"; `partial` ⇒ "Một phần"; `gap` ⇒ "Chưa có".
    //
    // [Tự bắt khi chạy lần đầu] Một mã BR có thể trải trên NHIỀU mục §7 — `BR-M13-04` phủ cả
    // cờ rủi ro (mục 8, đạt), luồng sự cố (mục 10, đạt) và dashboard bốn khối (mục 11, một
    // phần). Bản đầu so từng cặp nên đòi BRD ghi "Đã có" cho một yêu cầu mà một phần của nó
    // chưa xong. Luật đúng: **trạng thái của một yêu cầu là trạng thái của phần YẾU NHẤT** —
    // hứa với khách theo phần mạnh nhất là cách tài liệu bán hàng bắt đầu nói dối.
    const WANT: Record<Status, string> = { met: 'Đã có', partial: 'Một phần', gap: 'Chưa có' };
    const RANK: Record<Status, number> = { gap: 0, partial: 1, met: 2 };
    const weakestByBr = new Map<string, Status>();
    for (const item of ITEMS) {
      for (const br of item.br) {
        const cur = weakestByBr.get(br);
        if (!cur || RANK[item.status] < RANK[cur]) weakestByBr.set(br, item.status);
      }
    }
    const mismatches: string[] = [];
    for (const [br, weakest] of weakestByBr) {
      const actual = statusOf.get(br);
      if (!actual) continue;   // mã BR không có trong bộ 74 yêu cầu — bỏ qua, không bịa
      if (actual !== WANT[weakest]) {
        mismatches.push(`${br}: BRD ghi '${actual}', phần yếu nhất là '${WANT[weakest]}'`);
      }
    }
    expect(mismatches).toEqual([]);
    expect(weakestByBr.size).toBeGreaterThan(5);   // chống "assert chạy 0 lần"
  });

  it('[cập nhật ngược] sổ năng lực KHÔNG còn ghi "chưa có retention engine"', () => {
    const docPath = join(
      __dirname, '..', '..', '..', '..', '..',
      '.claude', 'skills', 'ipms-presales-common', 'so-nang-luc-ipms.md',
    );
    if (!existsSync(docPath)) return;
    const doc = readFileSync(docPath, 'utf8');
    // Câu này đúng cho tới hết L4 và SAI kể từ L5 — nếu còn, tài liệu đang bán thấp hơn năng
    // lực thật (ít hại hơn chiều ngược lại, nhưng vẫn là lệch).
    expect(doc).not.toContain('Chưa có retention engine');
    // …và không được hứa quá: "tuân thủ NĐ13 sẵn" là câu KHÔNG bao giờ được xuất hiện.
    expect(doc).toContain('KHÔNG** hứa "tuân thủ NĐ13 sẵn"');
  });
});
