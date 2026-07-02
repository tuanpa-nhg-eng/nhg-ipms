// Mock data cho UI prototype. Bản production thay bằng API client (TDD §8).

export const execStats = [
  { v: "78%", l: "Strategic initiatives đúng tiến độ", d: "+6% so kỳ trước", dir: "up" as const, tone: "green" as const },
  { v: "12", l: "Goal-at-risk cần xử lý 30 ngày", d: "+3 tuần này", dir: "down" as const, tone: "red" as const },
  { v: "91%", l: "Check-in compliance (tháng 7)", d: "+4%", dir: "up" as const, tone: "green" as const },
  { v: "4.2K", l: "Evidence đã xác minh", d: "có audit trail", dir: "up" as const, tone: "" as const },
];

export const opcoScores = [
  { code: "H.01", name: "Holding", score: 86, status: "on", checkin: 95 },
  { code: "UNI", name: "Khối Đại học", score: 79, status: "on", checkin: 88 },
  { code: "K12", name: "Khối K-12", score: 72, status: "watch", checkin: 90 },
  { code: "HEALTH", name: "Khối Y tế", score: 64, status: "off", checkin: 76 },
  { code: "TECH", name: "Công nghệ & Đầu tư", score: 81, status: "on", checkin: 93 },
];

export const goalsAtRisk = [
  { name: "Tỷ lệ chuyển đổi tuyển sinh Q3", owner: "P. Tuyển sinh UNI", bu: "UNI", health: 42, due: "30/09", reason: "Lead-to-enroll dưới ngưỡng 2 tuần liên tục" },
  { name: "Chuẩn đầu ra chương trình mới", owner: "Khoa CNTT", bu: "UNI", health: 55, due: "15/10", reason: "Thiếu evidence accreditation" },
  { name: "Retention giáo viên giỏi K-12", owner: "HR K-12", bu: "K12", health: 38, due: "31/08", reason: "Flight-risk 3 nhân sự critical" },
  { name: "Trải nghiệm bệnh nhân (NPS)", owner: "BV trung tâm", bu: "HEALTH", health: 48, due: "30/09", reason: "Complaint resolution time tăng" },
  { name: "Tự động hoá quy trình tài chính", owner: "B2 Finance", bu: "H.01", health: 60, due: "20/10", reason: "AI adoption rate dưới mục tiêu" },
];

export const myGoals = [
  { name: "Lead-to-enrollment conversion", kpi: "Tỷ lệ chuyển đổi", target: "28%", actual: "24%", pct: 86, weight: 30, status: "on", method: "system" },
  { name: "Chất lượng tư vấn (NPS)", kpi: "Service NPS", target: "70", actual: "73", pct: 100, weight: 25, status: "done", method: "system" },
  { name: "Data hygiene CRM", kpi: "% hồ sơ đầy đủ", target: "95%", actual: "88%", pct: 79, weight: 20, status: "watch", method: "system" },
  { name: "Hồ sơ phát hành đúng chuẩn", kpi: "Số văn bản lỗi/tháng", target: "≤2", actual: "1", pct: 100, weight: 15, status: "done", method: "manual" },
  { name: "Đóng góp cải tiến quy trình", kpi: "Sáng kiến được duyệt", target: "2", actual: "1", pct: 50, weight: 10, status: "watch", method: "manual" },
];

export const myEvidence = [
  { t: "Hoàn thành 142 lượt tư vấn tuyển sinh", m: "Nguồn: CRM · 26/07 · đã xác minh", ai: false },
  { t: "NPS khảo sát đợt 3 đạt 73 điểm", m: "Nguồn: Survey · 24/07 · đã xác minh", ai: false },
  { t: "AI tóm tắt 38 evidence gắn vào 5 goal", m: "Evidence Collector Agent · 26/07 · chờ duyệt", ai: true },
  { t: "1 sáng kiến cải tiến form đăng ký", m: "Nguồn: Notion task · 18/07 · đã xác minh", ai: false },
];

