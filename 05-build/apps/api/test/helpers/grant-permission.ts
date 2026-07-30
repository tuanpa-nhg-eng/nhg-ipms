import { PrismaClient, uuidv7 } from '@ipms/db';

/**
 * [Trục C L1] Cấp một quyền BỔ SUNG cho đúng một người, bằng một vai riêng TRONG tenant.
 *
 * Vì sao test cần cái này: `export:confidential` cố ý KHÔNG nằm trong bộ mặc định của bất kỳ
 * vai NGHIỆP VỤ nào (kế hoạch trục C §4 L1). Nghĩa là "hrbp xuất được sang OneOffice" không
 * còn là hệ quả của việc mang vai hrbp — phải có người CẤP TƯỜNG MINH.
 *
 * ⚠️ Đây là đường TẮT dùng cho spec nào KHÔNG kiểm chính việc cấp quyền (vd `review-loop.spec`
 * chỉ cần vòng đánh giá chạy trọn tới bước xuất). Đường SẢN PHẨM thật là gán vai
 * `export_officer` qua `POST /admin/users/:id/roles` — `export-control.spec` dùng đúng đường
 * đó, vì nếu quyết định "B1 cấp cho 1–2 người" chỉ test được bằng sửa DB thì nó không thực
 * hiện được trên giao diện. Đừng dùng helper này để "chứng minh" luồng cấp quyền chạy.
 *
 * Vai tạo ra mang `tenantId` khác NULL nên KHÔNG lọt vào snapshot `rbac-matrix.spec` (test đó
 * chỉ soi vai toàn cục) — không có chuyện test này làm test kia đỏ theo.
 *
 * Trả về hàm hoàn nguyên. GỌI TRONG `afterAll`: bài học trục B ③ — đăng ký bước hoàn nguyên
 * TRƯỚC khi thao tác, để một assert đỏ giữa chừng không để lại quyền thừa trong DB dùng chung.
 */
export async function grantExtraPermission(
  owner: PrismaClient,
  tenantId: string,
  appUserId: string,
  permissionCode: string,
): Promise<() => Promise<void>> {
  const perm = await owner.permission.findFirst({ where: { code: permissionCode } });
  if (!perm) throw new Error(`Permission '${permissionCode}' chưa có trong catalog — seed lại DB`);

  const roleCode = `test_grant_${permissionCode.replace(/[^a-z]/gi, '_')}_${Date.now()}`;
  const role = await owner.role.create({
    data: { id: uuidv7(), tenantId, code: roleCode, nameVi: `Cấp tạm ${permissionCode} (test)` },
  });
  await owner.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
  const userRole = await owner.userRole.create({
    data: { id: uuidv7(), tenantId, appUserId, roleId: role.id, scopeType: 'tenant' },
  });

  return async () => {
    await owner.userRole.delete({ where: { id: userRole.id } }).catch(() => {});
    await owner.rolePermission.deleteMany({ where: { roleId: role.id } }).catch(() => {});
    await owner.role.delete({ where: { id: role.id } }).catch(() => {});
  };
}
