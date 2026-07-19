/**
 * Từ điển KPI MỞ RỘNG — domain Tài chính - Kế toán (lát G2, đợt 1 go-live Từ điển Tác vụ).
 *
 * TRẠNG THÁI: ĐỀ XUẤT (draft) — theo quyết định D3 (15/07/2026): "Claude đề xuất
 * trước, B1/chủ dự án CHỈNH SỬA TRỰC TIẾP FILE NÀY cho phù hợp".
 * Hai nguồn đề xuất (ghi rõ trong definition từng entry):
 *   · [từ KPI ứng viên nhúng] — khối `kpis` có sẵn trong tác vụ nguồn Dashboard v2.
 *   · [theo nhóm tác vụ]      — Claude soạn outcome-KPI cho nhóm tác vụ Kế toán
 *                               không có khối kpis (bảng GROUP_KPI_PROPOSALS trong script).
 * Trường đánh dấu "(B1 …)" là chỗ cần chuẩn hoá trước khi công bố rộng.
 *
 * Sinh bởi scripts/harvest-kpi-fin.mjs — CHẠY LẠI SẼ GHI ĐÈ chỉnh sửa tay.
 * Được seed vào kpi_template (isDictionary=true) cùng KPI_DICTIONARY gốc (seed.ts).
 */
import type { KpiDictEntry } from './kpi-dictionary.data';

