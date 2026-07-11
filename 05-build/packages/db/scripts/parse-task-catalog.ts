/**
 * Parser Task Catalog (lát 4i) — trích 815 tác vụ từ
 * gg-io-nhg/gg-io-nhg/00_inputs/Task_Catalog_Tech_Exec.html (CDO/CTO, 21 phòng ban)
 * → sinh src/task-catalog.data.ts (COMMITTED — CI/test không cần folder gg-io-nhg).
 *
 * Chạy lại khi Task Catalog nguồn đổi:
 *   pnpm --filter @ipms/db exec ts-node --transpile-only scripts/parse-task-catalog.ts
 *
 * Parser thuần regex trên cấu trúc HTML đồng nhất (mỗi tác vụ = 1 tbody.task-group
 * gồm 2 <tr>: hàng chính 6 cột + hàng chi tiết Inputs/Outputs). Tất định — chạy 2 lần
 * cùng input ra cùng output (diff git = 0).
 */
import * as fs from 'fs';
import * as path from 'path';

const SOURCE = path.resolve(
  __dirname, '../../../..', 'gg-io-nhg/gg-io-nhg/00_inputs/Task_Catalog_Tech_Exec.html',
);
const OUT = path.resolve(__dirname, '../src/task-catalog.data.ts');

/** Giải mã entity HTML thường gặp trong file nguồn. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Bỏ tag HTML + nén khoảng trắng (cho ô text thuần như Trigger/Loại dữ liệu). */
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Lấy nội dung các badge b-tool trong một đoạn HTML. */
function badges(html: string): string[] {
  const out: string[] = [];
  const re = /<span class="badge b-tool">([\s\S]*?)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(stripTags(m[1]));
  return out;
}

/** Lấy các <li> trong một đoạn HTML. */
function listItems(html: string): string[] {
  const out: string[] = [];
  const re = /<li[^>]*>([\s\S]*?)<\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = stripTags(m[1]);
    if (t) out.push(t);
  }
  return out;
}

interface RawTask {
  dept: string;          // tên phòng ban (21 nhóm, đúng nguyên văn HTML)
  ordinal: number;       // thứ tự trong phòng (1-based, ổn định theo HTML) → T<nnn>
  groupNo: number;       // số nhóm con từ label "1. Tác vụ ..." → G<nn>
  groupLabel: string;    // nhãn nhóm con nguyên văn
  name: string;          // tên tác vụ
  aiLevel: 'assist' | 'system' | 'manual'; // từ badge b-ai/b-sys/b-man
  sources: string[];     // Hệ thống nguồn (badge sau "Nguồn:")
  tools: string[];       // Công cụ (badge sau "Công cụ:")
  proposals: string[];   // Đề xuất công cụ (badge sau "Đề xuất:")
  trigger: string;       // Trigger (Kích hoạt)
  dataType: string;      // Loại Dữ liệu
  inputs: string[];      // Đầu vào
  outputs: string[];     // Đầu ra
}