export const reviewData = {
  reviewee: "Nguyễn Thị Lan",
  position: "Chuyên viên Tuyển sinh — Khối Đại học",
  cycle: "Quý 3/2026",
  proposedScore: 84.5,
  ipc: "A",
  items: [
    { kpi: "Lead-to-enrollment conversion", weight: 30, pct: 86, raw: 22, src: "system" },
    { kpi: "Service NPS", weight: 25, pct: 100, raw: 25, src: "system" },
    { kpi: "Data hygiene CRM", weight: 20, pct: 79, raw: 16, src: "system" },
    { kpi: "Hồ sơ đúng chuẩn", weight: 15, pct: 100, raw: 15, src: "manual" },
    { kpi: "Cải tiến quy trình", weight: 10, pct: 50, raw: 5, src: "manual" },
  ],
  aiDraft:
    "Lan duy trì hiệu suất ổn định trong Q3 với điểm mạnh rõ ở chất lượng dịch vụ (NPS 73, vượt mục tiêu) và tuân thủ chuẩn phát hành hồ sơ. Tỷ lệ chuyển đổi tuyển sinh đạt 86% mục tiêu — cần cải thiện ở khâu chăm sóc lead giai đoạn giữa phễu. Data hygiene CRM (79%) là điểm cần ưu tiên trong quý tới.",
  aiStrengths: ["Chất lượng tư vấn vượt mục tiêu (NPS 73)", "Kỷ luật chuẩn hoá hồ sơ (1 lỗi/tháng)"],
  aiGaps: ["Data hygiene CRM dưới ngưỡng (88% < 95%)", "Đóng góp cải tiến mới đạt 50%"],
  aiFlags: [
    "Đánh giá manager dùng từ 'khá tốt' chung chung — nên gắn evidence cụ thể.",
    "Chưa có evidence cho mục 'tinh thần đồng đội' được nêu — cân nhắc bổ sung hoặc bỏ.",
  ],
};

export const kpiCategories = [
  {
    group: "Kết quả công việc", weight: 40, color: "#037236",
    items: [
      { code: "RS-01", name: "Lead-to-enrollment conversion", method: "system", dir: "forward", weight: 30 },
      { code: "RS-02", name: "Doanh thu/đầu mối phụ trách", method: "system", dir: "forward", weight: 10 },
    ],
  },
  {
    group: "Kỹ năng", weight: 30, color: "#1D6FB8",
    items: [
      { code: "SK-01", name: "Kỹ năng tư vấn (đánh giá)", method: "manual", dir: "forward", weight: 15 },
      { code: "SK-02", name: "Xử lý vấn đề khách hàng", method: "manual", dir: "forward", weight: 15 },
    ],
  },
  {
    group: "Thái độ", weight: 20, color: "#B7791F",
    items: [
      { code: "AT-01", name: "Tuân thủ quy trình", method: "system", dir: "forward", weight: 12 },
      { code: "AT-02", name: "Số văn bản phát hành lỗi/tháng", method: "manual", dir: "reverse", weight: 8 },
    ],
  },
  {
    group: "AI Adoption", weight: 10, color: "#6D28A8",
    items: [
      { code: "AI-01", name: "AI-assisted task ratio", method: "system", dir: "forward", weight: 6 },
      { code: "AI-02", name: "Giờ tiết kiệm nhờ AI/tháng", method: "system", dir: "forward", weight: 4 },
    ],
  },
];

export const scoreTiers = [
  { pct: "≥ 100%", score: 25 }, { pct: "≥ 90%", score: 22 }, { pct: "≥ 80%", score: 19 },
  { pct: "≥ 70%", score: 16 }, { pct: "< 70%", score: 0 },
];