export const KPI_DICTIONARY_EXT: KpiDictEntry[] = [
  {
    "code": "FIN-EXT-001",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ hồ sơ thanh toán xử lý đúng SLA và công nợ phải trả đối chiếu đúng kỳ",
    "definition": "Phần trăm hồ sơ đề nghị thanh toán được kiểm tra, trình duyệt trong SLA và công nợ phải trả được cập nhật, đối chiếu đúng kỳ. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: ACC-AP-001, ACC-AP-002, ACC-AP-003, ACC-AP-004]",
    "formula": "(Số hồ sơ đúng SLA + số dư NCC đối chiếu đúng kỳ / Tổng phát sinh) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-002",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ công nợ phải thu đối chiếu và khoản thu ghi nhận đúng kỳ",
    "definition": "Phần trăm công nợ phải thu được cập nhật, đối chiếu đúng kỳ và khoản thu (học viên/bệnh nhân/khách hàng) được ghi nhận đầy đủ, khoản thu chưa xác định được rà soát. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: ACC-AR-001, ACC-AR-002, ACC-AR-003]",
    "formula": "(Số khoản thu ghi nhận và đối chiếu đúng kỳ / Tổng khoản thu phát sinh) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-003",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ giao dịch ngân hàng hạch toán và đối chiếu trong ngày",
    "definition": "Phần trăm giao dịch ngân hàng được hạch toán và sao kê ngày được đối chiếu khớp với sổ kế toán ngay trong ngày làm việc. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: ACC-BANK-001, ACC-BANK-002]",
    "formula": "(Số ngày sao kê đối chiếu khớp trong ngày / Tổng số ngày làm việc trong kỳ) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-004",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ quỹ tiền mặt kiểm kê khớp sổ trong ngày",
    "definition": "Phần trăm ngày làm việc có bút toán thu chi tiền mặt ghi nhận đủ và số dư tiền mặt kiểm kê khớp sổ kế toán trong ngày. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: ACC-CASH-001, ACC-CASH-002]",
    "formula": "(Số ngày quỹ khớp sổ / Tổng số ngày làm việc trong kỳ) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-005",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ hoàn tất checklist khóa sổ đúng hạn",
    "definition": "Phần trăm kỳ kế toán có dữ liệu hạch toán trên Bravo được kiểm tra và chốt kỳ theo checklist khóa sổ đúng hạn. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: ACC-CHIEF-BRAVO-CLOSE-001, FIN-CHIEF-ACCOUNTANT-T047, FIN-CHIEF-ACCOUNTANT-T048, FIN-CHIEF-ACCOUNTANT-T049, FIN-CHIEF-ACCOUNTANT-T050…]",
    "formula": "(Số kỳ chốt đúng hạn / Tổng số kỳ trong năm) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo, Hệ thống hóa đơn điện tử, Hệ thống kê khai thuế, Ngân hàng điện tử",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-006",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ chứng từ được tiếp nhận, kiểm tra và xử lý sai lệch đúng hạn",
    "definition": "Phần trăm chứng từ phát sinh được tiếp nhận, kiểm tra, phân loại và xử lý sai lệch (nếu có) trong SLA ngày làm việc quy định. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: ACC-DOC-001, ACC-DOC-002, ACC-DOC-003, ACC-DOC-004]",
    "formula": "(Số chứng từ xử lý đúng hạn / Tổng chứng từ phát sinh trong kỳ) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-007",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ bút toán chi phí hạch toán đúng tài khoản, đúng kỳ",
    "definition": "Phần trăm bút toán mua hàng hoá dịch vụ và chi phí phát sinh được hạch toán đúng tài khoản, đúng đối tượng và đúng kỳ kế toán trên Bravo. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: ACC-EXP-001, ACC-EXP-002]",
    "formula": "(Số bút toán chi phí đúng tài khoản và đúng kỳ / Tổng bút toán chi phí) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-008",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ bút toán và sổ chi tiết cập nhật đúng ngày, đúng kỳ",
    "definition": "Phần trăm nhật ký hạch toán, sổ chi tiết tài khoản và bảng tổng hợp chứng từ được cập nhật đầy đủ trong ngày/kỳ hạch toán, đúng tài khoản và bản chất nghiệp vụ. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: ACC-GL-001, ACC-GL-002, ACC-GL-003, ACC-GL-004, ACC-GL-005…]",
    "formula": "(Số bút toán ghi nhận đúng ngày và đúng kỳ / Tổng bút toán phát sinh) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-009",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ doanh thu ghi nhận và hoá đơn đầu ra phát hành đúng hạn",
    "definition": "Phần trăm bút toán doanh thu được ghi nhận đầy đủ và hoá đơn đầu ra được phát hành, lưu trữ đúng hạn theo quy định. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: ACC-REV-001, ACC-REV-002]",
    "formula": "(Số khoản doanh thu ghi nhận + hoá đơn phát hành đúng hạn / Tổng khoản phát sinh) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-010",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ hồ sơ và tờ khai thuế lập, nộp đúng hạn",
    "definition": "Phần trăm hoá đơn đầu vào được kiểm tra ghi nhận, dữ liệu thuế tổng hợp và tờ khai/hồ sơ thuế (GTGT, TNCN, TNDN) lập, nộp đúng hạn theo quy định. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: ACC-TAX-001, ACC-TAX-002, GL-TAX-001, GL-TAX-002, GL-TAX-003]",
    "formula": "(Số tờ khai/hồ sơ thuế nộp đúng hạn / Tổng số phải nộp trong kỳ) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-011",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ hoàn tất ngân sách năm đúng hạn",
    "definition": "Bộ ngân sách năm được chốt và ban hành đúng hạn / tổng kỳ ngân sách phải ban hành [ĐỀ XUẤT từ KPI ứng viên nhúng — nguồn: FIN-BUDGET-YEAR-CORE-001, FIN-FINANCE-EXECUTIVE-T082, FIN-FINANCE-EXECUTIVE-T087, FIN-FINANCE-EXECUTIVE-T088, FIN-FINANCE-EXECUTIVE-T089…]",
    "formula": "Mục tiêu tham chiếu từ nguồn: 100% theo lịch ngân sách năm (giả định). (B1 chuẩn hoá công thức đo.)",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo, Hệ thống/bảng dữ liệu lập ngân sách, Hệ thống/bảng dữ liệu forecast, Dashboard BI, Dữ liệu nhân sự/quỹ lương",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-012",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn",
    "definition": "Kế hoạch nguồn vốn năm được phê duyệt đúng hạn / tổng kỳ kế hoạch năm [ĐỀ XUẤT theo nhóm tác vụ — nguồn: FIN-CAPITAL-SOURCING-T114, FIN-CAPITAL-SOURCING-T115, FIN-CAPITAL-SOURCING-T116, FIN-CAPITAL-SOURCING-T117, FIN-CAPITAL-SOURCING-T118…]",
    "formula": "Mục tiêu tham chiếu từ nguồn: 100% theo lịch kế hoạch năm (giả định). (B1 chuẩn hoá công thức đo.)",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo, Ngân hàng điện tử, Bảng/dataset dòng tiền, Kho hồ sơ tín dụng, Kho hồ sơ đầu tư, Dashboard thanh khoản",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-013",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Báo cáo kiểm soát CAPEX tháng hoàn tất đúng hạn, đủ nội dung",
    "definition": "Báo cáo kiểm soát CAPEX tháng được hoàn tất đúng hạn với đầy đủ nội dung phân tích theo yêu cầu kiểm soát đầu tư. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: FIN-CTRL-ANL-MONTH-CORE-001]",
    "formula": "(Số báo cáo CAPEX tháng đúng hạn đủ nội dung / Tổng số tháng trong kỳ) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo, Hệ thống/bảng dữ liệu lập ngân sách, Hệ thống/bảng dữ liệu forecast, Dashboard BI, Dữ liệu nhân sự/quỹ lương",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-014",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Forecast tài chính tháng cập nhật và phê duyệt đúng hạn",
    "definition": "Forecast tài chính tháng được cập nhật số liệu thực tế và trình phê duyệt đúng lịch quy định. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: FIN-FORECAST-MONTH-CORE-001]",
    "formula": "(Số forecast tháng phê duyệt đúng hạn / Tổng số tháng trong kỳ) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo, Hệ thống/bảng dữ liệu lập ngân sách, Hệ thống/bảng dữ liệu forecast, Dashboard BI, Dữ liệu nhân sự/quỹ lương",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-015",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Báo cáo trạng thái nguồn vốn và nghĩa vụ nợ tháng hoàn tất đúng hạn",
    "definition": "Báo cáo trạng thái nguồn vốn và nghĩa vụ nợ vay tháng được hoàn tất đúng hạn, phản ánh đầy đủ dư nợ, lịch trả và covenant. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: FUND-DEBT-MONTH-CORE-001]",
    "formula": "(Số báo cáo tháng đúng hạn / Tổng số tháng trong kỳ) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo, Ngân hàng điện tử, Bảng/dataset dòng tiền, Kho hồ sơ tín dụng, Kho hồ sơ đầu tư, Dashboard thanh khoản",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-016",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Báo cáo thanh khoản và nhu cầu vốn tuần cập nhật đúng hạn",
    "definition": "Báo cáo thanh khoản và nhu cầu vốn tuần được cập nhật đúng lịch, đủ căn cứ dòng tiền vào/ra và nhu cầu vốn ngắn hạn. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: FUND-LIQ-WEEK-CORE-001]",
    "formula": "(Số báo cáo tuần đúng hạn / Tổng số tuần trong kỳ) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo, Ngân hàng điện tử, Bảng/dataset dòng tiền, Kho hồ sơ tín dụng, Kho hồ sơ đầu tư, Dashboard thanh khoản",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-017",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Hồ sơ thu xếp vốn trình phê duyệt đúng SLA",
    "definition": "Hồ sơ thu xếp vốn vay hoặc huy động vốn được chuẩn bị đầy đủ và trình phê duyệt trong SLA quy định cho từng giao dịch. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: FUND-RAISE-TXN-CORE-001]",
    "formula": "(Số hồ sơ trình đúng SLA / Tổng số giao dịch thu xếp vốn trong kỳ) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo, Ngân hàng điện tử, Bảng/dataset dòng tiền, Kho hồ sơ tín dụng, Kho hồ sơ đầu tư, Dashboard thanh khoản",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-018",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ sai lệch và chênh lệch tài khoản xử lý, giải trình đúng hạn",
    "definition": "Phần trăm bút toán sai lệch được rà soát xử lý và hồ sơ giải trình chênh lệch tài khoản hoàn tất trong thời hạn quy định. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: GL-CTRL-001, GL-CTRL-002]",
    "formula": "(Số sai lệch xử lý đúng hạn / Tổng sai lệch phát hiện trong kỳ) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-019",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ hạng mục khóa sổ tháng hoàn tất đúng hạn",
    "definition": "Phần trăm hạng mục khóa sổ tháng (đối chiếu công nợ, phân bổ chi phí trả trước, trích khấu hao, đối chiếu liên quan) hoàn tất đúng hạn. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: GL-MONTH-001, GL-MONTH-002, GL-MONTH-003, GL-MONTH-004, GL-MONTH-005…]",
    "formula": "(Số hạng mục hoàn tất đúng hạn / Tổng hạng mục checklist tháng) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-020",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Tỷ lệ báo cáo kế toán tháng chốt số liệu đúng hạn",
    "definition": "Phần trăm báo cáo cân đối phát sinh và báo cáo kế toán tháng được kiểm tra và chốt số liệu đúng hạn. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: GL-REPORT-001]",
    "formula": "(Số báo cáo tháng chốt đúng hạn / Tổng số báo cáo tháng trong kỳ) × 100%",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  },
  {
    "code": "FIN-EXT-021",
    "domain": "Tài chính - Kế toán",
    "nameVi": "Hồ sơ quyết toán và báo cáo tài chính năm hoàn tất đúng hạn",
    "definition": "Bộ hồ sơ quyết toán năm được tổng hợp đầy đủ và báo cáo tài chính năm được lập, trình phê duyệt đúng thời hạn quy định. [ĐỀ XUẤT theo nhóm tác vụ — nguồn: GL-YE-001, GL-YE-002]",
    "formula": "Đạt/Không đạt theo mốc thời hạn quy định từng hạng mục hồ sơ năm",
    "grain": "Tỷ lệ (%) theo kỳ đo — (B1 xác nhận grain)",
    "dataClassification": "Internal",
    "sourceSystem": "Bravo",
    "aiBoundary": "Tổng hợp/đối chiếu — không xuất dữ liệu tài chính chi tiết ra AI công cộng"
  }
];

