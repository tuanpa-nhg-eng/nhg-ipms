/**
 * [F181 — Reviewer đối kháng] `assertScope` là hàm gác dùng ở 9 call-site và VỪA BỊ SỬA
 * ở F175, nhưng không có lấy một unit test. Bộ này pin đúng ngữ nghĩa sau F175 để lần
 * sau ai đổi sẽ thấy đỏ ngay, thay vì phát hiện qua kiểm chứng sống như lần này.
 *
 * Ngữ nghĩa cần giữ: scope mô tả user với TỚI ĐÂU NGOÀI BẢN THÂN
 * (self < org_unit < tenant). Không vai nào mang nghĩa "cả phòng TRỪ chính mình".
 * Việc cấm tự-duyệt/tự-chấm là của các luật SoD tường minh ở service (F26/F30/F41),
 * KHÔNG phải của hàm này.
 */
import { ForbiddenException } from '@nestjs/common';
import { assertScope, effectiveScope, hasTenantScope } from '../../src/common/auth/scope.util';
import type { RequestUser } from '../../src/common/auth/decorators';

const ME = 'person-me';
const OTHER = 'person-other';
const UNIT_A = 'unit-a';
const UNIT_B = 'unit-b';

function user(
  scopes: Array<{ scopeType: string; scopeId?: string | null }>,
  personId: string | undefined = ME,
): RequestUser {
  return {
    claims: { sub: 'user-1', tid: 'tenant-1', email: 'x@y.z', person_id: personId } as RequestUser['claims'],
    tenantId: 'tenant-1',
    permissions: new Set<string>(),
    scopes: scopes.map((s) => ({
      scopeType: s.scopeType as 'tenant' | 'org_unit' | 'self',
      scopeId: s.scopeId ?? null,
    })),
  } as RequestUser;
}
const ok = (fn: () => void) => expect(fn).not.toThrow();
const denied = (fn: () => void) => expect(fn).toThrow(ForbiddenException);

describe('[F181] assertScope — ngữ nghĩa phạm vi sau F175', () => {
  describe('tenant', () => {
    it('qua mọi tài nguyên', () => {
      const u = user([{ scopeType: 'tenant' }]);
      ok(() => assertScope(u, { ownerPersonId: OTHER, orgUnitId: UNIT_B }, 'x'));
      ok(() => assertScope(u, { ownerPersonId: null, orgUnitId: null }, 'x'));
    });
  });

  describe('org_unit', () => {
    const u = user([{ scopeType: 'org_unit', scopeId: UNIT_A }]);

    it('qua tài nguyên thuộc đơn vị phụ trách', () => {
      ok(() => assertScope(u, { ownerPersonId: OTHER, orgUnitId: UNIT_A }, 'x'));
    });

    it('CHẶN tài nguyên của đơn vị khác', () => {
      denied(() => assertScope(u, { ownerPersonId: OTHER, orgUnitId: UNIT_B }, 'x'));
    });

    it('CHẶN khi tài nguyên không gắn đơn vị và không phải của mình', () => {
      denied(() => assertScope(u, { ownerPersonId: OTHER, orgUnitId: null }, 'x'));
    });

    // === trọng tâm F175 ===
    it('[F175] qua tài nguyên CỦA CHÍNH MÌNH dù vai KHÔNG có scope self', () => {
      // Đây chính là ca làm trưởng phòng không nộp được check-in của mình (403).
      ok(() => assertScope(u, { ownerPersonId: ME, orgUnitId: null }, 'checkin:goal-update'));
      ok(() => assertScope(u, { ownerPersonId: ME, orgUnitId: UNIT_B }, 'goal:progress'));
    });

    it('[F175] KHÔNG nới cho người khác — chỉ đúng chủ thể mới qua', () => {
      denied(() => assertScope(u, { ownerPersonId: OTHER, orgUnitId: UNIT_B }, 'x'));
    });

    it('[F175] ownerPersonId null thì nhánh "của chính mình" KHÔNG kích hoạt', () => {
      // Chi tiết thiết kế review manager/compute/finalize dựa vào: truyền null để
      // nhánh này không bao giờ chạy, đảm bảo SoD không bị lách qua đường scope.
      denied(() => assertScope(u, { ownerPersonId: null, orgUnitId: UNIT_B }, 'review:manager'));
    });

    it('[F175] user KHÔNG gắn person thì không thể "là chính mình"', () => {
      const anon = user([{ scopeType: 'org_unit', scopeId: UNIT_A }], undefined);
      denied(() => assertScope(anon, { ownerPersonId: OTHER, orgUnitId: UNIT_B }, 'x'));
      // và cũng không lọt khi ownerPersonId tình cờ undefined ở cả hai phía
      denied(() => assertScope(anon, { ownerPersonId: null, orgUnitId: UNIT_B }, 'x'));
    });
  });

  describe('self', () => {
    const u = user([{ scopeType: 'self' }]);
    it('qua tài nguyên của mình, CHẶN của người khác', () => {
      ok(() => assertScope(u, { ownerPersonId: ME, orgUnitId: null }, 'x'));
      denied(() => assertScope(u, { ownerPersonId: OTHER, orgUnitId: UNIT_A }, 'x'));
    });
  });

  describe('[F33] fail-closed', () => {
    it('không có scope nào ⇒ chặn tất cả (kể cả tài nguyên không chủ)', () => {
      const u = user([]);
      denied(() => assertScope(u, { ownerPersonId: OTHER, orgUnitId: UNIT_A }, 'x'));
      denied(() => assertScope(u, { ownerPersonId: null, orgUnitId: null }, 'x'));
    });

    it('scopeType lạ KHÔNG được coi là tenant', () => {
      const u = user([{ scopeType: 'god_mode' }]);
      expect(hasTenantScope(u.scopes)).toBe(false);
      denied(() => assertScope(u, { ownerPersonId: OTHER, orgUnitId: UNIT_A }, 'x'));
    });

    it('org_unit thiếu scopeId không khớp gì', () => {
      const u = user([{ scopeType: 'org_unit', scopeId: null }]);
      denied(() => assertScope(u, { ownerPersonId: OTHER, orgUnitId: UNIT_A }, 'x'));
    });
  });

  describe('effectiveScope', () => {
    it('tenant thắng mọi scope hẹp hơn', () => {
      const s = effectiveScope(user([{ scopeType: 'self' }, { scopeType: 'tenant' }]));
      expect(s.mode).toBe('tenant');
    });

    it('gom nhiều org_unit; selfPersonId chỉ có khi vai thật sự mang scope self', () => {
      const withSelf = effectiveScope(user([
        { scopeType: 'org_unit', scopeId: UNIT_A },
        { scopeType: 'org_unit', scopeId: UNIT_B },
        { scopeType: 'self' },
      ]));
      expect(withSelf.mode).toBe('scoped');
      expect(withSelf.orgUnitIds.sort()).toEqual([UNIT_A, UNIT_B].sort());
      expect(withSelf.selfPersonId).toBe(ME);

      const noSelf = effectiveScope(user([{ scopeType: 'org_unit', scopeId: UNIT_A }]));
      expect(noSelf.selfPersonId).toBeNull();
    });
  });
});
