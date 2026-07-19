/**
 * [Learning Loop L1] Seed golden suite FIN baseline — 9 case curated cho 4 tác vụ
 * inline (suite 'golden-fin-baseline' per agent), grounded dữ liệu FIN go-live đợt-1.
 *
 * NGUYÊN TẮC THƯỚC ĐO (bài học E2 red-team): expected = đáp án NGHIỆP VỤ curated
 * (Claude đề xuất — B1 hiệu chỉnh file này), KHÔNG phải output của mock. Mock KHÔNG
 * kỳ vọng pass hết — pass-rate thấp trên mock là ĐỌC ĐÚNG (launch bar đỏ tới khi
 * model thật được đánh giá). Cùng shape input {task, agent, prompt, context} và
 * cùng bộ sinh assertion với case thu hoạch (goldenAssertions) — một thước đo.
 *
 * Chạy: pnpm --filter @ipms/api seed:golden [TENANT_CODE]   (mặc định H.01)
 * Idempotent: suite upsert theo (tenant, agent, name); case upsert theo (suite, name).
 */
import 'dotenv/config';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { goldenAssertions } from '../modules/ai/learning/golden.assertions';
import {
  promptCurationDedup, promptDerivationRule, promptKpiLink, promptTaskcellDraft,
} from '../modules/ai/inline/inline-assist.tasks';
import { evaluateQualityGate, CellPayload } from '../modules/library/quality-gate';

export const BASELINE_SUITE_NAME = 'golden-fin-baseline';

interface GoldenCaseSeed {
  name: string;
  agent: string;
  input: { task: string; agent: string; prompt: string; context: unknown };
  expected: Record<string, unknown>;
}

/** Dựng context draft đúng như InlineAssistService.buildContext (payload + missing từ gate). */
function draftContext(payload: CellPayload) {
  const gate = evaluateQualityGate(payload, 'task_cell');
  const missing = gate.checks.filter((c) => !c.passed).map((c) => c.id);
  return { payload, missing };
}

