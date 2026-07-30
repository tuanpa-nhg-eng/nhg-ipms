/**
 * [Trục C L1 — K2] BỀ MẶT XUẤT DỮ LIỆU — phần "fail-closed" của kiểm soát xuất.
 *
 * Vấn đề thật: không thể đòi MỌI route khai `@Exported` (mọi màn đọc đều trả dữ liệu ra
 * response — đòi hết thì `@Exported` thành thủ tục giấy tờ, ai cũng khai bừa cho qua). Nhưng
 * chỉ ghi log ở route nào CHỦ ĐỘNG khai thì lát này vô nghĩa: người thêm đường xuất mới chỉ
 * cần… không khai.
 *
 * Nên hàng rào là HAI lớp, cố ý khác bản chất:
 *   ① RUNTIME (hàm dưới đây): route trông như đường xuất mà không khai → ExportGuard 403.
 *      Bắt được cái phổ biến nhất — thêm `GET .../export`, `.../download`, `.../*.csv`.
 *   ② BUILD-TIME (`export-control.spec.ts`): quét TOÀN BỘ route đã đăng ký của app và đóng
 *      đinh SNAPSHOT danh sách route KHỚP heuristic — mỗi cái phải đã được rà (khai
 *      `@Exported` hoặc `@ExportExempt('lý do')`). Thêm một route dạng xuất ⇒ test ĐỎ ⇒ buộc
 *      có người quyết định. Phần heuristic KHÔNG thể biết — route tên vô hại như
 *      `POST /integrations/jobs/morning-todos/run` mà vẫn đẩy dữ liệu ra hệ ngoài — được
 *      canh bằng CA HÀNH VI riêng trong cùng spec (gọi thật, đòi có dòng `export_log`), vì
 *      không snapshot đường dẫn nào bắt được loại đó.
 *
 * Heuristic một mình là KHÔNG đủ và không giả vờ là đủ; snapshot một mình cũng không (người
 * thêm route mới có thể sửa snapshot cho xanh — nhưng lúc đó là sửa tường minh, có vết).
 *
 * ⚠️ RANH GIỚI VỚI LỚP AI — ghi ra để không ai tưởng L1 phủ luôn phần đó. Gọi LLM ngoài
 * (`/ai/chat`, inline assist, eval) CŨNG là dữ liệu rời hạ tầng NHG, nhưng đường đó đã có sổ
 * vết riêng và cổng riêng: `ai_egress_policy` + PII scrub + `ai_interaction` (append-only).
 * Khai thêm `@Exported` ở đó là ghi vết HAI LẦN cho một dòng dữ liệu, và hai sổ lệch nhau thì
 * không sổ nào đáng tin. Việc gộp hai sổ (hoặc cho `export_log` tham chiếu `ai_interaction`)
 * thuộc lát soát 11 mục governance (L6), không phải lát này.
 */

/** Dấu hiệu "route này mang dữ liệu ra khỏi hệ thống" trong ĐƯỜNG DẪN. */
const EGRESS_HINTS: RegExp[] = [
  // 'export' ở BẤT KỲ đâu trong một segment — bắt cả `export-log`, `data-export`, `exports`.
  // Rộng có chủ đích: thà bắt oan một route rồi buộc người viết khai `@ExportExempt('lý do')`
  // (một dòng, có vết, Reviewer đọc được) hơn là để một route tên `.../csv-export-v2` lọt.
  /(^|\/)[a-z0-9_-]*export[a-z0-9_-]*(\/|$)/i,
  /(^|\/)download(s)?(\/|$)/i,
  /(^|\/)(csv|xlsx|pdf)(\/|$)/i,
  /\.(csv|xlsx|pdf)$/i,
  /(^|\/)files?(\/|$)/i,
  /(^|\/)(dispatch|push|sync)(\/|$)/i,
];

/**
 * Dấu hiệu dữ liệu VÀO — thắng mọi hint ở trên. Không có danh sách này thì
 * `POST /integrations/import/csv` (nạp CSV vào hệ) bị chặn oan, đúng loại "chặn oan đường
 * hợp lệ" mà kế hoạch trục C dặn phải tránh khi bật chặn.
 */
const INGRESS_MARKERS: RegExp[] = [/(^|\/)import(\/|$)/i, /(^|\/)upload(\/|$)/i];

export function looksLikeEgress(path: string): boolean {
  const p = String(path ?? '');
  if (INGRESS_MARKERS.some((r) => r.test(p))) return false;
  return EGRESS_HINTS.some((r) => r.test(p));
}

/** Đường dẫn route đã đăng ký (có global prefix), fallback về URL nếu Express chưa gắn route. */
export function routePathOf(req: {
  route?: { path?: string }; originalUrl?: string; url?: string;
}): string {
  return req.route?.path ?? String(req.originalUrl ?? req.url ?? '').split('?')[0];
}
