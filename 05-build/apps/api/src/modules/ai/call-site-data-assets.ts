import { UnprocessableEntityException } from '@nestjs/common';

/**
 * [Trục D — vá Reviewer F220] MỘT bảng duy nhất khai nhóm dữ liệu theo ĐƯỜNG GỌI gateway.
 *
 * ═══ Vé F220 nói gì
 *
 * Kế hoạch trục D §Lát-1 yêu cầu: *"liệt kê cả ba đường gọi gateway, khai `dataAssets` đủ cho
 * từng đường"*. Làm đúng chữ đó thì cùng một sự thật — *agent này chạm nhóm dữ liệu nào* — được
 * khai ở BA nơi: hiến chương trong danh bạ · bảng `INLINE_TASK_DATA_ASSETS` · một literal viết
 * thẳng trong `ai-chat.service.ts`. Không nơi nào kiểm chéo nơi nào lúc build, nên lệch chỉ lộ
 * bằng **403 trên đường người dùng thật**. Đây là lỗi ở tầng KẾ HOẠCH, không phải ở tầng mã:
 * sửa ba nơi cho khớp là lặp lại đúng mẫu "bản sao tay thứ ba" mà nợ L0 vừa phải trả ở `seed.ts`.
 *
 * ═══ Vì sao KHÔNG suy thẳng từ hiến chương
 *
 * Cách gọn nhất là bỏ hẳn bảng này và dùng `agent.dataAssetCodes` như `eval.service` đang làm.
 * Nhưng eval REPLAY toàn bộ hành vi của agent nên phạm vi của nó đúng bằng hiến chương; một
 * đường gọi cụ thể thì không. Mức của lượt gọi = **max rank các nhóm chạm tới**, nên khai trọn
 * hiến chương sẽ NÂNG TRẦN OAN mọi lượt gọi chỉ đọc nhóm nhẹ — làm rỗng nghĩa của chính phép
 * suy mà L1 dựng lên. Giữ độ chính xác theo từng đường gọi là có chủ đích.
 *
 * ═══ Nên: một nơi khai, và một test đối chiếu
 *
 * Khai ở đây (thuần, không phụ thuộc DB) để `ai-charter-consistency.spec.ts` đối chiếu ⊆ hiến
 * chương agent **lúc build**. Gateway vẫn kiểm chéo lúc chạy (N3) — hai lớp, và lớp build bắt
 * trước khi ai đó gặp 403 trên màn hình.
 *
 * Nguyên tắc khai: nhóm nào đường gọi THẬT SỰ đọc, không phải nhóm nào "có thể liên quan".
 * Khai thừa làm trần bị nâng oan; khai thiếu là nói dối cổng gác.
 */
export const CALL_SITE_DATA_ASSETS: Record<string, string[]> = {
  // Copilot chat (`ai-chat.service.ts`) — ngữ cảnh màn hình người dùng đang mở
  config_copilot: ['objective.kpi', 'task.dictionary'],

  // Bốn tác vụ gợi ý inline (`inline-assist.service.ts`), mã agent = `inline.<task>`
  'inline.taskcell.draft': ['task.dictionary'],
  'inline.taskcell.kpi_link': ['objective.kpi', 'task.dictionary'],
  // luật kéo theo — context chỉ có chức năng/ngạch/cấp bậc (thuộc cấu hình), KHÔNG hồ sơ cá
  // nhân nào, nên không khai `hr.profile`
  'inline.derivation.rule': ['objective.kpi', 'task.dictionary'],
  'inline.curation.dedup': ['task.dictionary', 'objective.kpi'],
};

/**
 * Nhóm dữ liệu của một đường gọi. Mã chưa khai ⇒ NÉM ngay tại chỗ gọi.
 *
 * Không trả mảng rỗng làm giá trị dự phòng: rỗng sẽ bị N2 chặn với thông điệp *"lượt gọi không
 * khai nhóm dữ liệu nào"* — đúng luật nhưng sai địa chỉ, người đọc lỗi sẽ đi sửa chỗ gọi trong
 * khi chỗ phải sửa là bảng này (đúng họ với F215 ở `eval.service`).
 */
export function dataAssetsFor(agentCode: string): string[] {
  const assets = CALL_SITE_DATA_ASSETS[agentCode];
  if (!assets || assets.length === 0) {
    throw new UnprocessableEntityException(
      `Đường gọi của agent '${agentCode}' chưa khai nhóm dữ liệu trong CALL_SITE_DATA_ASSETS — `
      + 'khai ở đó (và test sẽ đối chiếu với hiến chương trong danh bạ) trước khi gọi gateway.',
    );
  }
  return assets;
}
