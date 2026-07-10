/**
 * Từ điển KPI chuẩn NHG (lát 4h) — 20 metric trích từ
 * gg-io-nhg/01_foundation/NHG_Semantic_Dictionary_v1.html (Semantic Dictionary v1.0).
 * Nguồn tham chiếu BẮT BUỘC: mọi task_cell active/canonical phải gắn 1 mã trong danh sách này.
 * KHÔNG sửa tay — chạy lại script trích nếu Semantic Dictionary đổi.
 */
export interface KpiDictEntry {
  code: string; domain: string; nameVi: string;
  definition: string; formula: string; grain: string;
  dataClassification: string; sourceSystem: string; aiBoundary: string;
}

export const KPI_DICTIONARY: KpiDictEntry[] = [
  {
    "code": "ADM-LEAD-001",
    "domain": "Tuyển sinh",
    "nameVi": "Khách hàng tiềm năng — Lead",
    "definition": "Một cá nhân (phụ huynh/học sinh) để lại thông tin liên hệ tối thiểu (họ tên + 1 kênh liên hệ) và được ghi nhận vào CRM trong một chiến dịch/năm tuyển sinh, chưa qua sàng lọc chất lượng.",
    "formula": "Số Lead = COUNT DISTINCT (lead_id) theo năm tuyển sinh, đã khử trùng lặp theo (SĐT chuẩn hóa + email).",
    "grain": "1 lead",
    "dataClassification": "Confidential (PII)",
    "sourceSystem": "CRM Tuyển sinh",
    "aiBoundary": "Đếm/tổng hợp/phân tích — không xuất PII ra AI công cộng"
  },
  {
    "code": "ADM-MQL-002",
    "domain": "Tuyển sinh",
    "nameVi": "Lead đạt chuẩn Marketing — MQL",
    "definition": "Lead đã được xác thực thông tin liên hệ hợp lệ và có tương tác/mức độ quan tâm đạt ngưỡng marketing quy định (ví dụ: phản hồi, đăng ký sự kiện, điền form quan tâm ngành cụ thể).",
    "formula": "Số MQL = COUNT DISTINCT (lead_id) có trạng thái = 'MQL' theo tiêu chí chấm điểm marketing (ngưỡng cần Data Owner xác nhận) .",
    "grain": "1 lead đạt chuẩn",
    "dataClassification": "Confidential",
    "sourceSystem": "CRM Tuyển sinh",
    "aiBoundary": "Tổng hợp/phân tích phễu"
  },
  {
    "code": "ADM-SQL-003",
    "domain": "Tuyển sinh",
    "nameVi": "Lead đạt chuẩn Tuyển sinh — SQL",
    "definition": "MQL đã được đội tuyển sinh tiếp cận, xác nhận có nhu cầu thực và đủ điều kiện cơ bản (đúng độ tuổi/bậc học, khả năng tài chính sơ bộ, đúng địa bàn) để theo đuổi thành hồ sơ.",
    "formula": "Số SQL = COUNT DISTINCT (lead_id) có trạng thái = 'SQL' sau xác nhận của tuyển sinh.",
    "grain": "1 lead đủ điều kiện",
    "dataClassification": "Confidential",
    "sourceSystem": "CRM Tuyển sinh",
    "aiBoundary": "Phân tích chuyển đổi phễu"
  },
  {
    "code": "ADM-APP-004",
    "domain": "Tuyển sinh",
    "nameVi": "Hồ sơ dự tuyển hợp lệ — Valid Application",
    "definition": "Bộ hồ sơ dự tuyển đã nộp đủ thành phần bắt buộc và được bộ phận tuyển sinh nghiệm thu là hợp lệ theo quy chế tuyển sinh của bậc/trường.",
    "formula": "Số hồ sơ hợp lệ = COUNT DISTINCT (application_id) có trạng thái = 'Hợp lệ' theo năm tuyển sinh.",
    "grain": "1 hồ sơ",
    "dataClassification": "Confidential",
    "sourceSystem": "Cổng tuyển sinh SIS",
    "aiBoundary": "Tổng hợp/kiểm tra tính đủ"
  },
  {
    "code": "ADM-ENR-005",
    "domain": "Tuyển sinh",
    "nameVi": "Nhập học chính thức — Confirmed Enrollment (\"tuyển sinh thành công\")",
    "definition": "Thí sinh đã hoàn tất xác nhận nhập học : được cấp mã sinh viên/học sinh trong SIS và đã đóng khoản tài chính giữ chỗ/học phí đợt 1 theo quy định. Đây là định nghĩa duy nhất của \"tuyển sinh thành công\" toàn tập đoàn.",
    "formula": "Số nhập học = COUNT DISTINCT (student_id) có trạng thái = 'Đã nhập học' AND đã ghi nhận khoản thu xác nhận nhập học tại Bravo, theo năm tuyển sinh.",
    "grain": "1 sinh viên/học sinh",
    "dataClassification": "Confidential",
    "sourceSystem": "SIS Bravo",
    "aiBoundary": "Tổng hợp/báo cáo · HITL khi công bố số liệu chính thức"
  },
  {
    "code": "ADM-CVR-006",
    "domain": "Tuyển sinh",
    "nameVi": "Tỷ lệ chuyển đổi nhập học — Enrollment Conversion Rate",
    "definition": "Tỷ lệ chuyển đổi giữa các bậc của phễu tuyển sinh, mặc định tính từ Lead đến Nhập học chính thức; có thể tính theo từng đoạn phễu.",
    "formula": "CVR tổng = ADM-ENR-005 / ADM-LEAD-001 (cùng năm, cùng phạm vi). CVR đoạn = bậc sau / bậc trước (Lead→MQL→SQL→Hồ sơ→Nhập học).",
    "grain": "Tỷ lệ (%) theo nhóm",
    "dataClassification": "Internal (tổng hợp)",
    "sourceSystem": "CRM SIS",
    "aiBoundary": "Phân tích/so sánh/dự báo"
  },
  {
    "code": "ADM-CPE-007",
    "domain": "Tuyển sinh",
    "nameVi": "Chi phí trên mỗi nhập học — Cost per Enrollment (CPE)",
    "definition": "Tổng chi phí tuyển sinh & marketing được phân bổ để có được một nhập học chính thức trong kỳ.",
    "formula": "CPE = (Chi phí marketing + chi phí tuyển sinh phân bổ trong kỳ) / ADM-ENR-005 cùng kỳ, cùng phạm vi (quy tắc phân bổ chi phí cần B2 xác nhận) .",
    "grain": "VND / nhập học",
    "dataClassification": "Confidential",
    "sourceSystem": "Bravo CRM",
    "aiBoundary": "Phân tích hiệu quả chi"
  },
  {
    "code": "FIN-TUI-REC-001",
    "domain": "Học phí & Tài chính",
    "nameVi": "Học phí phải thu — Tuition Receivable (net)",
    "definition": "Tổng nghĩa vụ học phí mà người học phải nộp trong kỳ sau khi trừ miễn giảm/học bổng đã duyệt — tức số tiền kỳ vọng thu được (net).",
    "formula": "HP phải thu (net) = Σ (học phí niêm yết theo lớp/tín chỉ đã đăng ký) − Σ (miễn giảm + học bổng đã duyệt), theo kỳ, theo phạm vi.",
    "grain": "1 dòng nghĩa vụ theo SV/kỳ",
    "dataClassification": "Confidential",
    "sourceSystem": "Bravo SIS",
    "aiBoundary": "Tổng hợp/đối soát · HITL khi ra báo cáo tài chính"
  },
  {
    "code": "FIN-TUI-COL-002",
    "domain": "Học phí & Tài chính",
    "nameVi": "Học phí thực thu — Tuition Collected",
    "definition": "Tổng số tiền học phí thực tế đã vào tài khoản/quỹ của đơn vị và được đối soát tại Bravo trong kỳ (cơ sở tiền mặt).",
    "formula": "HP thực thu = Σ (khoản thu học phí đã đối soát tại Bravo, status = 'Đã thu') theo ngày giá trị, trong kỳ, theo phạm vi.",
    "grain": "1 giao dịch thu",
    "dataClassification": "Confidential",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/đối soát · HITL khi công bố"
  },
  {
    "code": "FIN-TUI-DEBT-003",
    "domain": "Học phí & Tài chính",
    "nameVi": "Công nợ học phí — Tuition Outstanding",
    "definition": "Phần nghĩa vụ học phí đã đến hạn nhưng chưa thu được tại thời điểm báo cáo.",
    "formula": "Công nợ = FIN-TUI-REC-001 (net, phần đã đến hạn) − FIN-TUI-COL-002 (đã thu tương ứng), tại ngày báo cáo.",
    "grain": "1 dòng công nợ theo SV/kỳ",
    "dataClassification": "Confidential (nợ cá nhân → hạn chế truy cập)",
    "sourceSystem": "Bravo",
    "aiBoundary": "Phân tích aging/cảnh báo · không tự động nhắc nợ tới người học nếu chưa có phê duyệt"
  },
  {
    "code": "FIN-SCHOL-004",
    "domain": "Học phí & Tài chính",
    "nameVi": "Miễn giảm & Học bổng — Discount & Scholarship",
    "definition": "Tổng giá trị các khoản giảm trừ học phí đã được phê duyệt (học bổng, ưu đãi, miễn giảm chính sách) áp cho người học trong kỳ.",
    "formula": "Miễn giảm = Σ (giá trị khoản giảm trừ đã duyệt) theo kỳ, phân loại theo nguồn (học bổng tài năng, chính sách, ưu đãi tuyển sinh…).",
    "grain": "1 khoản giảm trừ",
    "dataClassification": "Confidential",
    "sourceSystem": "Bravo SIS",
    "aiBoundary": "Tổng hợp/phân tích tỷ trọng"
  },
  {
    "code": "FIN-REV-005",
    "domain": "Học phí & Tài chính",
    "nameVi": "Doanh thu học phí ghi nhận — Recognized Tuition Revenue (accrual)",
    "definition": "Phần học phí được ghi nhận là doanh thu theo nguyên tắc dồn tích — phân bổ theo tiến độ cung cấp dịch vụ đào tạo (theo kỳ học), không theo thời điểm thu tiền.",
    "formula": "Doanh thu ghi nhận kỳ = Σ (học phí net phân bổ cho phần chương trình đã giảng dạy trong kỳ) theo chuẩn kế toán áp dụng (chính sách ghi nhận cần B2 xác nhận) .",
    "grain": "Doanh thu theo kỳ kế toán",
    "dataClassification": "Confidential",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/phân tích · HITL bắt buộc cho số liệu tài chính chính thức"
  },
  {
    "code": "FIN-COLR-006",
    "domain": "Học phí & Tài chính",
    "nameVi": "Tỷ lệ thu học phí — Collection Rate",
    "definition": "Mức độ hoàn thành thu học phí so với nghĩa vụ phải thu đã đến hạn trong kỳ.",
    "formula": "Tỷ lệ thu = FIN-TUI-COL-002 / (FIN-TUI-REC-001 phần đã đến hạn), cùng kỳ, cùng phạm vi.",
    "grain": "Tỷ lệ (%)",
    "dataClassification": "Internal (tổng hợp)",
    "sourceSystem": "Bravo",
    "aiBoundary": "Phân tích/cảnh báo/dự báo dòng tiền"
  },
  {
    "code": "FIN-EBITDA-007",
    "domain": "Học phí & Tài chính",
    "nameVi": "EBITDA cấp trường — School-level EBITDA",
    "definition": "Lợi nhuận trước lãi vay, thuế và khấu hao của một trường/OpCo cấp 2, dùng để so sánh hiệu quả vận hành giữa các đơn vị.",
    "formula": "EBITDA = Doanh thu thuần − chi phí vận hành (không gồm lãi vay, thuế, khấu hao) ± chi phí shared-service tập đoàn phân bổ (quy tắc phân bổ cần B2 chuẩn hóa & công bố) .",
    "grain": "EBITDA theo đơn vị/kỳ",
    "dataClassification": "Restricted (hiệu quả tài chính đơn vị)",
    "sourceSystem": "Bravo",
    "aiBoundary": "Phân tích/so sánh nội bộ · HITL · không xuất ra ngoài"
  },
  {
    "code": "TCH-ACT-001",
    "domain": "Giờ giảng",
    "nameVi": "Giờ thực giảng — Actual Teaching Hours",
    "definition": "Số giờ giảng dạy giảng viên thực tế lên lớp , được ghi nhận và nghiệm thu qua chấm công thực giảng trên ASC, sau khi xử lý các thiếu sót/dạy thay/dạy bù.",
    "formula": "Giờ thực giảng = Σ (thời lượng buổi dạy có trạng thái 'Đã lên lớp' đã nghiệm thu trên ASC) trong kỳ chấm công đã khóa, theo giảng viên.",
    "grain": "1 buổi dạy / giảng viên",
    "dataClassification": "Confidential (gắn nhân sự & lương)",
    "sourceSystem": "ASC",
    "aiBoundary": "Phát hiện bất thường/tổng hợp · HITL — AI không tự chốt giờ"
  },
  {
    "code": "TCH-STD-002",
    "domain": "Giờ giảng",
    "nameVi": "Giờ chuẩn (giờ quy đổi) — Converted Standard Hours",
    "definition": "Giờ thực giảng đã nhân hệ số quy đổi (theo loại lớp, sĩ số, bậc đào tạo, hình thức) để quy về \"giờ chuẩn\" dùng cho tính định mức và vượt giờ.",
    "formula": "Giờ chuẩn = Σ (giờ thực giảng của buổi × hệ số quy đổi TCH-COEF-006 áp dụng cho buổi đó), theo giảng viên/kỳ.",
    "grain": "Giờ chuẩn / giảng viên / kỳ",
    "dataClassification": "Confidential",
    "sourceSystem": "ASC",
    "aiBoundary": "Tổng hợp/đối soát · HITL"
  },
  {
    "code": "TCH-QUOTA-003",
    "domain": "Giờ giảng",
    "nameVi": "Định mức giờ nghĩa vụ — Teaching Obligation Quota",
    "definition": "Số giờ chuẩn giảng viên có nghĩa vụ hoàn thành trong năm học theo chức danh, sau khi trừ miễn giảm do chức vụ kiêm nhiệm/chính sách.",
    "formula": "Định mức thực = Định mức giờ nghĩa vụ theo chức danh − Σ (miễn giảm theo chức vụ kiêm nhiệm/chính sách đã duyệt), theo giảng viên/năm học.",
    "grain": "Giờ chuẩn / giảng viên / năm học",
    "dataClassification": "Confidential",
    "sourceSystem": "ASC HRM",
    "aiBoundary": "Tra cứu/tổng hợp"
  },
  {
    "code": "TCH-OT-004",
    "domain": "Giờ giảng",
    "nameVi": "Vượt giờ — Overtime Teaching Hours",
    "definition": "Phần giờ chuẩn giảng dạy vượt trên định mức giờ nghĩa vụ của giảng viên trong năm học, đủ điều kiện xét thanh toán vượt giờ.",
    "formula": "Vượt giờ = max(0, TCH-STD-002 hợp lệ − TCH-QUOTA-003), loại trừ giờ thuộc lớp học phần không tính vượt giờ, theo giảng viên/năm học.",
    "grain": "Giờ chuẩn vượt / giảng viên / năm",
    "dataClassification": "Confidential (dẫn tới thanh toán)",
    "sourceSystem": "ASC → Bravo",
    "aiBoundary": "Tính toán/phát hiện sai lệch · HITL — không tự phê duyệt thanh toán"
  },
  {
    "code": "TCH-RATE-005",
    "domain": "Giờ giảng",
    "nameVi": "Đơn giá vượt giờ — Overtime Unit Price",
    "definition": "Mức tiền chi trả cho một giờ chuẩn vượt định mức, theo chính sách đã phê duyệt của kỳ (có thể khác theo bậc đào tạo/chức danh).",
    "formula": "Đơn giá vượt giờ = giá trị VND/giờ chuẩn theo bảng đơn giá đã phê duyệt (TCH-OT-004 × đơn giá = tiền vượt giờ) (bảng đơn giá cần B2 + Đào tạo xác nhận) .",
    "grain": "VND / giờ chuẩn",
    "dataClassification": "Confidential",
    "sourceSystem": "ASC Bravo",
    "aiBoundary": "Tra cứu/áp dụng · HITL cho thanh toán"
  },
  {
    "code": "TCH-COEF-006",
    "domain": "Giờ giảng",
    "nameVi": "Hệ số quy đổi giờ chuẩn — Standard-hour Conversion Coefficient",
    "definition": "Bộ hệ số dùng để quy đổi giờ thực giảng sang giờ chuẩn, theo loại lớp/sĩ số/bậc đào tạo/hình thức giảng dạy.",
    "formula": "Là bảng tham chiếu (coefficient table) phiên bản theo kỳ, dùng bởi TCH-STD-002. Ví dụ: lớp đông sĩ số × hệ số > 1; hướng dẫn/thực hành × hệ số riêng (giá trị cần Đào tạo xác nhận) .",
    "grain": "1 dòng hệ số theo loại lớp",
    "dataClassification": "Internal (tham số chính sách)",
    "sourceSystem": "ASC",
    "aiBoundary": "Tra cứu/kiểm tra nhất quán"
  }
];
