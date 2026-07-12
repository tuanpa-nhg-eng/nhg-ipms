import { UnprocessableEntityException } from '@nestjs/common';
import type { TenantTx } from '@ipms/db';

/**
 * [Q1 CHẶN CỨNG — helper dùng chung] Mọi task_cell canonical/ACTIVE phải gắn KPI THẬT:
 * kpiRef trỏ tới một kpi_template đang tồn tại (Từ điển KPI chuẩn hoặc KPI đã publish).
 * Không mã treo, không placeholder. Gọi tại: canonical publish + import as_canonical
 * (lát 4h) · approve-active vòng lặp tối ưu (lát 4k) · config publish với cell
 * version-scoped (F108 — publish là active-transition của cell trong version).
 */
export async function assertKpiRefExists(tx: TenantTx, kpiRef: string | undefined | null) {
  if (!kpiRef) {
    throw new UnprocessableEntityException(
      'Tác vụ canonical/active bắt buộc gắn mã KPI (payload.kpiRef hoặc kpi) — không có ngoại lệ',
    );
  }
  const kpi = await tx.kpiTemplate.findFirst({
    where: { code: kpiRef, deletedAt: null }, // RLS: thấy global + tenant
    select: { id: true },
  });
  if (!kpi) {
    throw new UnprocessableEntityException(
      `Mã KPI '${kpiRef}' không tồn tại trong Từ điển KPI — gắn KPI thật (xem /kpi-dictionary) trước khi đưa vào thư viện/active`,
    );
  }
}

/**
 * [F108] Batch-check cho config publish: mọi cell version-scoped trong version
 * phải gắn KPI thật TRƯỚC khi version thành published (= cell thành hiện hành).
 * Trả danh sách mã cell vi phạm (rỗng = sạch) — caller quyết định chặn.
 */
export async function findCellsWithDanglingKpi(
  tx: TenantTx, configVersionId: string,
): Promise<string[]> {
  const cells = await tx.taskCell.findMany({
    where: { configVersionId, deletedAt: null },
    select: { code: true, kpiRef: true },
  });
  if (cells.length === 0) return [];
  const refs = [...new Set(cells.map((c) => c.kpiRef).filter((r): r is string => !!r))];
  const found = refs.length > 0
    ? await tx.kpiTemplate.findMany({
        where: { code: { in: refs }, deletedAt: null }, select: { code: true },
      })
    : [];
  const ok = new Set(found.map((k) => k.code));
  return cells.filter((c) => !c.kpiRef || !ok.has(c.kpiRef)).map((c) => c.code);
}
