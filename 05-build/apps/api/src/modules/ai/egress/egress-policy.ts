import {
  DATA_CLASSIFICATIONS, DataClassification, isSensitiveClass, normalizeDataClass,
} from '@ipms/shared';

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

// [Trục C L0] Vựng chuẩn về một mối: 4 mức của Strategic Context §7. `pii` là bí danh
// TƯƠNG THÍCH NGƯỢC cho các bản ghi ai_egress_policy đã tồn tại — chuẩn hoá tại cửa bằng
// normalizeDataClass(), KHÔNG để hai vựng sống song song trong logic.
export type DataClass = DataClassification | 'pii';
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

// Nhạy cảm = rank >= confidential. Suy từ thang dùng chung, không liệt kê tay lần thứ hai
// (liệt kê tay là chỗ mức mới thêm vào sẽ bị bỏ quên).
function isSensitive(raw: string): boolean {
  const c = normalizeDataClass(raw);
  return c === null ? true : isSensitiveClass(c);   // giá trị lạ ⇒ coi như nhạy cảm (fail-closed)
}

export function resolveEgress(
  dataClass: DataClass,
  destination: EgressDestination,
  tenantPolicies: EgressPolicyRow[] = [],
): EgressDecision {
  if (destination === 'mock') {
    return { allowed: true, reason: 'mock không rời máy — luôn cho phép, 0 chi phí' };
  }
  if (isSensitive(dataClass)) {
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

export const DATA_CLASSES: DataClass[] = [...DATA_CLASSIFICATIONS, 'pii'];
export const EGRESS_DESTINATIONS: EgressDestination[] = ['mock', 'anthropic', 'self_host'];
