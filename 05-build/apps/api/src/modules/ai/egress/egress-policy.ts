/**
 * [Last-mile Lát 2] Egress Policy Engine — pure function, KHÔNG DB.
 * Quyết định 1 request LLM có được RỜI gateway tới `destination` hay không, dựa
 * trên phân loại dữ liệu `dataClass` (AI-Native PRD §9 Responsible AI).
 *
 * Bất biến CỨNG (không tenant nào override được — self-host CHƯA triển khai trong
 * hệ thống, nên KHÔNG có đích hợp lệ nào cho dữ liệu nhạy cảm ngoài mock):
 *   dataClass ∈ {confidential, pii} + destination ≠ mock  ⇒  LUÔN CHẶN.
 * Đây là lớp bảo vệ THỨ HAI, cắt ngang, độc lập với cờ `ai_gateway_live` (lớp thứ
 * nhất) — dù cờ bật + có key, dữ liệu nhạy cảm vẫn không rời máy.
 *
 * public/internal: mặc định CHO PHÉP (cổng flag+key của selectLlmBackend đã gác
 * vòng ngoài); tenant có thể CHẶN THÊM qua policy tường minh (thu hẹp, không mở rộng).
 */

export type DataClass = 'public' | 'internal' | 'confidential' | 'pii';
export type EgressDestination = 'mock' | 'anthropic' | 'self_host';

export interface EgressPolicyRow {
  dataClass: string;
  destination: string;
  allowed: boolean;
}

export interface EgressDecision {
  allowed: boolean;
  reason: string;
}

const SENSITIVE: ReadonlySet<DataClass> = new Set(['confidential', 'pii']);

export function resolveEgress(
  dataClass: DataClass,
  destination: EgressDestination,
  tenantPolicies: EgressPolicyRow[] = [],
): EgressDecision {
  if (destination === 'mock') {
    return { allowed: true, reason: 'mock không rời máy — luôn cho phép, 0 chi phí' };
  }
  if (SENSITIVE.has(dataClass)) {
    return {
      allowed: false,
      reason: `dữ liệu phân loại '${dataClass}' chỉ được phép egress qua self-host — CHƯA triển khai trong hệ thống, chặn cứng tới '${destination}' (không tenant nào override được)`,
    };
  }
  const override = tenantPolicies.find((p) => p.dataClass === dataClass && p.destination === destination);
  if (override) {
    return {
      allowed: override.allowed,
      reason: override.allowed
        ? `tenant cho phép tường minh (${dataClass} → ${destination})`
        : `tenant CHẶN tường minh (${dataClass} → ${destination})`,
    };
  }
  return {
    allowed: true,
    reason: `mặc định cho phép — '${dataClass}' đã qua cổng ai_gateway_live+key, chưa có policy tenant thu hẹp`,
  };
}

export const DATA_CLASSES: DataClass[] = ['public', 'internal', 'confidential', 'pii'];
export const EGRESS_DESTINATIONS: EgressDestination[] = ['mock', 'anthropic', 'self_host'];
