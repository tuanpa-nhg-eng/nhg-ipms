/**
 * Unit — vá đợt Reviewer đối kháng 05/08/2026 (F191–F200), phần KHÔNG cần cơ sở dữ liệu.
 *
 * Ba vé ở đây có chung một tính chất: chúng hỏng ở NHÁNH HIẾM (lỗi giữa chừng, ngày cuối
 * tháng, job thiếu dữ liệu). Nhánh hiếm là chỗ mà kiểm thử tích hợp chạy trên dữ liệu seed
 * gần như không bao giờ đi qua — nên phải ép vào bằng ca kiểm riêng, không trông chờ vào
 * việc "chạy nhiều rồi sẽ gặp".
 */
import { of, throwError } from 'rxjs';
import { monthsAgo } from '../../src/modules/retention/retention.service';
import { ExportLogInterceptor } from '../../src/common/export/export-log.interceptor';
import { OutboxDispatcher } from '../../src/modules/integration/outbox.dispatcher';

describe('[F199] monthsAgo — lùi tháng không tràn ngày', () => {
  it('31/03 lùi 1 tháng ra 28/02, KHÔNG nhảy sang 03/03', () => {
    const d = monthsAgo(new Date(2021, 2, 31), 1); // 2021 không nhuận
    expect(d.getFullYear()).toBe(2021);
    expect(d.getMonth()).toBe(1);   // tháng 2
    expect(d.getDate()).toBe(28);
  });

  it('kẹp đúng vào năm nhuận (29/02)', () => {
    const d = monthsAgo(new Date(2020, 2, 31), 1);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(29);
  });

  it('mốc cắt luôn lùi về QUÁ KHỨ — không bao giờ vượt qua chính nó', () => {
    // Vế quan trọng nhất: hỏng theo kiểu cũ làm cutoff chạy về tương lai, tức quét xoá THÊM
    // dữ liệu ngoài phạm vi chính sách. Quét mọi ngày trong một năm để không phụ thuộc việc
    // ca kiểm tình cờ chạy vào ngày nào.
    for (let m = 0; m < 12; m += 1) {
      for (const day of [28, 29, 30, 31]) {
        const from = new Date(2021, m, day);
        if (from.getMonth() !== m) continue;   // ngày không tồn tại trong tháng đó
        for (const months of [1, 2, 3, 6, 24, 60, 120]) {
          const cut = monthsAgo(from, months);
          expect(cut.getTime()).toBeLessThan(from.getTime());
        }
      }
    }
  });

  it('bội số của 12 tháng thì giữ nguyên ngày (đường đi cũ vốn đã đúng)', () => {
    const d = monthsAgo(new Date(2021, 2, 31), 24);
    expect(d.getFullYear()).toBe(2019);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(31);
  });
});

