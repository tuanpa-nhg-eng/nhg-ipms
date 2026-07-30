import { SetMetadata } from '@nestjs/common';
import type { ExportDestKind } from '@ipms/shared';

export const EXPORTED_KEY = 'ipms:exported';
export const EXPORT_EXEMPT_KEY = 'ipms:export-exempt';

export interface ExportedOptions {
  /** Mã `data_asset` trong sổ đăng ký (L0). Mã chưa đăng ký ⇒ route bị CHẶN, không "cho qua". */
  asset: string;
  /** Đích cụ thể, đọc được trong sổ vết: 'oneoffice', 'ms_todo', 'file:xlsx'… */
  destination: string;
  destinationKind: ExportDestKind;
  /**
   * Số bản ghi thực sự rời hệ thống, TÍNH TỪ RESPONSE. Bắt buộc, không có giá trị suy đoán
   * mặc định: một sổ vết mà số lượng là phỏng đoán của framework thì con số đó vô dụng đúng
   * lúc cần nhất (điều tra sự cố rò dữ liệu). Trả 0 khi không có gì ra là hợp lệ.
   */
  count: (result: any) => number;
}

/**
 * [Trục C L1 — K2] Khai báo một route là ĐƯỜNG XUẤT DỮ LIỆU.
 *
 * Khai ở đây kéo theo BA hệ quả, không chỉ ghi log:
 *   ① ExportGuard tra mức phân loại của `asset` trong sổ đăng ký (L0) và áp trần
 *      `exportDecision(mức × loại đích)` — có thể CHẶN route dù RBAC đã cho qua;
 *   ② mức `confidential` đòi thêm quyền `export:confidential` (không vai nào có mặc định);
 *   ③ ExportLogInterceptor ghi `export_log` append-only sau khi handler chạy xong.
 *
 * Fail-closed: route TRÔNG NHƯ đường xuất (xem `looksLikeEgress`) mà KHÔNG khai → 403.
 * Không có chế độ "cảnh báo rồi cho qua".
 */
export const Exported = (o: ExportedOptions) => SetMetadata(EXPORTED_KEY, o);

/**
 * [Trục C L1] VAN AN TOÀN có tài liệu — route khớp heuristic egress nhưng KHÔNG phải đường
 * dữ liệu ra (ví dụ `POST /integrations/import/csv` là dữ liệu VÀO; `GET /export-log` là đọc
 * chính sổ vết). Lý do là tham số BẮT BUỘC: mỗi miễn trừ phải tự giải thích được trước
 * Reviewer, và `export-control.spec` đóng đinh danh sách miễn trừ nên thêm một cái mới là
 * một sửa đổi tường minh có người rà.
 */
export const ExportExempt = (reason: string) => SetMetadata(EXPORT_EXEMPT_KEY, reason);