function buildCases(kpiCandidates: Array<{ code: string; nameVi: string; domain: string | null }>): GoldenCaseSeed[] {
  const kpiCodes = kpiCandidates.map((k) => k.code);
  const kpiLink = (name: string, cell: Record<string, unknown>, kpiRef: string): GoldenCaseSeed => ({
    name, agent: 'inline.taskcell.kpi_link',
    input: {
      task: 'taskcell.kpi_link', agent: 'inline.taskcell.kpi_link', prompt: promptKpiLink(),
      context: {
        cell: {
          code: cell.code ?? null, nameVi: cell.nameVi ?? null,
          responsibleRole: cell.responsibleRole ?? null, accountableRole: cell.accountableRole ?? null,
        },
        candidates: kpiCandidates,
      },
    },
    expected: { kpiRef },
  });
  const draft = (name: string, payload: CellPayload, fill: Record<string, unknown>): GoldenCaseSeed => ({
    name, agent: 'inline.taskcell.draft',
    input: {
      task: 'taskcell.draft', agent: 'inline.taskcell.draft', prompt: promptTaskcellDraft(),
      context: draftContext(payload),
    },
    expected: { fill },
  });
  const derivation = (name: string, description: string, rule: Record<string, unknown>): GoldenCaseSeed => ({
    name, agent: 'inline.derivation.rule',
    input: {
      task: 'derivation.rule', agent: 'inline.derivation.rule', prompt: promptDerivationRule(),
      context: { description, kpiCodes },
    },
    expected: { rule },
  });
  const dedup = (
    name: string, a: Record<string, unknown>, b: Record<string, unknown>, recommendation: 'merge' | 'keep_both',
  ): GoldenCaseSeed => {
    const diffFields = Object.keys(a).filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
    return {
      name, agent: 'inline.curation.dedup',
      input: {
        task: 'curation.dedup', agent: 'inline.curation.dedup', prompt: promptCurationDedup(),
        context: { a, b, diffFields },
      },
      expected: { recommendation },
    };
  };

  return [
    // ==== kpi_link — chọn đúng KPI Từ điển cho tác vụ FIN (bar ngữ nghĩa) ====
    kpiLink('fin-kpi-link-ap', {
      code: 'ACC-AP-001', nameVi: 'Tiếp nhận và kiểm tra hồ sơ đề nghị thanh toán',
      responsibleRole: 'Kế toán viên', accountableRole: 'Kế toán trưởng',
    }, 'FIN-EXT-001'),
    kpiLink('fin-kpi-link-bank', {
      code: 'ACC-BANK-001', nameVi: 'Hạch toán giao dịch ngân hàng và đối chiếu sao kê ngày',
      responsibleRole: 'Kế toán viên', accountableRole: 'Kế toán trưởng',
    }, 'FIN-EXT-003'),
    kpiLink('fin-kpi-link-cash', {
      code: 'ACC-CASH-001', nameVi: 'Ghi nhận thu chi và kiểm kê quỹ tiền mặt hằng ngày',
      responsibleRole: 'Kế toán viên', accountableRole: 'Kế toán trưởng',
    }, 'FIN-EXT-004'),

    // ==== draft — điền A–G thiếu đúng như nghiệp vụ FIN dùng thật ====
    draft('fin-draft-ap', { code: 'ACC-AP-001', nameVi: 'Tiếp nhận và kiểm tra hồ sơ đề nghị thanh toán' }, {
      responsibleRole: 'Kế toán viên', accountableRole: 'Kế toán trưởng',
      inputs: [{ name: 'Hồ sơ đề nghị thanh toán kèm chứng từ gốc' }],
      outputs: [{ name: 'Hồ sơ thanh toán hợp lệ chuyển trình duyệt' }],
      measures: [{ name: 'Tỷ lệ hồ sơ xử lý đúng SLA', kpiRef: 'FIN-EXT-001' }],
      aiLevel: 'assist',
    }),
    draft('fin-draft-gl', { code: 'GL-DAY-001', nameVi: 'Ghi nhận bút toán nhật ký hằng ngày' }, {
      responsibleRole: 'Kế toán tổng hợp', accountableRole: 'Kế toán trưởng',
      inputs: [{ name: 'Chứng từ kế toán phát sinh trong ngày' }],
      outputs: [{ name: 'Bút toán nhật ký cập nhật trên Bravo' }],
      measures: [{ name: 'Tỷ lệ bút toán cập nhật đúng ngày', kpiRef: 'FIN-EXT-008' }],
      aiLevel: 'assist',
    }),

    // ==== derivation.rule — match/emit đúng KPI Từ điển ====
    derivation('fin-rule-ap-sla',
      'Gắn KPI xử lý hồ sơ thanh toán đúng SLA cho vai trò Kế toán viên (function ACC), trọng số 30, nhóm Vận hành kế toán', {
        match: { function_codes: ['ACC'], role_family_codes: ['ACC'] },
        emit: { kpi_template_codes: ['FIN-EXT-001'], weight: 30, group_label: 'Vận hành kế toán' },
      }),
    derivation('fin-rule-close',
      'KPI hoàn tất checklist khóa sổ đúng hạn cho Kế toán trưởng, trọng số 20, nhóm Quản trị khóa sổ', {
        match: { function_codes: ['ACC'], role_family_codes: ['ACC_CHIEF'] },
        emit: { kpi_template_codes: ['FIN-EXT-005'], weight: 20, group_label: 'Quản trị khóa sổ' },
      }),

    // ==== curation.dedup — cùng tác vụ khác tên nhẹ = merge; khác bản chất = keep_both ====
    dedup('fin-dedup-merge', {
      code: 'ACC-AP-001', nameVi: 'Tiếp nhận & kiểm tra hồ sơ thanh toán (bản BU chỉnh)',
      responsibleRole: 'Kế toán viên', accountableRole: 'Kế toán trưởng', aiLevel: 'assist', kpiRef: 'FIN-EXT-001',
    }, {
      code: 'ACC-AP-001', nameVi: 'Tiếp nhận và kiểm tra hồ sơ đề nghị thanh toán',
      responsibleRole: 'Kế toán viên', accountableRole: 'Kế toán trưởng', aiLevel: 'assist', kpiRef: 'FIN-EXT-001',
    }, 'merge'),
    dedup('fin-dedup-keepboth', {
      code: 'FUND-PLAN-001', nameVi: 'Lập kế hoạch dòng tiền tuần',
      responsibleRole: 'Chuyên viên Nguồn vốn', accountableRole: 'Trưởng phòng Nguồn vốn',
      aiLevel: 'assist', kpiRef: 'FIN-EXT-012',
    }, {
      code: 'ACC-BANK-001', nameVi: 'Hạch toán giao dịch ngân hàng và đối chiếu sao kê ngày',
      responsibleRole: 'Kế toán viên', accountableRole: 'Kế toán trưởng',
      aiLevel: 'assist', kpiRef: 'FIN-EXT-003',
    }, 'keep_both'),
  ];
}