describe('[F193] ExportLogInterceptor — handler hỏng giữa chừng vẫn ghi vết', () => {
  const exportCtx = {
    asset: 'objective.kpi', classification: 'internal',
    destination: 'external_todo', destinationKind: 'external_service',
    route: '/integrations/jobs/morning-todos/run', rule: 'internal: trong trần cho phép',
    count: (r: any) => r?.pushed ?? 0,
  };

  function harness(withExport = true) {
    const created: any[] = [];
    const tx = { exportLog: { create: async (args: any) => { created.push(args.data); } } };
    const prisma = { withTenant: (_t: string, fn: any) => fn(tx) } as any;
    const req: any = {
      method: 'POST', ipmsTenantId: 'tenant-1', ipmsClaims: { sub: 'user-1' },
      ipmsExport: withExport ? exportCtx : undefined,
    };
    const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };
    return { interceptor: new ExportLogInterceptor(prisma), ctx, created };
  }

  it('đường THÀNH CÔNG ghi vết với số bản ghi thật (không hồi quy)', async () => {
    const { interceptor, ctx, created } = harness();
    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(ctx, { handle: () => of({ pushed: 5 }) } as any)
        .subscribe({ next: () => resolve(), error: reject });
    });
    expect(created).toHaveLength(1);
    expect(created[0].recordCount).toBe(5);
    expect(created[0].rule).not.toContain('KHÔNG HOÀN TẤT');
  });

  it('handler NÉM ⇒ vẫn có dòng export_log, và lỗi gốc vẫn được ném ra', async () => {
    const { interceptor, ctx, created } = harness();
    const boom = new Error('hệ todo ngoài sập ở mục thứ tư');
    const err = await new Promise<any>((resolve) => {
      interceptor.intercept(ctx, { handle: () => throwError(() => boom) } as any)
        .subscribe({ next: () => resolve(null), error: (e) => resolve(e) });
    });
    // Lỗi gốc KHÔNG bị nuốt — nuốt sẽ biến một lượt xuất thất bại thành response 200.
    expect(err).toBe(boom);
    expect(created).toHaveLength(1);
    expect(created[0].rule).toContain('KHÔNG HOÀN TẤT');
    // Không bịa số: chưa biết bao nhiêu bản ghi đã ra ngoài thì phải NÓI là không xác định.
    expect(created[0].rule).toContain('KHÔNG XÁC ĐỊNH');
  });

  it('service khai `partialExportCount` thì con số đó vào sổ vết', async () => {
    const { interceptor, ctx, created } = harness();
    const boom = Object.assign(new Error('sập giữa chừng'), { partialExportCount: 3 });
    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, { handle: () => throwError(() => boom) } as any)
        .subscribe({ next: () => resolve(), error: () => resolve() });
    });
    expect(created[0].recordCount).toBe(3);
    expect(created[0].rule).toContain('đã đẩy 3 bản ghi');
  });

  it('route KHÔNG phải đường xuất thì lỗi đi thẳng, không ghi vết', async () => {
    const { interceptor, ctx, created } = harness(false);
    const boom = new Error('lỗi thường');
    const err = await new Promise<any>((resolve) => {
      interceptor.intercept(ctx, { handle: () => throwError(() => boom) } as any)
        .subscribe({ next: () => resolve(null), error: (e) => resolve(e) });
    });
    expect(err).toBe(boom);
    expect(created).toHaveLength(0);
  });
});

describe('[F198] OutboxDispatcher.notify — khoá hàng đợi phải gồm actor', () => {
  function dispatcherWithFakeQueue() {
    const added: any[] = [];
    const d = new OutboxDispatcher({} as any, {} as any, {} as any);
    (d as any).queue = { add: async (name: string, data: any, opts: any) => { added.push({ name, data, opts }); } };
    return { d, added };
  }

  it('hai người khác nhau ⇒ hai jobId khác nhau (không ai bị ghi nhầm tên vào sổ xuất)', () => {
    const { d, added } = dispatcherWithFakeQueue();
    d.notify('tenant-1', 'user-A');
    d.notify('tenant-1', 'user-B');
    expect(added.map((a) => a.opts.jobId)).toEqual(['t-tenant-1-user-A', 't-tenant-1-user-B']);
  });

  it('cùng một người ⇒ cùng jobId (gộp lô vẫn đúng ý định debounce)', () => {
    const { d, added } = dispatcherWithFakeQueue();
    d.notify('tenant-1', 'user-A');
    d.notify('tenant-1', 'user-A');
    expect(added[0].opts.jobId).toBe(added[1].opts.jobId);
  });

  it('không có actor ⇒ KHÔNG enqueue (job đó chắc chắn bị từ chối)', () => {
    const { d, added } = dispatcherWithFakeQueue();
    d.notify('tenant-1');
    expect(added).toHaveLength(0);
  });

  it('khoá mới khác không-gian khoá cũ `t-<tenant>` — job cũ kẹt trong Redis không chặn được job mới', () => {
    const { d, added } = dispatcherWithFakeQueue();
    d.notify('tenant-1', 'user-A');
    expect(added[0].opts.jobId).not.toBe('t-tenant-1');
  });
});
