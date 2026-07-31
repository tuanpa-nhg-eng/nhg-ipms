/**
 * Unit [Trục C L4 — K8] Danh mục luật sinh cờ rủi ro.
 *
 * Đóng đinh ở tầng này vì đây là DANH MỤC RỦI RO của cả hệ — thứ B5 sẽ rà từng dòng. Một ca
 * integration chỉ chạm được vài loại cờ có sự kiện thật trong DB test; những dòng còn lại chỉ
 * có chỗ này canh.
 */
import {
  RISK_RULES_BY_AUDIT_ACTION, RISK_RULE_AI_EGRESS_BLOCKED, RISK_KINDS,
  INCIDENT_STATUSES, INCIDENT_ROOT_CAUSE_MIN_LEN, incidentStatusRank,
} from '@ipms/shared';

describe('[Trục C L4 — K8] Luật sinh cờ rủi ro', () => {
  it('phủ đủ SÁU nhóm nguồn mà kế hoạch §4 L4 nêu đích danh', () => {
    // Kế hoạch liệt kê: chính sách từ chối · xuất dữ liệu bị chặn · vi phạm SoD · AI bị chặn
    // egress · dùng ngoại lệ · đăng nhập bất thường. Năm nhóm đầu có nguồn thật; nhóm thứ sáu
    // KHÔNG có (hệ chưa theo dõi phiên đăng nhập — xem ghi chú ở ca dưới).
    const kinds = new Set(RISK_KINDS);
    for (const k of [
      'policy_denied', 'export_blocked', 'sod_violation', 'ai_egress_blocked', 'exception_used',
    ]) {
      expect(kinds.has(k)).toBe(true);
    }
  });

  /**
   * [Khoảng cách có chủ đích, đã báo] "Đăng nhập bất thường" KHÔNG có cờ, vì hệ chưa có nguồn:
   * `/auth/dev-token` phát token không ghi phiên, và đăng nhập thật sẽ do Entra ID đảm nhiệm
   * (ngoài phạm vi trục này). Bịa một cờ không có nguồn sẽ tạo ra một nhóm vĩnh viễn bằng 0
   * trên dashboard — trông như "an toàn" trong khi thực ra là "không đo".
   */
  it('KHÔNG có cờ đăng nhập bất thường — vì chưa có nguồn, không bịa nhóm rỗng', () => {
    expect(RISK_KINDS.some((k) => k.includes('login'))).toBe(false);
  });

  it('mọi luật có mức hợp lệ và nhãn tiếng Việt không rỗng', () => {
    const all = [...Object.values(RISK_RULES_BY_AUDIT_ACTION), RISK_RULE_AI_EGRESS_BLOCKED];
    for (const r of all) {
      expect(['low', 'medium', 'high']).toContain(r.severity);
      expect(r.label.trim().length).toBeGreaterThan(3);
      expect(r.kind).toMatch(/^[a-z_]+$/);
    }
    expect(all.length).toBeGreaterThan(8);
  });

  /**
   * Thang mức độ phải NHẤT QUÁN, không phải cảm tính từng dòng: `high` dành cho việc có người
   * chạm vào tường bảo vệ dữ liệu (mang dữ liệu ra ngoài, gửi ra LLM ngoài, leo thang quyền).
   */
  it('mức `high` chỉ dành cho nhóm chạm tường bảo vệ dữ liệu', () => {
    const high = [...Object.values(RISK_RULES_BY_AUDIT_ACTION), RISK_RULE_AI_EGRESS_BLOCKED]
      .filter((r) => r.severity === 'high').map((r) => r.kind).sort();
    expect([...new Set(high)]).toEqual([
      'ai_egress_blocked', 'export_blocked', 'impersonation_blocked', 'privilege_escalation_blocked',
    ]);
  });

  it('dùng ngoại lệ đã duyệt là `low` — hợp lệ, chỉ cần đếm để thấy xu hướng', () => {
    expect(RISK_RULES_BY_AUDIT_ACTION['policy.exception_used'].severity).toBe('low');
  });

  it('mọi khoá là một `audit_log.action` thật (có dấu chấm, không có khoảng trắng)', () => {
    for (const a of Object.keys(RISK_RULES_BY_AUDIT_ACTION)) {
      expect(a).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });
});

describe('[Trục C L4] Vòng đời sự cố', () => {
  it('bốn trạng thái, đúng thứ tự một chiều', () => {
    expect([...INCIDENT_STATUSES]).toEqual(['open', 'investigating', 'remediating', 'closed']);
    expect(incidentStatusRank('open')).toBeLessThan(incidentStatusRank('investigating'));
    expect(incidentStatusRank('remediating')).toBeLessThan(incidentStatusRank('closed'));
  });

  it('trạng thái lạ không tụt xuống dưới 0 (fail-safe khi DB có giá trị ngoài danh mục)', () => {
    expect(incidentStatusRank('khong_ton_tai')).toBe(0);
  });

  it('ngưỡng nguyên nhân gốc đủ dài để loại "đã xong"', () => {
    expect(INCIDENT_ROOT_CAUSE_MIN_LEN).toBeGreaterThanOrEqual(20);
    expect('đã xong'.length).toBeLessThan(INCIDENT_ROOT_CAUSE_MIN_LEN);
  });
});