function parse(html: string): RawTask[] {
  // Chỉ parse phần Catalog (sau tiêu đề mục II) — tránh dính bảng tổng quan
  const start = html.indexOf('Technical Task Catalog');
  const catalog = start >= 0 ? html.slice(start) : html;

  // Tách theo section phòng ban
  const deptRe = /<h2 class="dept-title">([\s\S]*?)<\/h2>/g;
  const deptMarks: Array<{ name: string; index: number }> = [];
  let dm: RegExpExecArray | null;
  while ((dm = deptRe.exec(catalog)) !== null) {
    // "Chấm công lịch giảng (82 tác vụ)" → bỏ hậu tố đếm
    const name = stripTags(dm[1]).replace(/\s*\(\d+\s*tác vụ\)\s*$/i, '').trim();
    deptMarks.push({ name, index: dm.index });
  }

  const tasks: RawTask[] = [];
  for (let d = 0; d < deptMarks.length; d += 1) {
    const sectionEnd = d + 1 < deptMarks.length ? deptMarks[d + 1].index : catalog.length;
    const section = catalog.slice(deptMarks[d].index, sectionEnd);
    const blocks = section.split('<tbody class="task-group">').slice(1);

    let ordinal = 0;
    for (const block of blocks) {
      ordinal += 1;
      // Hàng chính = <tr> đầu tiên; hàng chi tiết = phần còn lại
      const firstTrEnd = block.indexOf('</tr>');
      const mainRow = block.slice(0, firstTrEnd);
      const detailRow = block.slice(firstTrEnd);

      const tds: string[] = [];
      const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let tm: RegExpExecArray | null;
      while ((tm = tdRe.exec(mainRow)) !== null) tds.push(tm[1]);
      if (tds.length < 6) {
        throw new Error(`Tác vụ #${ordinal} phòng "${deptMarks[d].name}": hàng chính chỉ có ${tds.length}/6 cột`);
      }

      const nameM = /<strong>([\s\S]*?)<\/strong>/.exec(tds[1]);
      const groupM = /<span[^>]*font-size:8\.5pt[^>]*>([\s\S]*?)<\/span>/.exec(tds[1]);
      if (!nameM) throw new Error(`Tác vụ #${ordinal} phòng "${deptMarks[d].name}": thiếu tên (strong)`);
      const groupLabel = groupM ? stripTags(groupM[1]) : '';
      const groupNoM = /^(\d+)\s*\./.exec(groupLabel);

      const aiBadge = /<span class="badge (b-ai|b-sys|b-man)">/.exec(tds[2]);
      const aiLevel = aiBadge?.[1] === 'b-sys' ? 'system' : aiBadge?.[1] === 'b-man' ? 'manual' : 'assist';

      // Cột 4: các khối <div> "Nguồn:" / "Công cụ:" / "Đề xuất:"
      const seg = (label: string): string => {
        const i = tds[3].indexOf(`<b>${label}:</b>`);
        if (i < 0) return '';
        const rest = tds[3].slice(i);
        const end = rest.indexOf('</div>');
        return end >= 0 ? rest.slice(0, end) : rest;
      };

      // Hàng chi tiết: tách Inputs/Outputs theo marker
      const outIdx = detailRow.indexOf('Đầu ra (Outputs)');
      const inputsHtml = outIdx >= 0 ? detailRow.slice(0, outIdx) : detailRow;
      const outputsHtml = outIdx >= 0 ? detailRow.slice(outIdx) : '';

      tasks.push({
        dept: deptMarks[d].name,
        ordinal,
        groupNo: groupNoM ? Number(groupNoM[1]) : 0,
        groupLabel,
        name: stripTags(nameM[1]),
        aiLevel,
        sources: badges(seg('Nguồn')),
        tools: badges(seg('Công cụ')),
        proposals: badges(seg('Đề xuất')),
        trigger: stripTags(tds[4]),
        dataType: stripTags(tds[5]),
        inputs: listItems(inputsHtml),
        outputs: listItems(outputsHtml),
      });
    }
  }
  return tasks;
}

function main() {
  const html = fs.readFileSync(SOURCE, 'utf8');
  const tasks = parse(html);

  const byDept = new Map<string, number>();
  for (const t of tasks) byDept.set(t.dept, (byDept.get(t.dept) ?? 0) + 1);
  console.log(`Parsed ${tasks.length} tác vụ / ${byDept.size} phòng ban:`);
  for (const [dept, n] of byDept) console.log(`  - ${dept}: ${n}`);

  const header = `/**
 * Task Catalog NHG (lát 4i) — ${tasks.length} tác vụ / ${byDept.size} phòng ban, trích từ
 * gg-io-nhg/gg-io-nhg/00_inputs/Task_Catalog_Tech_Exec.html (Enterprise Task & Data
 * Architecture — Từ điển Tác vụ Chuyển đổi số cấp CDO/CTO, xuất 8/7/2026).
 * FILE SINH TỰ ĐỘNG — KHÔNG sửa tay; chạy lại scripts/parse-task-catalog.ts nếu nguồn đổi.
 */
export interface TaskCatalogEntry {
  dept: string;
  ordinal: number;
  groupNo: number;
  groupLabel: string;
  name: string;
  aiLevel: 'assist' | 'system' | 'manual';
  sources: string[];
  tools: string[];
  proposals: string[];
  trigger: string;
  dataType: string;
  inputs: string[];
  outputs: string[];
}

export const TASK_CATALOG: TaskCatalogEntry[] = `;
  fs.writeFileSync(OUT, header + JSON.stringify(tasks, null, 1) + ';\n', 'utf8');
  console.log(`→ ${OUT}`);
}

main();
