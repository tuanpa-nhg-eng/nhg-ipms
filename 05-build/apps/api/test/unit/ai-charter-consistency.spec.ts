/**
 * Unit [Trục D — vá Reviewer F210 · F212 · F220] Hiến chương agent phải KHỚP giữa các nơi khai.
 *
 * Thuần, không DB — chạy trên đúng hai nguồn tĩnh: danh bạ chuẩn (`GLOBAL_AI_AGENTS`) và bảng
 * khai nhóm dữ liệu theo ĐƯỜNG GỌI (`CALL_SITE_DATA_ASSETS`).
 *
 * ═══ Vì sao file này tồn tại
 *
 * `inline-assist.tasks.ts` khẳng định trong chú thích của chính nó rằng bảng đó "unit-test
 * được (đối chiếu với hiến chương agent tương ứng trong danh bạ mà không cần dựng DB)".
 * Khi Reviewer đi tìm, `grep INLINE_TASK_DATA_ASSETS` toàn `apps/api` trả về đúng hai kết
 * quả — cả hai trong mã sản phẩm. Test đó chưa bao giờ được viết.
 *
 * Đây là lần thứ hai trong CÙNG một lát mà một chú thích khẳng định điều chưa có (lần kia:
 * `log()` viết "req đến đây LUÔN LÀ BẢN ĐÃ SCRUB" trong khi một caller mới truyền bản thô).
 * Bài học F191 nguyên văn: **một khẳng định sai trong chú thích được đọc như bằng chứng ở
 * mọi lần sửa sau.** Nên bản vá không phải là xoá câu chú thích — mà là làm cho nó đúng.
 */
import { GLOBAL_AI_AGENTS } from '@ipms/db';
import { CALL_SITE_DATA_ASSETS, dataAssetsFor } from '../../src/modules/ai/call-site-data-assets';
import { INLINE_TASKS } from '../../src/modules/ai/inline/inline-assist.tasks';
import { testAgentCode } from '../helpers/test-agent';

describe('[Trục D] Hiến chương agent — một sự thật, nhiều nơi khai', () => {
  it('[F210/F220] mọi đường gọi khai `dataAssets` ⊆ hiến chương agent trong danh bạ', () => {
    const byCode = new Map(GLOBAL_AI_AGENTS.map((a) => [a.code, a]));
    const codes = Object.keys(CALL_SITE_DATA_ASSETS);

    expect(codes.length).toBeGreaterThan(0);   // chống assert chạy 0 lần

    for (const code of codes) {
      const agent = byCode.get(code);
      // Khai cho một mã mà danh bạ không có ⇒ N1 sẽ chặn lúc CHẠY. Bắt ở đây, lúc build,
      // thay vì bằng 403 trên đường người dùng thật.
      expect({ code, coTrongDanhBa: agent !== undefined })
        .toEqual({ code, coTrongDanhBa: true });

      const declared = CALL_SITE_DATA_ASSETS[code];
      expect(declared.length).toBeGreaterThan(0);   // rỗng ⇒ N2 chặn mọi lượt (họ F215)

      const outOfCharter = declared.filter((a) => !agent!.assets.includes(a));
      // Gateway kiểm chéo đúng điều này lúc chạy và trả 403 (N3). Ca này biến nó thành lỗi
      // ĐỎ lúc sửa hiến chương — trước khi ai đó gặp 403 trên màn hình thật.
      expect({ code, ngoaiHienChuong: outOfCharter }).toEqual({ code, ngoaiHienChuong: [] });
    }
  });

  it('[F210/F220] agent có đường gọi phải đang `active` — khai cho agent `planned` là hẹn suông', () => {
    const byCode = new Map(GLOBAL_AI_AGENTS.map((a) => [a.code, a]));
    const codes = Object.keys(CALL_SITE_DATA_ASSETS);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect({ code, status: byCode.get(code)?.status }).toEqual({ code, status: 'active' });
    }
  });

  it('[F220] MỌI tác vụ inline đều có mặt trong bảng — thêm tác vụ mà quên khai thì đỏ ở đây', () => {
    /**
     * Chiều ngược lại của phép kiểm trên. Không có ca này thì một `InlineTask` mới thêm sẽ
     * chạy tới `dataAssetsFor()` rồi ném lúc RUNTIME — đúng loại lỗi mà F220 sinh ra để chấm
     * dứt (lệch giữa các nơi khai chỉ lộ trên đường người dùng thật).
     */
    expect(INLINE_TASKS.length).toBeGreaterThan(0);
    for (const task of INLINE_TASKS) {
      expect({ task, khai: dataAssetsFor(`inline.${task}`).length > 0 })
        .toEqual({ task, khai: true });
    }
  });

  it('[F220] `dataAssetsFor` NÉM cho mã chưa khai — không trả rỗng để N2 đổ lỗi sai chỗ', () => {
    // Trả `[]` thì N2 chặn với thông điệp "lượt gọi không khai nhóm dữ liệu nào" — đúng luật,
    // sai địa chỉ: người đọc lỗi đi sửa chỗ gọi, trong khi chỗ phải sửa là bảng khai.
    expect(() => dataAssetsFor('agent.chua.khai')).toThrow(/chưa khai nhóm dữ liệu/);
  });

  it('[F212] testAgentCode là ĐƠN ÁNH — hai `uniq` khác nhau không bao giờ ra cùng một mã', () => {
    /**
     * Bản đầu chuẩn hoá bằng cách BỎ ký tự không phải [a-z0-9]: `'a-1'` và `'a1'` cùng ra
     * `'a1'`. Và vì `registerTestAgent()` mở đầu bằng `deleteMany({ code })`, hai suite trùng
     * mã sẽ xoá agent của nhau rồi dựng lại với hiến chương khác — đỏ ngẫu nhiên ở một chỗ
     * chẳng liên quan gì tới thứ đang kiểm.
     */
    const uniqs = [
      'a-1', 'a1', 'a_1', 'A1', '1-a', '1a', 'a.1', 'a 1',
      // Ký tự thoát phải tự thoát được chính nó — nếu không, một `uniq` viết đúng dãy thoát
      // sẽ đụng một `uniq` khác đã được mã hoá. Bản vá đầu của tôi trượt đúng ca này.
      '_1t_1', '__', '_', 'a__1',
    ];
    const codes = uniqs.map((u) => testAgentCode('dup', u));
    expect(new Set(codes).size).toBe(uniqs.length);

    // Và mã sinh ra vẫn phải hợp `ai_agent_code_check` = ^[a-z][a-z0-9_.]{2,63}$
    for (const c of codes) expect(c).toMatch(/^[a-z][a-z0-9_.]{2,63}$/);
  });

  it('[F203] không agent nào trong danh bạ chuẩn khai trần `restricted`', () => {
    // Tầng ① của N6. Hai tầng kia: cổng `resolveAndGuardAgent` và CHECK
    // `ai_agent_ceiling_not_restricted_check`. Trước bản vá, tầng này là tầng DUY NHẤT — và
    // nó không chặn được đường ghi thẳng bằng owner (chính là đường mà helper test đi).
    expect(GLOBAL_AI_AGENTS.length).toBeGreaterThan(0);
    const viPham = GLOBAL_AI_AGENTS.filter((a) => a.maxDataClass === 'restricted').map((a) => a.code);
    expect(viPham).toEqual([]);
  });
});
