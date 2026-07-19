/**
 * Harvest + đề xuất KPI domain FIN (lát G2 — go-live Từ điển Tác vụ, đợt 1 Kế toán/Tài chính/Nguồn vốn).
 *
 * Hai nguồn (quyết định D2/D3 15/07/2026 — Claude đề xuất, B1 CHỈNH SỬA file sinh ra):
 *  1) KPI ứng viên NHÚNG trong dữ liệu nguồn (8 tác vụ CORE có khối `kpis` riêng —
 *     Tài chính/Nguồn vốn/GL-CLOSE): lấy ứng viên đầu tiên làm KPI chính.
 *  2) KPI đề xuất THEO NHÓM tác vụ (46 tác vụ Kế toán không có khối `kpis`):
 *     bảng GROUP_KPI_PROPOSALS dưới đây — outcome-oriented, soạn từ tên nhóm +
 *     business_rules của nguồn; nhiều cell trỏ chung 1 KPI là hợp lệ (spec BU Gate).
 *
 * Dedup theo tên chuẩn hoá → mã FIN-EXT-0nn tất định (duyệt tác vụ đã sort mã).
 * Sinh: src/kpi-dictionary-ext.data.ts (KPI_DICTIONARY_EXT + TASK_KPI_MAP_V2).
 * CHẠY LẠI SẼ GHI ĐÈ chỉnh sửa tay — B1 đã sửa thì không chạy lại (hoặc merge tay).
 * Chạy: node packages/db/scripts/harvest-kpi-fin.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../src/task-catalog-v2.data.ts');
const OUT = path.resolve(__dirname, '../src/kpi-dictionary-ext.data.ts');

// ---- Bảng đề xuất KPI theo NHÓM (prefix mã tác vụ, bỏ hậu tố -0nn) ----
// Soạn outcome-oriented từ tên nhóm + business_rules nguồn; B1 hiệu chỉnh trong file sinh ra.
const GROUP_KPI_PROPOSALS = {
  'ACC-DOC': {
    name: 'Tỷ lệ chứng từ được tiếp nhận, kiểm tra và xử lý sai lệch đúng hạn',
    definition: 'Phần trăm chứng từ phát sinh được tiếp nhận, kiểm tra, phân loại và xử lý sai lệch (nếu có) trong SLA ngày làm việc quy định.',
    formula: '(Số chứng từ xử lý đúng hạn / Tổng chứng từ phát sinh trong kỳ) × 100%',
  },
  'ACC-GL': {
    name: 'Tỷ lệ bút toán và sổ chi tiết cập nhật đúng ngày, đúng kỳ',
    definition: 'Phần trăm nhật ký hạch toán, sổ chi tiết tài khoản và bảng tổng hợp chứng từ được cập nhật đầy đủ trong ngày/kỳ hạch toán, đúng tài khoản và bản chất nghiệp vụ.',
    formula: '(Số bút toán ghi nhận đúng ngày và đúng kỳ / Tổng bút toán phát sinh) × 100%',
  },
  'GL-DAY': {
    name: 'Tỷ lệ bút toán và sổ chi tiết cập nhật đúng ngày, đúng kỳ',
    definition: 'Phần trăm nhật ký hạch toán, sổ chi tiết tài khoản và bảng tổng hợp chứng từ được cập nhật đầy đủ trong ngày/kỳ hạch toán, đúng tài khoản và bản chất nghiệp vụ.',
    formula: '(Số bút toán ghi nhận đúng ngày và đúng kỳ / Tổng bút toán phát sinh) × 100%',
  },
  'ACC-EXP': {
    name: 'Tỷ lệ bút toán chi phí hạch toán đúng tài khoản, đúng kỳ',
    definition: 'Phần trăm bút toán mua hàng hoá dịch vụ và chi phí phát sinh được hạch toán đúng tài khoản, đúng đối tượng và đúng kỳ kế toán trên Bravo.',
    formula: '(Số bút toán chi phí đúng tài khoản và đúng kỳ / Tổng bút toán chi phí) × 100%',
  },
  'ACC-REV': {
    name: 'Tỷ lệ doanh thu ghi nhận và hoá đơn đầu ra phát hành đúng hạn',
    definition: 'Phần trăm bút toán doanh thu được ghi nhận đầy đủ và hoá đơn đầu ra được phát hành, lưu trữ đúng hạn theo quy định.',
    formula: '(Số khoản doanh thu ghi nhận + hoá đơn phát hành đúng hạn / Tổng khoản phát sinh) × 100%',
  },
  'ACC-AP': {
    name: 'Tỷ lệ hồ sơ thanh toán xử lý đúng SLA và công nợ phải trả đối chiếu đúng kỳ',
    definition: 'Phần trăm hồ sơ đề nghị thanh toán được kiểm tra, trình duyệt trong SLA và công nợ phải trả được cập nhật, đối chiếu đúng kỳ.',
    formula: '(Số hồ sơ đúng SLA + số dư NCC đối chiếu đúng kỳ / Tổng phát sinh) × 100%',
  },
  'ACC-AR': {
    name: 'Tỷ lệ công nợ phải thu đối chiếu và khoản thu ghi nhận đúng kỳ',
    definition: 'Phần trăm công nợ phải thu được cập nhật, đối chiếu đúng kỳ và khoản thu (học viên/bệnh nhân/khách hàng) được ghi nhận đầy đủ, khoản thu chưa xác định được rà soát.',
    formula: '(Số khoản thu ghi nhận và đối chiếu đúng kỳ / Tổng khoản thu phát sinh) × 100%',
  },
  'ACC-BANK': {
    name: 'Tỷ lệ giao dịch ngân hàng hạch toán và đối chiếu trong ngày',
    definition: 'Phần trăm giao dịch ngân hàng được hạch toán và sao kê ngày được đối chiếu khớp với sổ kế toán ngay trong ngày làm việc.',
    formula: '(Số ngày sao kê đối chiếu khớp trong ngày / Tổng số ngày làm việc trong kỳ) × 100%',
  },
  'ACC-CASH': {
    name: 'Tỷ lệ quỹ tiền mặt kiểm kê khớp sổ trong ngày',
    definition: 'Phần trăm ngày làm việc có bút toán thu chi tiền mặt ghi nhận đủ và số dư tiền mặt kiểm kê khớp sổ kế toán trong ngày.',
    formula: '(Số ngày quỹ khớp sổ / Tổng số ngày làm việc trong kỳ) × 100%',
  },
  'ACC-TAX': {
    name: 'Tỷ lệ hồ sơ và tờ khai thuế lập, nộp đúng hạn',
    definition: 'Phần trăm hoá đơn đầu vào được kiểm tra ghi nhận, dữ liệu thuế tổng hợp và tờ khai/hồ sơ thuế (GTGT, TNCN, TNDN) lập, nộp đúng hạn theo quy định.',
    formula: '(Số tờ khai/hồ sơ thuế nộp đúng hạn / Tổng số phải nộp trong kỳ) × 100%',
  },
  'GL-TAX': {
    name: 'Tỷ lệ hồ sơ và tờ khai thuế lập, nộp đúng hạn',
    definition: 'Phần trăm hoá đơn đầu vào được kiểm tra ghi nhận, dữ liệu thuế tổng hợp và tờ khai/hồ sơ thuế (GTGT, TNCN, TNDN) lập, nộp đúng hạn theo quy định.',
    formula: '(Số tờ khai/hồ sơ thuế nộp đúng hạn / Tổng số phải nộp trong kỳ) × 100%',
  },
  'ACC-CHIEF-BRAVO-CLOSE': {
    name: 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn',
    definition: 'Phần trăm kỳ kế toán có dữ liệu hạch toán trên Bravo được kiểm tra và chốt kỳ theo checklist khóa sổ đúng hạn.',
    formula: '(Số kỳ chốt đúng hạn / Tổng số kỳ trong năm) × 100%',
  },
  'GL-CTRL': {
    name: 'Tỷ lệ sai lệch và chênh lệch tài khoản xử lý, giải trình đúng hạn',
    definition: 'Phần trăm bút toán sai lệch được rà soát xử lý và hồ sơ giải trình chênh lệch tài khoản hoàn tất trong thời hạn quy định.',
    formula: '(Số sai lệch xử lý đúng hạn / Tổng sai lệch phát hiện trong kỳ) × 100%',
  },
  'GL-MONTH': {
    name: 'Tỷ lệ hạng mục khóa sổ tháng hoàn tất đúng hạn',
    definition: 'Phần trăm hạng mục khóa sổ tháng (đối chiếu công nợ, phân bổ chi phí trả trước, trích khấu hao, đối chiếu liên quan) hoàn tất đúng hạn.',
    formula: '(Số hạng mục hoàn tất đúng hạn / Tổng hạng mục checklist tháng) × 100%',
  },
  'GL-REPORT': {
    name: 'Tỷ lệ báo cáo kế toán tháng chốt số liệu đúng hạn',
    definition: 'Phần trăm báo cáo cân đối phát sinh và báo cáo kế toán tháng được kiểm tra và chốt số liệu đúng hạn.',
    formula: '(Số báo cáo tháng chốt đúng hạn / Tổng số báo cáo tháng trong kỳ) × 100%',
  },
  'GL-CLOSE': {
    name: 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn',
    definition: 'Phần trăm kỳ khóa sổ (tháng/năm) có checklist được nghiệm thu hoàn tất đúng hạn.',
    formula: '(Số kỳ khóa sổ nghiệm thu đúng hạn / Tổng số kỳ) × 100%',
  },
  'GL-YE': {
    name: 'Hồ sơ quyết toán và báo cáo tài chính năm hoàn tất đúng hạn',
    definition: 'Bộ hồ sơ quyết toán năm được tổng hợp đầy đủ và báo cáo tài chính năm được lập, trình phê duyệt đúng thời hạn quy định.',
    formula: 'Đạt/Không đạt theo mốc thời hạn quy định từng hạng mục hồ sơ năm',
  },
  'FIN-CTRL-ANL-MONTH-CORE': {
    name: 'Báo cáo kiểm soát CAPEX tháng hoàn tất đúng hạn, đủ nội dung',
    definition: 'Báo cáo kiểm soát CAPEX tháng được hoàn tất đúng hạn với đầy đủ nội dung phân tích theo yêu cầu kiểm soát đầu tư.',
    formula: '(Số báo cáo CAPEX tháng đúng hạn đủ nội dung / Tổng số tháng trong kỳ) × 100%',
  },
  'FIN-FORECAST-MONTH-CORE': {
    name: 'Forecast tài chính tháng cập nhật và phê duyệt đúng hạn',
    definition: 'Forecast tài chính tháng được cập nhật số liệu thực tế và trình phê duyệt đúng lịch quy định.',
    formula: '(Số forecast tháng phê duyệt đúng hạn / Tổng số tháng trong kỳ) × 100%',
  },
  'FUND-DEBT-MONTH-CORE': {
    name: 'Báo cáo trạng thái nguồn vốn và nghĩa vụ nợ tháng hoàn tất đúng hạn',
    definition: 'Báo cáo trạng thái nguồn vốn và nghĩa vụ nợ vay tháng được hoàn tất đúng hạn, phản ánh đầy đủ dư nợ, lịch trả và covenant.',
    formula: '(Số báo cáo tháng đúng hạn / Tổng số tháng trong kỳ) × 100%',
  },
  'FUND-LIQ-WEEK-CORE': {
    name: 'Báo cáo thanh khoản và nhu cầu vốn tuần cập nhật đúng hạn',
    definition: 'Báo cáo thanh khoản và nhu cầu vốn tuần được cập nhật đúng lịch, đủ căn cứ dòng tiền vào/ra và nhu cầu vốn ngắn hạn.',
    formula: '(Số báo cáo tuần đúng hạn / Tổng số tuần trong kỳ) × 100%',
  },
  'FUND-RAISE-TXN-CORE': {
    name: 'Hồ sơ thu xếp vốn trình phê duyệt đúng SLA',
    definition: 'Hồ sơ thu xếp vốn vay hoặc huy động vốn được chuẩn bị đầy đủ và trình phê duyệt trong SLA quy định cho từng giao dịch.',
    formula: '(Số hồ sơ trình đúng SLA / Tổng số giao dịch thu xếp vốn trong kỳ) × 100%',
  },
};

// ---- đọc data file (emit dạng JSON.parse("...") — parse chuỗi JSON hai lớp) ----
const ts = fs.readFileSync(SRC, 'utf8');
const m = ts.indexOf('JSON.parse("');
const end = ts.lastIndexOf(');');
if (m < 0 || end < 0) throw new Error('Không đọc được TASK_CATALOG_V2 từ data file');
const TASKS = JSON.parse(JSON.parse(ts.slice(m + 'JSON.parse('.length, end)));

const normalize = (name) => name
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
  .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
// nhóm = mã bỏ hậu tố số cuối (kể cả dạng sinh tự động -T0nn)
const groupOf = (code) => code.replace(/-T?\d+$/, '');

// ---- PHẠM VI ĐỢT 1 theo DEPT whitelist (quyết định D5 — Kế toán/Tài chính/Nguồn vốn) ----
// KHÔNG dùng domain suy từ jsonFile: dữ liệu nguồn có dòng dept khác (vd "Giờ giảng
// đại học") nhưng dính _jsonFile FIN_Chief → map mù theo domain sẽ gán KPI khóa sổ
// cho tác vụ giờ giảng (sai nghiệp vụ). Dept là nhãn tin cậy hơn ở tầng summary.
const FIN_DEPTS = new Set(['Kế toán viên', 'Kế toán tổng hợp', 'Kế toán trưởng', 'Tài chính', 'Nguồn vốn']);
const fin = TASKS.filter((t) => FIN_DEPTS.has(t.dept) && !t.assumed)
  .sort((a, b) => a.code.localeCompare(b.code));

// ---- một lượt duyệt — thứ tự ưu tiên map:
//  1) bảng nhóm CURATED (GROUP_KPI_PROPOSALS — chuẩn ngữ nghĩa per nhóm mã)
//  2) KPI ứng viên nhúng per-task (8 tác vụ CORE có khối kpis riêng chính xác)
//     LƯU Ý: với dòng codeless, khối kpis là MẪU CẤP FILE (mọi task trong file trùng
//     bộ KPI) → chỉ dùng làm fallback, reason ghi rõ để B1 tinh chỉnh per-task.
const kpiByNorm = new Map();
const taskMap = {};
const unmapped = [];
let seq = 0;

function register(nameVi, meta) {
  const norm = normalize(nameVi);
  let entry = kpiByNorm.get(norm);
  if (!entry) {
    seq += 1;
    entry = { code: `FIN-EXT-${String(seq).padStart(3, '0')}`, nameVi: nameVi.trim(),
      definition: '', formula: '', tasks: [], sourceSystems: new Set(), origin: meta.origin };
    kpiByNorm.set(norm, entry);
  }
  if (!entry.definition && meta.definition) entry.definition = meta.definition;
  if (!entry.formula && meta.formula) entry.formula = meta.formula;
  return entry;
}

for (const t of fin) {
  const proposal = GROUP_KPI_PROPOSALS[groupOf(t.code)];
  const primary = (t.kpisCandidate || [])[0];
  let entry; let reason;
  if (proposal) {
    entry = register(proposal.name, {
      origin: 'group_proposal', definition: proposal.definition, formula: proposal.formula,
    });
    reason = `Đề xuất theo nhóm tác vụ ${groupOf(t.code)} (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh`;
  } else if (primary && primary.name) {
    const isTemplate = t.codeSynthesized === true; // codeless → khối kpis là mẫu cấp file
    entry = register(primary.name, {
      origin: isTemplate ? 'file_template' : 'embedded',
      definition: (primary.definition || '').trim(),
      formula: primary.target ? `Mục tiêu tham chiếu từ nguồn: ${primary.target.trim()}. (B1 chuẩn hoá công thức đo.)` : '',
    });
    reason = isTemplate
      ? `KPI MẪU cấp file nguồn '${t.jsonFile}' (áp chung cho cụm tác vụ codeless): '${primary.name.trim()}' — B1 tinh chỉnh per-task khi tối ưu`
      : `KPI ứng viên nhúng trong tác vụ nguồn (Dashboard v2): '${primary.name.trim()}'`
        + (primary.target ? ` — mục tiêu ${primary.target.trim()}` : '');
  } else {
    unmapped.push(t.code);
    continue;
  }
  entry.tasks.push(t.code);
  for (const s of t.sourceSystems || []) entry.sourceSystems.add(s);
  taskMap[t.code] = { kpi: entry.code, reason };
}

const kpis = [...kpiByNorm.values()].map((k) => ({
  code: k.code,
  domain: 'Tài chính - Kế toán',
  nameVi: k.nameVi,
  definition: (k.definition || `${k.nameVi}. (B1 chuẩn hoá định nghĩa.)`)
    + ` [ĐỀ XUẤT ${k.origin === 'embedded' ? 'từ KPI ứng viên nhúng' : 'theo nhóm tác vụ'} — nguồn: ${k.tasks.slice(0, 5).join(', ')}${k.tasks.length > 5 ? '…' : ''}]`,
  formula: k.formula || '(B1 bổ sung công thức đo.)',
  grain: 'Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)',
  dataClassification: 'Internal',
  sourceSystem: [...k.sourceSystems].join(', ') || 'Bravo',
  aiBoundary: 'Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng',
}));

const header = `/**
 * Từ điển KPI MỞ RỘNG — domain Tài chính - Kế toán (lát G2, đợt 1 go-live Từ điển Tác vụ).
 *
 * TRẠNG THÁI: ĐỀ XUẤT (draft) — theo quyết định D3 (15/07/2026): "Claude đề xuất
 * trước, B1/chủ dự án CHỈNH SỬA TRỰC TIẾP FILE NÀY cho phù hợp".
 * Hai nguồn đề xuất (ghi rõ trong definition từng entry):
 *   · [từ KPI ứng viên nhúng] — khối \`kpis\` có sẵn trong tác vụ nguồn Dashboard v2.
 *   · [theo nhóm tác vụ]      — Claude soạn outcome-KPI cho nhóm tác vụ Kế toán
 *                               không có khối kpis (bảng GROUP_KPI_PROPOSALS trong script).
 * Trường đánh dấu "(B1 …)" là chỗ cần chuẩn hoá trước khi công bố rộng.
 *
 * Sinh bởi scripts/harvest-kpi-fin.mjs — CHẠY LẠI SẼ GHI ĐÈ chỉnh sửa tay.
 * Được seed vào kpi_template (isDictionary=true) cùng KPI_DICTIONARY gốc (seed.ts).
 */
import type { KpiDictEntry } from './kpi-dictionary.data';

export const KPI_DICTIONARY_EXT: KpiDictEntry[] = ${JSON.stringify(kpis, null, 2)};

/** Map tác vụ → KPI (explainable từng dòng) — dùng bởi mapper task-catalog-v2. */
export const TASK_KPI_MAP_V2: Record<string, { kpi: string; reason: string }> = ${JSON.stringify(taskMap, null, 2)};
`;
fs.writeFileSync(OUT, header);

console.log('OUT:', OUT);
console.log('FIN tác vụ:', fin.length, '| map được:', Object.keys(taskMap).length, '| chưa map:', unmapped.length, unmapped.join(','));
console.log('KPI đề xuất (dedup):', kpis.length);
for (const k of kpis) console.log(`  ${k.code}  ${k.nameVi}`);