/** Map tác vụ → KPI (explainable từng dòng) — dùng bởi mapper task-catalog-v2. */
export const TASK_KPI_MAP_V2: Record<string, { kpi: string; reason: string }> = {
  "ACC-AP-001": {
    "kpi": "FIN-EXT-001",
    "reason": "Đề xuất theo nhóm tác vụ ACC-AP (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-AP-002": {
    "kpi": "FIN-EXT-001",
    "reason": "Đề xuất theo nhóm tác vụ ACC-AP (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-AP-003": {
    "kpi": "FIN-EXT-001",
    "reason": "Đề xuất theo nhóm tác vụ ACC-AP (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-AP-004": {
    "kpi": "FIN-EXT-001",
    "reason": "Đề xuất theo nhóm tác vụ ACC-AP (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-AR-001": {
    "kpi": "FIN-EXT-002",
    "reason": "Đề xuất theo nhóm tác vụ ACC-AR (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-AR-002": {
    "kpi": "FIN-EXT-002",
    "reason": "Đề xuất theo nhóm tác vụ ACC-AR (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-AR-003": {
    "kpi": "FIN-EXT-002",
    "reason": "Đề xuất theo nhóm tác vụ ACC-AR (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-BANK-001": {
    "kpi": "FIN-EXT-003",
    "reason": "Đề xuất theo nhóm tác vụ ACC-BANK (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-BANK-002": {
    "kpi": "FIN-EXT-003",
    "reason": "Đề xuất theo nhóm tác vụ ACC-BANK (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-CASH-001": {
    "kpi": "FIN-EXT-004",
    "reason": "Đề xuất theo nhóm tác vụ ACC-CASH (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-CASH-002": {
    "kpi": "FIN-EXT-004",
    "reason": "Đề xuất theo nhóm tác vụ ACC-CASH (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-CHIEF-BRAVO-CLOSE-001": {
    "kpi": "FIN-EXT-005",
    "reason": "Đề xuất theo nhóm tác vụ ACC-CHIEF-BRAVO-CLOSE (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-DOC-001": {
    "kpi": "FIN-EXT-006",
    "reason": "Đề xuất theo nhóm tác vụ ACC-DOC (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-DOC-002": {
    "kpi": "FIN-EXT-006",
    "reason": "Đề xuất theo nhóm tác vụ ACC-DOC (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-DOC-003": {
    "kpi": "FIN-EXT-006",
    "reason": "Đề xuất theo nhóm tác vụ ACC-DOC (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-DOC-004": {
    "kpi": "FIN-EXT-006",
    "reason": "Đề xuất theo nhóm tác vụ ACC-DOC (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-EXP-001": {
    "kpi": "FIN-EXT-007",
    "reason": "Đề xuất theo nhóm tác vụ ACC-EXP (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-EXP-002": {
    "kpi": "FIN-EXT-007",
    "reason": "Đề xuất theo nhóm tác vụ ACC-EXP (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-GL-001": {
    "kpi": "FIN-EXT-008",
    "reason": "Đề xuất theo nhóm tác vụ ACC-GL (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-GL-002": {
    "kpi": "FIN-EXT-008",
    "reason": "Đề xuất theo nhóm tác vụ ACC-GL (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-GL-003": {
    "kpi": "FIN-EXT-008",
    "reason": "Đề xuất theo nhóm tác vụ ACC-GL (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-GL-004": {
    "kpi": "FIN-EXT-008",
    "reason": "Đề xuất theo nhóm tác vụ ACC-GL (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-GL-005": {
    "kpi": "FIN-EXT-008",
    "reason": "Đề xuất theo nhóm tác vụ ACC-GL (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-REV-001": {
    "kpi": "FIN-EXT-009",
    "reason": "Đề xuất theo nhóm tác vụ ACC-REV (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-REV-002": {
    "kpi": "FIN-EXT-009",
    "reason": "Đề xuất theo nhóm tác vụ ACC-REV (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-TAX-001": {
    "kpi": "FIN-EXT-010",
    "reason": "Đề xuất theo nhóm tác vụ ACC-TAX (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "ACC-TAX-002": {
    "kpi": "FIN-EXT-010",
    "reason": "Đề xuất theo nhóm tác vụ ACC-TAX (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "FIN-BUDGET-YEAR-CORE-001": {
    "kpi": "FIN-EXT-011",
    "reason": "KPI ứng viên nhúng trong tác vụ nguồn (Dashboard v2): 'Tỷ lệ hoàn tất ngân sách năm đúng hạn' — mục tiêu 100% theo lịch ngân sách năm (giả định)"
  },
  "FIN-CAPITAL-SOURCING-T114": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T115": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T116": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T117": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T118": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T119": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T120": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T121": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T122": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T123": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T124": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T125": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T126": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T127": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T128": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T129": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T130": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T131": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T132": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T133": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T134": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T135": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T136": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T137": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T138": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T139": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T140": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T141": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T142": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T143": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T144": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T145": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T146": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T147": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T148": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T149": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T150": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T151": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T152": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T153": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T154": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T155": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CAPITAL-SOURCING-T156": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Capital_Sourcing_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T047": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T048": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T049": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T050": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T051": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T052": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T053": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T054": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T057": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T058": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T059": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T060": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T061": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T063": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T064": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T066": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T067": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T068": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T069": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T070": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T075": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CHIEF-ACCOUNTANT-T076": {
    "kpi": "FIN-EXT-005",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Chief_Accountant_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất checklist khóa sổ đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-CTRL-ANL-MONTH-CORE-001": {
    "kpi": "FIN-EXT-013",
    "reason": "Đề xuất theo nhóm tác vụ FIN-CTRL-ANL-MONTH-CORE (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "FIN-FINANCE-EXECUTIVE-T082": {
    "kpi": "FIN-EXT-011",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Finance_Executive_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất ngân sách năm đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-FINANCE-EXECUTIVE-T087": {
    "kpi": "FIN-EXT-011",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Finance_Executive_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất ngân sách năm đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-FINANCE-EXECUTIVE-T088": {
    "kpi": "FIN-EXT-011",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Finance_Executive_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất ngân sách năm đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-FINANCE-EXECUTIVE-T089": {
    "kpi": "FIN-EXT-011",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Finance_Executive_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất ngân sách năm đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-FINANCE-EXECUTIVE-T092": {
    "kpi": "FIN-EXT-011",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Finance_Executive_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất ngân sách năm đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-FINANCE-EXECUTIVE-T094": {
    "kpi": "FIN-EXT-011",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Finance_Executive_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất ngân sách năm đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-FINANCE-EXECUTIVE-T095": {
    "kpi": "FIN-EXT-011",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Finance_Executive_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất ngân sách năm đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-FINANCE-EXECUTIVE-T100": {
    "kpi": "FIN-EXT-011",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Finance_Executive_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất ngân sách năm đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-FINANCE-EXECUTIVE-T102": {
    "kpi": "FIN-EXT-011",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Finance_Executive_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất ngân sách năm đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-FINANCE-EXECUTIVE-T103": {
    "kpi": "FIN-EXT-011",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Finance_Executive_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất ngân sách năm đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-FINANCE-EXECUTIVE-T104": {
    "kpi": "FIN-EXT-011",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Finance_Executive_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất ngân sách năm đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-FINANCE-EXECUTIVE-T109": {
    "kpi": "FIN-EXT-011",
    "reason": "KPI MẪU cấp file nguồn 'FIN_Finance_Executive_Tasks' (áp chung cho cụm tác vụ codeless): 'Tỷ lệ hoàn tất ngân sách năm đúng hạn' — B1 tinh chỉnh per-task khi tối ưu"
  },
  "FIN-FORECAST-MONTH-CORE-001": {
    "kpi": "FIN-EXT-014",
    "reason": "Đề xuất theo nhóm tác vụ FIN-FORECAST-MONTH-CORE (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "FUND-DEBT-MONTH-CORE-001": {
    "kpi": "FIN-EXT-015",
    "reason": "Đề xuất theo nhóm tác vụ FUND-DEBT-MONTH-CORE (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "FUND-LIQ-WEEK-CORE-001": {
    "kpi": "FIN-EXT-016",
    "reason": "Đề xuất theo nhóm tác vụ FUND-LIQ-WEEK-CORE (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "FUND-PLAN-YEAR-CORE-001": {
    "kpi": "FIN-EXT-012",
    "reason": "KPI ứng viên nhúng trong tác vụ nguồn (Dashboard v2): 'Tỷ lệ kế hoạch nguồn vốn năm được phê duyệt đúng hạn' — mục tiêu 100% theo lịch kế hoạch năm (giả định)"
  },
  "FUND-RAISE-TXN-CORE-001": {
    "kpi": "FIN-EXT-017",
    "reason": "Đề xuất theo nhóm tác vụ FUND-RAISE-TXN-CORE (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-CLOSE-001": {
    "kpi": "FIN-EXT-005",
    "reason": "Đề xuất theo nhóm tác vụ GL-CLOSE (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-CTRL-001": {
    "kpi": "FIN-EXT-018",
    "reason": "Đề xuất theo nhóm tác vụ GL-CTRL (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-CTRL-002": {
    "kpi": "FIN-EXT-018",
    "reason": "Đề xuất theo nhóm tác vụ GL-CTRL (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-DAY-001": {
    "kpi": "FIN-EXT-008",
    "reason": "Đề xuất theo nhóm tác vụ GL-DAY (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-DAY-002": {
    "kpi": "FIN-EXT-008",
    "reason": "Đề xuất theo nhóm tác vụ GL-DAY (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-DAY-003": {
    "kpi": "FIN-EXT-008",
    "reason": "Đề xuất theo nhóm tác vụ GL-DAY (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-DAY-004": {
    "kpi": "FIN-EXT-008",
    "reason": "Đề xuất theo nhóm tác vụ GL-DAY (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-DAY-005": {
    "kpi": "FIN-EXT-008",
    "reason": "Đề xuất theo nhóm tác vụ GL-DAY (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-MONTH-001": {
    "kpi": "FIN-EXT-019",
    "reason": "Đề xuất theo nhóm tác vụ GL-MONTH (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-MONTH-002": {
    "kpi": "FIN-EXT-019",
    "reason": "Đề xuất theo nhóm tác vụ GL-MONTH (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-MONTH-003": {
    "kpi": "FIN-EXT-019",
    "reason": "Đề xuất theo nhóm tác vụ GL-MONTH (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-MONTH-004": {
    "kpi": "FIN-EXT-019",
    "reason": "Đề xuất theo nhóm tác vụ GL-MONTH (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-MONTH-005": {
    "kpi": "FIN-EXT-019",
    "reason": "Đề xuất theo nhóm tác vụ GL-MONTH (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-MONTH-006": {
    "kpi": "FIN-EXT-019",
    "reason": "Đề xuất theo nhóm tác vụ GL-MONTH (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-REPORT-001": {
    "kpi": "FIN-EXT-020",
    "reason": "Đề xuất theo nhóm tác vụ GL-REPORT (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-TAX-001": {
    "kpi": "FIN-EXT-010",
    "reason": "Đề xuất theo nhóm tác vụ GL-TAX (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-TAX-002": {
    "kpi": "FIN-EXT-010",
    "reason": "Đề xuất theo nhóm tác vụ GL-TAX (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-TAX-003": {
    "kpi": "FIN-EXT-010",
    "reason": "Đề xuất theo nhóm tác vụ GL-TAX (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-YE-001": {
    "kpi": "FIN-EXT-021",
    "reason": "Đề xuất theo nhóm tác vụ GL-YE (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  },
  "GL-YE-002": {
    "kpi": "FIN-EXT-021",
    "reason": "Đề xuất theo nhóm tác vụ GL-YE (outcome của nhóm + business_rules nguồn) — B1 hiệu chỉnh"
  }
};