// ===== Strategy Cascade (OKR → KGI → KPI) =====
export const strategyTree = [
  {
    kind: "OKR", name: "Tăng trưởng bền vững hệ sinh thái giáo dục 2026", owner: "Ban điều hành", weight: 100, health: 78,
    children: [
      {
        kind: "KGI", name: "Mở rộng quy mô tuyển sinh toàn khối +15%", owner: "Khối Đại học", weight: 40, health: 64,
        children: [
          { kind: "KPI", name: "Lead-to-enrollment conversion ≥ 28%", owner: "P. Tuyển sinh", weight: 60, health: 58 },
          { kind: "KPI", name: "Show rate ≥ 80%", owner: "P. Tuyển sinh", weight: 40, health: 72 },
        ],
      },
      {
        kind: "KGI", name: "Nâng chất lượng học thuật & trải nghiệm", owner: "Hội đồng học thuật", weight: 35, health: 82,
        children: [
          { kind: "KPI", name: "Student retention ≥ 92%", owner: "Khoa", weight: 50, health: 85 },
          { kind: "KPI", name: "Parent/Student NPS ≥ 70", owner: "P. CTSV", weight: 50, health: 80 },
        ],
      },
      {
        kind: "KGI", name: "Tăng năng lực AI của đội ngũ", owner: "B1 + B3", weight: 25, health: 88,
        children: [
          { kind: "KPI", name: "AI-assisted task ratio ≥ 40%", owner: "Các phòng", weight: 50, health: 90 },
          { kind: "KPI", name: "Giờ tiết kiệm nhờ AI ≥ 1.2K/tháng", owner: "Các phòng", weight: 50, health: 86 },
        ],
      },
    ],
  },
];

// ===== Team Check-in (Manager) =====
export const teamCheckins = [
  { name: "Nguyễn Thị Lan", role: "CV Tuyển sinh", status: "submitted", goals: 5, onTrack: 3, blocker: "Chờ data CRM tháng 7", load: "ok" },
  { name: "Trần Văn Minh", role: "CV Tuyển sinh", status: "submitted", goals: 4, onTrack: 4, blocker: "", load: "ok" },
  { name: "Lê Thu Hà", role: "CV Tư vấn", status: "open", goals: 5, onTrack: 2, blocker: "Quá tải — 2 chiến dịch song song", load: "high" },
  { name: "Phạm Quốc Anh", role: "CV Marketing", status: "submitted", goals: 4, onTrack: 1, blocker: "Phụ thuộc phê duyệt ngân sách", load: "high" },
  { name: "Võ Mai Chi", role: "CV Vận hành", status: "reviewed", goals: 3, onTrack: 3, blocker: "", load: "low" },
];

// ===== Calibration Room (HR/B1) =====
export const ratingDist = [
  { grade: "A+", count: 2, pct: 8 }, { grade: "A", count: 7, pct: 28 },
  { grade: "B", count: 11, pct: 44 }, { grade: "C", count: 4, pct: 16 }, { grade: "D", count: 1, pct: 4 },
];
export const calibrationOutliers = [
  { person: "Đỗ Hải Yến", bu: "UNI", mgr: "Mgr A", proposed: "A+", flag: "Rating cao hơn evidence — thiếu bằng chứng cho 2 KPI", sev: "high" },
  { person: "Bùi Tấn Phát", bu: "K12", mgr: "Mgr B", proposed: "C", flag: "Manager B có pattern chấm thấp đồng loạt (deflation)", sev: "med" },
  { person: "Ngô Khánh Vy", bu: "UNI", mgr: "Mgr A", proposed: "A", flag: "Nhất quán với nhóm cùng vai trò", sev: "ok" },
];

// ===== My Review (Employee) =====
export const myReview = {
  cycle: "Quý 3/2026",
  status: "manager_done", // self_done | manager_done | final
  finalScore: 84.5,
  ipc: "A",
  selfReflection:
    "Quý 3 tôi tập trung nâng chất lượng tư vấn (NPS đạt 73) và duy trì chuẩn hồ sơ. Điểm chưa hài lòng là data hygiene CRM, tôi sẽ ưu tiên quý tới.",
  managerAssessment:
    "Lan ổn định, điểm mạnh ở chất lượng dịch vụ và kỷ luật hồ sơ. Cần cải thiện chăm sóc lead giữa phễu và vệ sinh dữ liệu CRM. Đề xuất tham gia khoá 'CRM Data Quality' trên iLMS.",
  strengths: ["Chất lượng tư vấn vượt mục tiêu (NPS 73)", "Tuân thủ chuẩn phát hành hồ sơ (1 lỗi/tháng)"],
  gaps: ["Data hygiene CRM 88% < 95%", "Đóng góp cải tiến mới đạt 50%"],
  items: [
    { kpi: "Lead-to-enrollment conversion", weight: 30, pct: 86, raw: 22 },
    { kpi: "Service NPS", weight: 25, pct: 100, raw: 25 },
    { kpi: "Data hygiene CRM", weight: 20, pct: 79, raw: 16 },
    { kpi: "Hồ sơ đúng chuẩn", weight: 15, pct: 100, raw: 15 },
    { kpi: "Cải tiến quy trình", weight: 10, pct: 50, raw: 5 },
  ],
};

