/**
 * Cedar engine (#2 Policy-as-Code) — pure functions, không phụ thuộc DB/Nest.
 *
 * NGỮ NGHĨA (Spec Config Studio §7): RBAC (role→permission) VẪN là tầng quyết định allow;
 * tầng policy là GUARDRAIL phủ thêm ABAC — chỉ THU HẸP quyền, không mở rộng:
 * - Bộ policy được đánh giá cùng một baseline `permit(principal, action, resource)`
 *   đại diện cho "RBAC đã cho phép" ⇒ decision=deny ⟺ có forbid khớp (forbid overrides permit
 *   là bất biến của Cedar). Policy `permit` do tenant viết vô hại (không thêm quyền).
 * - FAIL-CLOSED: engine trả failure, hoặc BẤT KỲ policy nào lỗi eval (Cedar mặc định
 *   error-and-skip — bị coi là không tồn tại) ⇒ deny. Không đoán ý một policy hỏng.
 *
 * Request shape cố định (tất định, không phụ thuộc giờ/random):
 *   principal  Ipms::User::"<app_user.id>"  attrs {email, permissions, scopeTypes, personId}
 *   action     Ipms::Action::"<permission>" (vd 'kpi:approve')
 *   resource   Ipms::Module::"<module>"     (prefix permission, vd 'kpi')
 *   context    {permission, method, path}
 */
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';

export interface PolicyRow {
  id: string;
  name: string;
  policyText: string;
}

export interface PrincipalAttrs {
  email: string;
  permissions: string[];
  scopeTypes: string[];
  personId: string;
}

export interface AccessRequest {
  principalId: string;
  principalAttrs: PrincipalAttrs;
  action: string; // permission code đang yêu cầu
  context: Record<string, string>;
}

export interface AccessDecision {
  decision: 'allow' | 'deny';
  /** id các access_policy forbid đã khớp (explainable — map thẳng về row DB). */
  deniedBy: string[];
  /** lỗi eval per-policy — có lỗi nào ⇒ decision đã là deny (fail-closed). */
  errors: Array<{ policyId: string; message: string }>;
}

/** Id nội bộ của baseline permit — không bao giờ lộ ra deniedBy. */
const BASELINE_ID = '__rbac_baseline__';
const BASELINE_POLICY = 'permit(principal, action, resource);';

export function moduleOf(permission: string): string {
  return permission.split(':')[0] || permission;
}

/** Policy có áp cho action này không (scope null = mọi action; 'kpi' ⇒ 'kpi' | 'kpi:*'). */
export function scopeApplies(scope: string | null | undefined, action: string): boolean {
  if (!scope) return true;
  return action === scope || action.startsWith(`${scope}:`) || moduleOf(action) === scope;
}

/**
 * Validate policy text khi nhập (fail tại cửa, không đợi runtime):
 * - parse được theo cú pháp Cedar;
 * - đúng MỘT static policy (không template, không nhét nhiều policy vào một row —
 *   giữ ánh xạ 1 row DB = 1 policy id trong diagnostics).
 */
export function checkPolicyText(policyText: string): { ok: boolean; errors: string[] } {
  const parts = cedar.policySetTextToParts(policyText);
  if (parts.type === 'failure') {
    return { ok: false, errors: parts.errors.map((e) => e.message) };
  }
  if (parts.policy_templates.length > 0) {
    return { ok: false, errors: ['Template không được hỗ trợ — chỉ static policy'] };
  }
  if (parts.policies.length !== 1) {
    return { ok: false, errors: [`Mỗi access_policy chứa đúng 1 policy (nhận ${parts.policies.length})`] };
  }
  return { ok: true, errors: [] };
}

/** Đánh giá bộ policy trên một request — fail-closed toàn tập. */
export function decideAccess(policies: PolicyRow[], req: AccessRequest): AccessDecision {
  if (policies.length === 0) return { decision: 'allow', deniedBy: [], errors: [] };

  const staticPolicies: Record<string, string> = { [BASELINE_ID]: BASELINE_POLICY };
  for (const p of policies) staticPolicies[p.id] = p.policyText;

  let answer: cedar.AuthorizationAnswer;
  try {
    answer = cedar.isAuthorized({
      principal: { type: 'Ipms::User', id: req.principalId },
      action: { type: 'Ipms::Action', id: req.action },
      resource: { type: 'Ipms::Module', id: moduleOf(req.action) },
      context: req.context,
      policies: { staticPolicies },
      entities: [
        {
          uid: { type: 'Ipms::User', id: req.principalId },
          attrs: {
            email: req.principalAttrs.email,
            permissions: req.principalAttrs.permissions,
            scopeTypes: req.principalAttrs.scopeTypes,
            personId: req.principalAttrs.personId,
          },
          parents: [],
        },
      ],
    });
  } catch (e) {
    // wasm ném exception (input dị dạng) — fail-closed
    return { decision: 'deny', deniedBy: [], errors: [{ policyId: '*', message: (e as Error).message }] };
  }

  if (answer.type !== 'success') {
    return {
      decision: 'deny', deniedBy: [],
      errors: answer.errors.map((e) => ({ policyId: '*', message: e.message })),
    };
  }

  const diag = answer.response.diagnostics;
  // Cedar "error-and-skip": policy lỗi eval bị bỏ qua khỏi quyết định — với guardrail
  // điều đó nghĩa là một forbid có thể âm thầm biến mất ⇒ FAIL-CLOSED: deny.
  if (diag.errors.length > 0) {
    return {
      decision: 'deny', deniedBy: [],
      errors: diag.errors.map((e) => ({ policyId: e.policyId, message: e.error.message })),
    };
  }

  if (answer.response.decision === 'deny') {
    return {
      decision: 'deny',
      deniedBy: diag.reason.filter((id) => id !== BASELINE_ID),
      errors: [],
    };
  }
  return { decision: 'allow', deniedBy: [], errors: [] };
}

/** Test case allow/deny gắn với một policy (chạy được trong CI — chống hồi quy phân quyền). */
export interface PolicyTestCase {
  name: string;
  action: string;
  expect: 'allow' | 'deny';
  principal?: { id?: string; attrs?: Partial<PrincipalAttrs> };
  context?: Record<string, string>;
}

export interface PolicyTestResult {
  name: string;
  passed: boolean;
  expected: 'allow' | 'deny';
  actual: 'allow' | 'deny';
  errors: Array<{ policyId: string; message: string }>;
}

/** Chạy bộ test trên MỘT policy (cô lập với baseline permit — đúng ngữ nghĩa guardrail). */
export function runPolicyTests(policy: PolicyRow, tests: PolicyTestCase[]): {
  passed: boolean;
  results: PolicyTestResult[];
} {
  const results = tests.map((t) => {
    const decision = decideAccess([policy], {
      principalId: t.principal?.id ?? 'test-user',
      principalAttrs: {
        email: t.principal?.attrs?.email ?? 'test@tenant.local',
        permissions: t.principal?.attrs?.permissions ?? [t.action],
        scopeTypes: t.principal?.attrs?.scopeTypes ?? ['tenant'],
        personId: t.principal?.attrs?.personId ?? '',
      },
      action: t.action,
      context: { permission: t.action, method: 'TEST', path: '', ...(t.context ?? {}) },
    });
    return {
      name: t.name,
      passed: decision.decision === t.expect,
      expected: t.expect,
      actual: decision.decision,
      errors: decision.errors,
    };
  });
  return { passed: results.every((r) => r.passed), results };
}
