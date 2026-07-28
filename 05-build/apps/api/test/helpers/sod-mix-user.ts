/**
 * [Trục B L0] Người dùng bị cấp NHẦM cả `config:write` lẫn `config:publish`.
 *
 * Trước trục B, các ca kiểm thử SoD runtime mượn `tenant_admin` vì god-account tình cờ giữ
 * cả hai quyền. Sau L0 không role toàn cục nào giữ cả hai (J2) — nhưng SoD runtime vẫn phải
 * được kiểm, vì đúng thứ nó sinh ra để chặn là tenant TỰ cấu hình sai: gán cho một người hai
 * vai lẽ ra phải tách. Helper này dựng đúng tình huống đó, thay vì ăn theo god-account.
 *
 * Idempotent — gọi lại nhiều lần (nhiều spec, nhiều lần chạy) đều an toàn.
 */
import * as jwt from 'jsonwebtoken';
import { PrismaClient, uuidv7 } from '@ipms/db';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

export interface SodMixCtx {
  id: string;        // tenantId
  token: string;
  userId: string;
  personId: string;
  email: string;
}

/**
 * Dựng (idempotent) một người dùng giữ ĐỒNG THỜI các vai truyền vào — dùng cho mọi ca kiểm
 * thử SoD runtime từng mượn god-account. `key` phân biệt các fixture khác nhau (mỗi cặp vai
 * một người riêng, để spec này không thấy quyền của spec kia).
 */
export async function ensureMultiRoleUser(
  owner: PrismaClient,
  tenantId: string,
  roles: string[],
  key: string,
  tenantCode = 'H.01',
): Promise<SodMixCtx> {
  const employeeCode = `${tenantCode}-${key.toUpperCase()}`;
  const email = `${key.toLowerCase()}@${tenantCode.toLowerCase().replace('.', '')}.nhg.local`;
  return ensureUser(owner, tenantId, roles, employeeCode, email);
}

/** Cặp mặc định của Configuration Studio: config:write ⟂ config:publish. */
export async function ensureSodMixUser(
  owner: PrismaClient,
  tenantId: string,
  tenantCode = 'H.01',
): Promise<SodMixCtx> {
  return ensureMultiRoleUser(
    owner, tenantId, ['config_designer', 'config_approver'], 'sodmix', tenantCode,
  );
}

async function ensureUser(
  owner: PrismaClient,
  tenantId: string,
  roles: string[],
  employeeCode: string,
  email: string,
): Promise<SodMixCtx> {

  const person = await owner.person.upsert({
    where: { tenantId_employeeCode: { tenantId, employeeCode } },
    update: {},
    create: {
      id: uuidv7(), tenantId, employeeCode,
      fullName: 'Người được cấp NHẦM cả 2 vai (fixture SoD)',
      email, status: 'active',
    },
  });

  const user = await owner.appUser.upsert({
    where: { tenantId_email: { tenantId, email } },
    update: {},
    create: { id: uuidv7(), tenantId, personId: person.id, email, status: 'active' },
  });

  for (const code of roles) {
    const role = await owner.role.findFirst({ where: { code, tenantId: null } });
    if (!role) throw new Error(`Role ${code} chưa seed — chạy pnpm db:seed`);
    const existing = await owner.userRole.findFirst({
      where: { tenantId, appUserId: user.id, roleId: role.id },
    });
    if (!existing) {
      await owner.userRole.create({
        data: {
          id: uuidv7(), tenantId, appUserId: user.id,
          roleId: role.id, scopeType: 'tenant',
        },
      });
    }
  }

  const token = jwt.sign(
    { sub: user.id, tid: tenantId, email, person_id: person.id },
    getJwtSecret(), { expiresIn: '1h' },
  );
  return { id: tenantId, token, userId: user.id, personId: person.id, email };
}
