/**
 * Unit Phase 3 lát 4c — Cedar engine (#2 Policy-as-Code): ngữ nghĩa guardrail
 * (baseline RBAC permit + forbid thu hẹp), fail-closed khi lỗi eval, validate policy text,
 * test harness allow/deny, tất định.
 */
import {
  checkPolicyText, decideAccess, moduleOf, PolicyRow, runPolicyTests, scopeApplies,
} from '../../src/modules/policy/cedar.engine';

const reqFor = (action: string, over: Partial<{
  email: string; permissions: string[]; scopeTypes: string[]; personId: string;
  context: Record<string, string>;
}> = {}) => ({
  principalId: 'u-1',
  principalAttrs: {
    email: over.email ?? 'emp1@h01.nhg.local',
    permissions: over.permissions ?? [action],
    scopeTypes: over.scopeTypes ?? ['self'],
    personId: over.personId ?? 'p-1',
  },
  action,
  context: { permission: action, method: 'GET', path: '/api/v1/kpis', ...(over.context ?? {}) },
});

const pol = (id: string, policyText: string): PolicyRow => ({ id, name: id, policyText });

describe('cedar.engine — decideAccess (guardrail semantics)', () => {
  it('không có policy → allow (RBAC quyết định nền)', () => {
    expect(decideAccess([], reqFor('kpi:read')).decision).toBe('allow');
  });

  it('forbid khớp context.permission + email → deny, deniedBy đúng id (explainable)', () => {
    const p = pol('pol-a',
      'forbid(principal, action, resource) when { context.permission == "kpi:read" && principal.email == "emp1@h01.nhg.local" };');
    const d = decideAccess([p], reqFor('kpi:read'));
    expect(d.decision).toBe('deny');
    expect(d.deniedBy).toEqual(['pol-a']);
    expect(d.errors).toEqual([]);
  });

  it('forbid không khớp (email khác / action khác) → allow', () => {
    const p = pol('pol-a',
      'forbid(principal, action, resource) when { context.permission == "kpi:read" && principal.email == "emp1@h01.nhg.local" };');
    expect(decideAccess([p], reqFor('kpi:read', { email: 'admin@h01.nhg.local' })).decision).toBe('allow');
    expect(decideAccess([p], reqFor('kpi:write')).decision).toBe('allow');
  });

  it('điều kiện ABAC theo attrs: chặn scope self đụng calibration', () => {
    const p = pol('pol-scope',
      'forbid(principal, action, resource) when { context.permission == "calibration:run" && principal.scopeTypes.contains("self") };');
    expect(decideAccess([p], reqFor('calibration:run', { scopeTypes: ['self'] })).decision).toBe('deny');
    expect(decideAccess([p], reqFor('calibration:run', { scopeTypes: ['tenant'] })).decision).toBe('allow');
  });

  it('policy permit của tenant KHÔNG mở rộng quyền (vô hại trên baseline)', () => {
    const p = pol('pol-permit', 'permit(principal, action, resource);');
    expect(decideAccess([p], reqFor('kpi:read')).decision).toBe('allow');
  });

  it('FAIL-CLOSED: policy lỗi eval (attr không tồn tại) → deny kèm errors', () => {
    const p = pol('pol-err',
      'forbid(principal, action, resource) when { principal.notThere == "x" };');
    const d = decideAccess([p], reqFor('kpi:read'));
    expect(d.decision).toBe('deny');
    expect(d.deniedBy).toEqual([]);
    expect(d.errors[0].policyId).toBe('pol-err');
  });

  it('nhiều policy: 1 forbid khớp là đủ deny; deniedBy chỉ chứa policy khớp', () => {
    const a = pol('pol-a', 'forbid(principal, action, resource) when { context.permission == "kpi:read" };');
    const b = pol('pol-b', 'forbid(principal, action, resource) when { context.permission == "kpi:write" };');
    const d = decideAccess([a, b], reqFor('kpi:read'));
    expect(d.decision).toBe('deny');
    expect(d.deniedBy).toEqual(['pol-a']);
  });

  it('tất định: cùng input 2 lần → cùng output', () => {
    const p = pol('pol-a', 'forbid(principal, action, resource) when { context.permission == "kpi:read" };');
    const r1 = decideAccess([p], reqFor('kpi:read'));
    const r2 = decideAccess([p], reqFor('kpi:read'));
    expect(r2).toEqual(r1);
  });
});

describe('cedar.engine — checkPolicyText', () => {
  it('cú pháp hỏng → fail kèm message', () => {
    const r = checkPolicyText('forbid(principal, action, resource) when { bad syntax');
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('nhét 2 policy vào 1 row → fail (giữ ánh xạ 1 row = 1 policy id)', () => {
    const r = checkPolicyText('permit(principal, action, resource); forbid(principal, action, resource);');
    expect(r.ok).toBe(false);
  });

  it('template → fail (chỉ static policy)', () => {
    const r = checkPolicyText('permit(principal == ?principal, action, resource);');
    expect(r.ok).toBe(false);
  });

  it('policy hợp lệ → ok', () => {
    expect(checkPolicyText(
      'forbid(principal, action, resource) when { principal.email like "*@test.local" };',
    ).ok).toBe(true);
  });
});

describe('cedar.engine — runPolicyTests (chống hồi quy phân quyền)', () => {
  const guard = pol('pol-g',
    'forbid(principal, action, resource) when { context.permission == "rating:approve" && principal.scopeTypes.contains("self") };');

  it('bộ test allow/deny đúng → passed', () => {
    const out = runPolicyTests(guard, [
      { name: 'self bị chặn approve', action: 'rating:approve', expect: 'deny',
        principal: { attrs: { scopeTypes: ['self'] } } },
      { name: 'tenant scope được approve', action: 'rating:approve', expect: 'allow',
        principal: { attrs: { scopeTypes: ['tenant'] } } },
      { name: 'action khác không bị đụng', action: 'kpi:read', expect: 'allow' },
    ]);
    expect(out.passed).toBe(true);
    expect(out.results).toHaveLength(3);
  });

  it('kỳ vọng sai → passed=false, chỉ đúng case fail', () => {
    const out = runPolicyTests(guard, [
      { name: 'sai kỳ vọng', action: 'rating:approve', expect: 'allow',
        principal: { attrs: { scopeTypes: ['self'] } } },
    ]);
    expect(out.passed).toBe(false);
    expect(out.results[0].actual).toBe('deny');
  });

  it('policy lỗi eval lộ ra qua errors trong kết quả test', () => {
    const broken = pol('pol-err', 'forbid(principal, action, resource) when { principal.zzz == "x" };');
    const out = runPolicyTests(broken, [{ name: 'x', action: 'kpi:read', expect: 'deny' }]);
    expect(out.results[0].errors.length).toBeGreaterThan(0);
  });
});

describe('cedar.engine — scopeApplies/moduleOf', () => {
  it.each([
    [null, 'kpi:read', true],
    ['kpi', 'kpi:read', true],
    ['kpi', 'kpi', true],
    ['kpi', 'scorecard:read', false],
    ['config', 'config:publish', true],
    ['integration', 'integration:run', true],
  ])('scope %s vs action %s → %s', (scope, action, expected) => {
    expect(scopeApplies(scope as string | null, action as string)).toBe(expected);
  });

  it('moduleOf lấy prefix permission', () => {
    expect(moduleOf('kpi:read')).toBe('kpi');
    expect(moduleOf('health')).toBe('health');
  });
});