// ===== Development Plan (Employee) =====
export const devStats = [
  { v: "3", l: "Skill gap đang theo dõi" },
  { v: "2/5", l: "Learning action hoàn thành" },
  { v: "60%", l: "Tiến độ kế hoạch" },
  { v: "Q4", l: "Review tiếp theo" },
];
export const skillGaps = [
  { competency: "CRM Data Quality", cur: 2, target: 4, course: "iLMS · CRM Data Hygiene Foundations", status: "in_progress" },
  { competency: "Tư vấn giữa phễu (mid-funnel)", cur: 3, target: 4, course: "iLMS · Consultative Selling L2", status: "planned" },
  { competency: "Phân tích dữ liệu tuyển sinh", cur: 2, target: 3, course: "iLMS · Data Storytelling cơ bản", status: "done" },
];
export const coachingPlan = [
  { phase: "30 ngày", goal: "Đạt 95% data hygiene CRM", action: "Hoàn thành khoá CRM Data + áp dụng checklist hằng ngày", done: true },
  { phase: "60 ngày", goal: "Tăng conversion mid-funnel +5%", action: "Shadow 1 senior + thử kịch bản chăm sóc lead mới", done: false },
  { phase: "90 ngày", goal: "1 sáng kiến cải tiến được duyệt", action: "Đề xuất tối ưu form đăng ký dựa trên dữ liệu", done: false },
];

// ===== Audit Log (BOC) =====
export const auditLogs = [
  { at: "27/07 14:22", actor: "Mgr A", action: "rating.approve", entity: "Review #R-1042", detail: "B → A (calibration)", ai: false },
  { at: "27/07 14:05", actor: "AI · Review Drafting", action: "ai.suggest", entity: "Review #R-1042", detail: "draft summary · confidence 0.82", ai: true },
  { at: "27/07 11:30", actor: "HRBP Linh", action: "kpi.update", entity: "KPI RS-01", detail: "weight 25% → 30% (v3)", ai: false },
  { at: "27/07 09:48", actor: "AI · Evidence Collector", action: "ai.suggest", entity: "Goal G-220", detail: "gắn 38 evidence · chờ duyệt", ai: true },
  { at: "26/07 16:10", actor: "Lan NT", action: "evidence.verify", entity: "EV-9981", detail: "xác minh NPS survey đợt 3", ai: false },
  { at: "26/07 15:02", actor: "Mgr B", action: "goal.update", entity: "Goal G-118", detail: "đổi target Q3 (có rationale)", ai: false },
  { at: "26/07 10:15", actor: "Group HR Admin", action: "export.payroll", entity: "Cycle 2026-07", detail: "xuất 24 bản ghi → OneOffice", ai: false },
];

// ===== AI Adoption Dashboard (Exec / B3) =====
export const aiAdoptionStats = [
  { v: "43%", l: "AI-assisted task ratio", d: "+9% so quý trước", dir: "up" as const, tone: "green" as const },
  { v: "1.4K", l: "Giờ tiết kiệm / tháng", d: "+220 giờ", dir: "up" as const, tone: "green" as const },
  { v: "88%", l: "Tỷ lệ output AI được chấp nhận", d: "+3%", dir: "up" as const, tone: "" as const },
  { v: "6%", l: "AI rework rate", d: "−2% (tốt hơn)", dir: "up" as const, tone: "red" as const },
];
export const aiByDept = [
  { dept: "Tuyển sinh", ratio: 62, hours: 380, compliance: 96 },
  { dept: "Marketing", ratio: 55, hours: 240, compliance: 92 },
  { dept: "Vận hành", ratio: 38, hours: 210, compliance: 90 },
  { dept: "Tài chính (B2)", ratio: 31, hours: 180, compliance: 98 },
  { dept: "Học thuật", ratio: 22, hours: 120, compliance: 88 },
];
export const aiUseCases = [
  { name: "Soạn nháp tư vấn tuyển sinh", impact: "Cao", hours: 160, status: "approved" },
  { name: "Tóm tắt evidence cho review", impact: "Cao", hours: 140, status: "approved" },
  { name: "Phân loại hồ sơ tự động", impact: "TB", hours: 90, status: "approved" },
  { name: "Dự thảo email chăm sóc lead", impact: "TB", hours: 70, status: "pilot" },
];

