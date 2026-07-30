import { PrismaClient, uuidv7 } from '@ipms/db';

/**
 * [Trục C L1] Cấp một quyền BỔ SUNG cho đúng một người, bằng một vai riêng TRONG tenant.
 *
 * Vì sao test cần cái này: `export:confidential` cố ý KHÔNG nằm trong bộ mặc định của bất kỳ
 * vai toàn cục nào (kế hoạch trục C §4 L1). Nghĩa là "hrbp xuất được sang OneOffice" không
 * còn là hệ quả của việc mang vai hrbp — phải có người CẤP TƯỜNG MINH. Helper này mô phỏng
 * đúng động tác đó, không phải lách nó: nó tạo vai tenant-scoped rồi gán, đúng đường mà màn
 * Người dùng & Vai trò (trục B L2) dùng.
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