export interface GoldenSeedResult {
  tenantCode: string;
  suites: number;
  created: number;
  updated: number;
  cases: number;
}

export async function seedGoldenFin(owner: PrismaClient, tenantCode = 'H.01'): Promise<GoldenSeedResult> {
  const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
  if (!tenant) throw new Error(`Tenant ${tenantCode} chưa có — chạy pnpm db:seed trước`);
  const curator = await owner.appUser.findFirst({
    where: { tenantId: tenant.id, email: { startsWith: 'curator@' } },
  });

  // Ứng viên KPI từ Từ điển trong DB (41 mục sau G2) — trùng semantics buildContext kpi_link
  const dict = await owner.kpiTemplate.findMany({
    where: { tenantId: tenant.id, isDictionary: true, deletedAt: null },
    select: { code: true, nameVi: true, domain: true },
    orderBy: { code: 'asc' },
    take: 200,
  });
  if (dict.length === 0) throw new Error('Từ điển KPI trống — seed kpi_template trước (pnpm db:seed)');

  const cases = buildCases(dict);
  const agents = [...new Set(cases.map((c) => c.agent))];
  let created = 0;
  let updated = 0;

  for (const agent of agents) {
    let suite = await owner.aiEvalSuite.findFirst({
      where: { tenantId: tenant.id, agent, name: BASELINE_SUITE_NAME, deletedAt: null },
    });
    if (!suite) {
      suite = await owner.aiEvalSuite.create({
        data: { id: uuidv7(), tenantId: tenant.id, agent, name: BASELINE_SUITE_NAME, createdBy: curator?.id ?? null },
      });
    }
    for (const c of cases.filter((x) => x.agent === agent)) {
      const assertions = goldenAssertions(c.agent, c.expected);
      const row = { input: c.input as any, expected: c.expected as any, assertions: assertions as any };
      const existing = await owner.aiEvalCase.findFirst({
        where: { tenantId: tenant.id, suiteId: suite.id, name: c.name, deletedAt: null },
      });
      if (existing) {
        await owner.aiEvalCase.update({ where: { id: existing.id }, data: row });
        updated += 1;
      } else {
        await owner.aiEvalCase.create({
          data: { id: uuidv7(), tenantId: tenant.id, suiteId: suite.id, name: c.name, ...row },
        });
        created += 1;
      }
    }
  }
  return { tenantCode, suites: agents.length, created, updated, cases: cases.length };
}

/* istanbul ignore next — CLI runner */
if (require.main === module) {
  (async () => {
    const owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    try {
      const res = await seedGoldenFin(owner, process.argv[2] ?? 'H.01');
      // eslint-disable-next-line no-console
      console.log(`[seed-golden-fin] ${res.tenantCode}: ${res.suites} suite, ${res.created} case mới, ${res.updated} cập nhật (${res.cases} tổng)`);
    } finally {
      await owner.$disconnect();
    }
  })().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
}
