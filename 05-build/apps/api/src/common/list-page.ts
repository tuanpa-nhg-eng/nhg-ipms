/**
 * [F197 — Reviewer 05/08] Hình dạng chuẩn cho MỌI danh sách có trần trang.
 *
 * Lý do tồn tại tệp này: cùng một lỗi đã xuất hiện **bốn lần** trong dự án, và cả bốn lần đều
 * là một trường tên `total` thực chất chứa `rows.length` — tức số dòng của TRANG, không phải
 * tổng số dòng có thật.
 *
 *   · L4 — so độ dài danh sách cờ rủi ro (trần 100) trong khi DB có 744 dòng ⇒ driver báo đỏ
 *     một tính năng đang chạy đúng.
 *   · L6 — `GET /export-log` báo `total` đứng yên ở 200 vĩnh viễn.
 *   · L7 — đội đỏ đo trước/sau mà không chốt mốc.
 *   · 05/08 — Reviewer tìm thấy ba chỗ nữa: cờ rủi ro, đơn ngoại lệ, lượt chạy lưu trữ.
 *
 * Đây là loại sai lệch không ai kiểm chứng lại: con số nhỏ hơn sự thật, trông hợp lý, và
 * **nghiêng về hướng trấn an** — "chỉ có 100 cờ rủi ro" thì không ai đi tìm cờ thứ 101.
 *
 * Cách chặn không phải là nhắc nhau cẩn thận hơn, mà là làm cho việc trả sai trở nên khó viết:
 * `pagedList` ĐÒI một tham số `total` riêng, tự suy ra `returned` từ chính mảng, và tự đặt cờ
 * `capped` khi hai con số lệch nhau. Muốn viết sai thì phải cố tình truyền `entries.length` vào
 * chỗ `total` — một hành vi nhìn thấy được khi rà mã, khác hẳn việc quên.
 */

/** Trần mặc định cho một trang danh sách quản trị. */
export const LIST_PAGE_CAP = 200;

export interface PagedList<T> {
  entries: T[];
  /** Tổng số dòng THẬT khớp điều kiện lọc — luôn đến từ một phép `count()` riêng. */
  total: number;
  /** Số dòng thực sự trả về trong phản hồi này. */
  returned: number;
  /** `true` khi còn dòng nằm ngoài trang này — người đọc biết con số trước mắt chưa đủ. */
  capped: boolean;
}

/**
 * Gói một trang kết quả. `total` PHẢI là kết quả của một phép đếm riêng trên cùng điều kiện
 * lọc — không bao giờ là `entries.length`.
 */
export function pagedList<T>(entries: T[], total: number): PagedList<T> {
  return { entries, total, returned: entries.length, capped: total > entries.length };
}
