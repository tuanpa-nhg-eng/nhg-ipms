/**
 * [Trục C L3 — K4] Mệnh đề "vai còn hiệu lực" — MỘT định nghĩa cho cả hệ.
 *
 * Vì sao tách file thay vì viết `OR: [...]` tại chỗ: có bảy chỗ trong API đọc `user_role` để
 * suy ra quyền của một người (guard, đóng vai, SoD lúc gán vai, effective-access, /me/access,
 * cổng uỷ quyền soạn thảo, vòng lặp tác vụ). Cột `expires_at` mới thêm mà chỉ nhớ ở sáu chỗ
 * thì chỗ thứ bảy hoặc chặn oan, hoặc — tệ hơn — coi một vai đã hết hạn là còn hiệu lực. Đây
 * đúng loại nợ đã ghi ở L0 với `PERMISSIONS` bị chép tay sang `seed.ts`; không lặp lại nó
 * ngay trong lát tạo ra cột này.
 *
 * Là HÀM chứ không phải hằng số: `new Date()` phải tính lúc gọi. Một hằng số module-level sẽ
 * đóng băng mốc thời gian tại lần import đầu tiên — trong một tiến trình sống nhiều giờ, đó
 * là một ngoại lệ 72 giờ không bao giờ hết hạn.
 */
export const activeUserRoleWhere = () => ({
  deletedAt: null,
  role: { deletedAt: null },
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

/** Chỉ phần thời hạn — cho chỗ đã tự có điều kiện `deletedAt`/`role` riêng. */
export const notExpiredWhere = () => ({
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});