// ===== Talent Risk Dashboard (Exec) =====
export const talentStats = [
  { v: "34", l: "High performer", tone: "green" as const },
  { v: "9", l: "High potential", tone: "" as const },
  { v: "5", l: "Flight risk (rủi ro nghỉ)", tone: "red" as const },
  { v: "72%", l: "Succession coverage vị trí chủ chốt", tone: "" as const },
];
export const flightRisks = [
  { person: "Đặng Hoài Nam", role: "Trưởng nhóm Tuyển sinh UNI", risk: 82, why: "Hiệu suất cao, 18 tháng chưa thăng tiến, lương dưới thị trường", action: "Retention plan + lộ trình thăng tiến" },
  { person: "Lý Thanh Trúc", role: "CV Phân tích dữ liệu", risk: 68, why: "Critical skill hiếm, tải cao 3 tháng", action: "Giảm tải + thưởng giữ chân" },
  { person: "Hồ Gia Bảo", role: "Bác sĩ chuyên khoa", risk: 61, why: "Vị trí critical, ít người kế nhiệm", action: "Xây succession pool" },
];
export const successionGaps = [
  { role: "Hiệu trưởng cơ sở 2", readyNow: 0, ready1y: 1, status: "off" },
  { role: "Trưởng phòng Tuyển sinh", readyNow: 1, ready1y: 2, status: "on" },
  { role: "Giám đốc Tài chính OpCo", readyNow: 0, ready1y: 1, status: "watch" },
];

// ===== Talent Matrix 9-box (HR) =====
// trục X: performance (0=thấp,1=TB,2=cao) · trục Y hiển thị potential (cao→thấp)
export const nineBox: Record<string, { names: string[]; label: string; tone: string }> = {
  "2-2": { label: "Ngôi sao", tone: "green", names: ["Mai Trang", "Lê Quân"] },
  "1-2": { label: "Tiềm năng cao", tone: "green", names: ["Ngọc Hân"] },
  "0-2": { label: "Bí ẩn", tone: "amber", names: ["Tuấn Kiệt"] },
  "2-1": { label: "Hiệu suất cao", tone: "green", names: ["Lan NT", "Minh TV", "Vy NK"] },
  "1-1": { label: "Lõi vững", tone: "info", names: ["Hà LT", "Chi VM"] },
  "0-1": { label: "Cần phát triển", tone: "amber", names: ["Phát BT"] },
  "2-0": { label: "Chuyên gia tin cậy", tone: "info", names: ["Hải Yến"] },
  "1-0": { label: "Đạt yêu cầu", tone: "gray", names: ["Quốc Anh"] },
  "0-0": { label: "Cần hành động", tone: "red", names: ["—"] },
};

// ===== Review Cycle Setup (HR) =====
export const reviewCycle = {
  name: "Đánh giá Quý 3/2026 — Khối Đại học",
  period: "Q3-2026",
  scope: "5 role family · 248 nhân sự · 12 phòng",
  phases: [
    { phase: "Mở chu kỳ & thông báo", date: "01/09", done: true },
    { phase: "Tự đánh giá (self review)", date: "01–07/09", done: true },
    { phase: "Quản lý đánh giá", date: "08–14/09", done: false, active: true },
    { phase: "Calibration", date: "15–18/09", done: false },
    { phase: "Chốt & phản hồi", date: "19–22/09", done: false },
  ],
  settings: [
    { k: "Multi-rater", v: "Self + Manager (tuần tự)" },
    { k: "Peer feedback", v: "Tuỳ chọn" },
    { k: "Bắt buộc evidence cho KPI", v: "Bật" },
    { k: "Rationale khi đổi rating", v: "Bắt buộc" },
    { k: "AI draft & bias check", v: "Bật (người duyệt)" },
    { k: "Giải trình/khiếu nại", v: "Bật, 5 ngày" },
  ],
  progress: { self: 92, manager: 41, calibrated: 0 },
};

// ===== Policy Management (HR/B5) =====
export const policies = [
  { name: "Phân loại dữ liệu (Public/Internal/Confidential/Restricted)", owner: "B5", version: "v2.1", status: "active" },
  { name: "AI Guardrails — ranh giới AI trong PMS", owner: "B3 + B5", version: "v1.3", status: "active" },
  { name: "Khung rating & calibration", owner: "B1", version: "v2.0", status: "active" },
  { name: "Chính sách evidence & audit trail", owner: "B1 + BOC", version: "v1.1", status: "active" },
  { name: "Map điểm → IPC → thưởng", owner: "B1 + B2", version: "v3.0", status: "review" },
  { name: "Data retention & export control", owner: "B5", version: "v1.0", status: "active" },
];

// ===== Compliance Dashboard (BOC/B5) =====
export const complianceStats = [
  { v: "98%", l: "Rating có evidence đầy đủ", tone: "green" as const },
  { v: "100%", l: "Output AI được gắn nhãn", tone: "green" as const },
  { v: "100%", l: "Quyết định cuối có người duyệt", tone: "green" as const },
  { v: "3", l: "Ngoại lệ chờ xử lý", tone: "red" as const },
];
export const complianceChecks = [
  { item: "Mọi rating phải có evidence", pass: 98, target: 100 },
  { item: "Evidence có nguồn + timestamp", pass: 100, target: 100 },
  { item: "Thay đổi calibration có rationale", pass: 100, target: 100 },
  { item: "Output AI gắn nhãn + log", pass: 100, target: 100 },
  { item: "Thay đổi KPI/goal/rating được log", pass: 100, target: 100 },
  { item: "Dữ liệu nhạy cảm đúng phân quyền", pass: 96, target: 100 },
];
export const complianceExceptions = [
  { case: "2 review thiếu evidence cho 1 KPI", sev: "high", owner: "Mgr A", due: "20/09" },
  { case: "1 export dữ liệu chờ phê duyệt B5", sev: "med", owner: "Group HR Admin", due: "18/09" },
  { case: "1 chính sách (map thưởng) đang review", sev: "low", owner: "B1", due: "25/09" },
];

// ===== My Check-ins (Employee) =====
export const myCheckin = {
  period: "Tháng 7/2026",
  status: "open",
  goals: [
    { name: "Lead-to-enrollment conversion", progress: 86, note: "Đang đẩy mạnh chăm sóc lead giữa phễu" },
    { name: "Data hygiene CRM", progress: 79, note: "Cần thời gian làm sạch hồ sơ cũ" },
    { name: "Service NPS", progress: 100, note: "Đạt mục tiêu" },
  ],
  blocker: "Chờ dữ liệu CRM tháng 7 từ phòng IT",
  history: [
    { period: "Tháng 6", status: "Đã review", on: 4, total: 5 },
    { period: "Tháng 5", status: "Đã review", on: 3, total: 5 },
    { period: "Tháng 4", status: "Đã review", on: 4, total: 5 },
  ],
};

// ===== Coaching Notes (Manager) =====
export const coachingNotes = [
  { person: "Lê Thu Hà", date: "24/07", topic: "Giảm tải & ưu tiên", note: "Thống nhất hoãn 1 chiến dịch, uỷ quyền 2 task. Theo dõi lại tuần sau.", followup: "31/07" },
  { person: "Nguyễn Thị Lan", date: "22/07", topic: "Data hygiene CRM", note: "Hướng dẫn checklist làm sạch dữ liệu. Đăng ký khoá iLMS.", followup: "05/08" },
  { person: "Phạm Quốc Anh", date: "20/07", topic: "Blocker ngân sách", note: "Escalate lên BU leader. Trong lúc chờ, tập trung phần không phụ thuộc.", followup: "27/07" },
];
