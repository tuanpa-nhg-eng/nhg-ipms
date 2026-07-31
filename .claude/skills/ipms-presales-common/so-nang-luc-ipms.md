# Sổ Năng lực Nền tảng iPMS

> **Nguồn sự thật DUY NHẤT** cho mọi câu "iPMS đáp ứng…" trong tài liệu tiền bán hàng.
> Cập nhật: **28/07/2026** · Đối chiếu: `STATUS.md` (22/07/2026) + `OWNER_DIGEST.md` (28/07/2026).

## 0. Cách dùng sổ này

1. Mỗi yêu cầu `BR-xx` của khách phải trỏ về **một dòng** trong sổ. Không có dòng tương ứng ⇒ mức fit là **Tùy biến** hoặc **Ngoài phạm vi**, không được viết "iPMS có sẵn".
2. **Không tự nâng mức.** Chỉ người phụ trách sản phẩm mới đổi mức trong sổ, kèm ngày và bằng chứng.
3. Sổ quá **30 ngày** so với hôm nay ⇒ đọc lại `STATUS.md` + `OWNER_DIGEST.md` trước khi phát hành BRD, và ghi ngày đối chiếu vào BRD §12.
4. Cột **"Câu trình khách"** là câu được phép nói với khách. Cột **"Ghi chú nội bộ"** ⛔ không bao giờ ra khỏi hàng rào (`quy-uoc.md` §5).

## Thang trạng thái nền tảng

| Mã | Nghĩa | Hệ quả khi báo giá |
|---|---|---|
| **VH** | **Vận hành** — đã build, có test hồi quy + kiểm chứng trên môi trường chạy thật | 0 ngày công phát triển |
| **BẬT** | Code đã có, cần **khoá/token/hạ tầng của khách** mới chạy được | 0 ngày công build, có ngày công tích hợp + phụ thuộc phía khách |
| **CH** | Đáp ứng bằng **cấu hình** trong Configuration Studio, không cần code | Ngày công cấu hình + đào tạo |
| **PT** | Đã có thiết kế/đặc tả, **chưa build** | Phải ước lượng ngày công phát triển — nêu rõ trong BRD |
| **NPV** | Chưa có thiết kế, ngoài phạm vi hiện tại | Đánh giá riêng, không đưa vào cam kết đợt đầu |

⚠️ **Luật vàng:** trong BRD trình khách, mọi dòng **PT** và **NPV** phải hiện diện ở mục Gap + Giả định, **không** được gộp im lặng vào "iPMS đáp ứng".

---

## A · Động cơ, kỳ vọng & mức trưởng thành

| Năng lực | Mức | Câu trình khách | Ghi chú nội bộ ⛔ |
|---|---|---|---|
| Định vị sản phẩm | VH | iPMS là **hệ điều hành hiệu suất & tăng trưởng** (Performance & Growth OS), không chỉ số hoá biểu mẫu đánh giá | Khách chỉ muốn "số hoá form" ⇒ hoặc định vị lại kỳ vọng, hoặc thu hẹp phạm vi đợt đầu và báo giá tương ứng |
| Dải ROI tham chiếu | — | **Mục tiêu** đặt ra: giảm ~40% thời gian dựng scorecard, ~30% thời gian nhập liệu | Đây là **dải mục tiêu**, KHÔNG phải kết quả đo tại khách. Cấm trình bày như số liệu đã kiểm chứng |

## B · Chiến lược & phân rã mục tiêu

| Năng lực | Mức | Câu trình khách | Ghi chú nội bộ ⛔ |
|---|---|---|---|
| Cascade OKR → KGI → KPI → Tác vụ, có lineage "Liên kết chiến lược" | VH | Mục tiêu tập đoàn phân rã xuống phòng ban và cá nhân, mỗi mục tiêu con truy vết được về mục tiêu cha | `objective.kind=okr/kgi + parent_id`, `cascade_link` |
| Roll-up tiến độ theo trọng số + cảnh báo mục tiêu rủi ro (goal-at-risk) | VH | Tiến độ mục tiêu cha tự tổng hợp từ con theo trọng số; hệ cảnh báo mục tiêu có nguy cơ trượt | Có advisory lock chống race |
| Cảnh báo khoảng trống cascade (mục tiêu không có KPI/tác vụ đỡ) | VH | Phát hiện mục tiêu chưa có chỉ số hoặc công việc nào đỡ bên dưới | |
| Chu kỳ chiến lược năm/nửa năm/quý | CH | Cấu hình theo chu kỳ của khách | |
| Nhãn BSC 4 viễn cảnh · phân biệt Lead/Lag | PT | Chưa có trong bản hiện tại; bổ sung được | Đã phân tích ở `02-dac-ta/…Phuong_Phap_Khung_Hieu_Suat.md`, **chưa chốt, chưa build** |
| Điều chỉnh mục tiêu giữa kỳ có phê duyệt | VH | Có, thay đổi được ghi vết đầy đủ | |

## C · Cơ cấu tổ chức & mô hình đa đơn vị

| Năng lực | Mức | Câu trình khách | Ghi chú nội bộ ⛔ |
|---|---|---|---|
| Kiến trúc multi-tenant cô lập dữ liệu ở tầng CSDL | VH | Mỗi đơn vị là một không gian dữ liệu tách biệt, cô lập là mặc định | RLS fail-closed mọi bảng, có test rò tenant |
| Một nền tảng phục vụ nhiều đơn vị **không phân nhánh mã nguồn** | VH | Các đơn vị khác nhau về khung/chu kỳ/KPI vẫn dùng chung một hệ, khác nhau bằng cấu hình | Nguyên tắc "0 fork" |
| Cây tổ chức: tạo/đổi tên/đổi cha/lưu trữ đơn vị, gán quản lý, đếm nhân sự | VH | Tự quản trị cơ cấu tổ chức trên giao diện | `/admin/org`, trục B L3 |
| Thiết kế cơ cấu bằng canvas kéo–thả | VH | Có bàn thiết kế tổ chức trực quan trong Configuration Studio | `/studio/org` |
| Bảng điều khiển cấp tập đoàn xuyên đơn vị (heatmap, benchmark, drill-down) | PT | Có thiết kế đầy đủ, triển khai ở giai đoạn sau khi ≥2 đơn vị có dữ liệu | Spec `…Group_Master_Dashboard.md`, Phase 4–5, **chưa build** |
| Đơn vị tự giấu chỉ số nhạy cảm khỏi cấp trên | PT | Thuộc gói bảng điều khiển cấp tập đoàn | `group_visibility_policy` mới ở mức thiết kế |
| Cấu trúc ma trận (một người nhiều tuyến báo cáo) | PT | Bản hiện tại theo tuyến báo cáo đơn; ma trận cần phát triển thêm | Phải ước lượng nếu khách có ma trận thật |

## D · Vai trò, persona & phân quyền

| Năng lực | Mức | Câu trình khách | Ghi chú nội bộ ⛔ |
|---|---|---|---|
| Phân quyền theo vai trò + phạm vi (bản thân / phòng ban / toàn đơn vị) | VH | Mỗi vai trò chỉ thấy và làm đúng phần của mình, chặn mặc định | ScopeGuard fail-closed |
| Chính sách truy cập dạng mã (guardrail thu hẹp quyền, không mở rộng) | VH | Đơn vị tự siết thêm quyền bằng chính sách, không thể tự nới rộng | Cedar, PolicyGuard tầng 4 |
| Phân tách nhiệm vụ (người soạn ≠ người duyệt) ở tầng chạy thật | VH | Soạn KPI ≠ duyệt KPI, soạn cấu hình ≠ công bố cấu hình — hệ chặn ngay lúc thao tác | `sod_rule` runtime |
| Không có tài khoản toàn năng | VH | Kể cả quản trị viên cao nhất của đơn vị cũng không tự chốt điểm/xuất lương/đọc nhật ký kiểm toán | Lỗ god-account đã đóng ở trục B L0 |
| Quản trị 3 tầng: quản trị đơn vị · thiết lập người dùng · đóng vai chỉ-đọc có ghi vết | VH | Quản trị viên đơn vị tự tạo người dùng, gán vai; hỗ trợ kỹ thuật đóng vai chỉ-đọc, mọi thao tác đều lưu vết | Trục B L0–L6; verdict Reviewer đối kháng **đang chờ** tại thời điểm cập nhật sổ — kiểm lại trước khi cam kết |
| Quản trị nền tảng xuyên đơn vị (nhà cung cấp vận hành) | PT | Thuộc gói vận hành nhà cung cấp, triển khai theo hợp đồng dịch vụ | Platform Admin B1/B2 **chưa build** |
| Đánh giá chéo / 360° nhiều người chấm | PT | Bản hiện tại: tự đánh giá + quản lý trực tiếp + cân chỉnh. Nhiều người chấm song song/tuần tự cần phát triển thêm | Có trong logic lõi gốc nhưng **chưa build** — dễ bị hiểu nhầm là đã có, cảnh giác |
| Xác thực nhiều lớp (MFA) khi thao tác nhạy cảm | PT | Có thiết kế, triển khai theo yêu cầu bảo mật của khách | MFA step-up + break-glass **chưa build** |

## E · Khung KPI & chỉ số đo lường

> Phân hệ khớp sâu nhất — đây là lõi sản phẩm.

| Năng lực | Mức | Câu trình khách | Ghi chú nội bộ ⛔ |
|---|---|---|---|
| Từ điển KPI cha–con (KPI tổng gồm nhiều KPI thành phần) | VH | Có | |
| Chấm thủ công và chấm tự động từ hệ nguồn, trộn lẫn trong cùng bộ | VH | Có | KPI `system` lấy bằng chứng đã xác minh **trong kỳ** |
| Công thức chiều xuôi và chiều ngược (càng thấp càng tốt) | VH | Có | |
| Điều kiện áp dụng KPI theo đối tượng/tình huống | VH | Có | `kpi_applicability` |
| Bậc thang quy đổi điểm | VH | Có | `kpi_score_tier`, chuẩn hoá theo bậc tối đa |
| Trọng số theo KPI hoặc theo nhóm tiêu chí, tổng bắt buộc = 100% | VH | Có, hệ **chặn cứng** nếu tổng ≠ 100% | Σ=100±0.01 |
| Định mức: mục tiêu / tối thiểu / gốc | VH | Có | `scorecard_item` |
| Công thức có **phiên bản, bất biến**; điểm đã chốt giữ nguyên công thức tại thời điểm chấm | VH | Sửa công thức không làm thay đổi điểm kỳ cũ | Snapshot `formulaVersion` + `targetValue` |
| KPI phải qua **phê duyệt của người thật** mới có hiệu lực | VH | Có | HITL bất biến |
| Từ điển KPI chuẩn hoá kèm định nghĩa, đơn vị đo, nguồn dữ liệu, ranh giới AI | VH | Nền tảng có sẵn khung từ điển chuẩn; bộ chỉ số của khách được nạp vào khung này | 20 metric mẫu là dữ liệu NHG — **không** bán kèm nếu chưa được duyệt |

## F · Chu trình đánh giá hiệu suất

| Năng lực | Mức | Câu trình khách | Ghi chú nội bộ ⛔ |
|---|---|---|---|
| Trọn vòng: giao mục tiêu → check-in giữa kỳ → tự đánh giá → quản lý đánh giá → cân chỉnh → chốt | VH | Có đủ 6 bước, bật/tắt từng bước theo quy trình khách | |
| Chấm điểm tính **phía máy chủ** từ định mức đã duyệt | VH | Người được đánh giá không thể tự thay đổi mục tiêu để nâng điểm | Đã đóng đường tự thổi điểm |
| Cân chỉnh (calibration) bắt buộc ghi lý do | VH | Mỗi lần điều chỉnh điểm phải có lý do, lưu vết | ≥10 ký tự + version |
| Chốt kỳ phải do người thật quyết | VH | Không có chốt tự động | Conditional update chống race |
| Kho bằng chứng: đính kèm minh chứng theo KPI, có người xác minh | VH | Có, người nộp ≠ người xác minh | Đã đóng lỗ tự cấp + tự xác minh |
| Nạp bằng chứng hàng loạt, không nhân đôi khi chạy lại | VH | Có | Idempotent theo (nguồn, mã ngoài) |
| Quy đổi điểm → lương/thưởng theo bảng của khách | CH | Cấu hình bảng quy đổi riêng cho từng đơn vị | `reward_map` trong cấu hình đơn vị |
| Xuất kết quả sang hệ lương của khách | PT | Có cơ chế xuất; **định dạng phải map theo hệ lương cụ thể của khách** | Hiện chỉ có định dạng cho một hệ lương nội bộ — luôn tính ngày công map |
| Kế hoạch cải thiện (PIP) / lộ trình phát triển | VH | Có màn phát triển cá nhân | Màn `development` persona nhân viên |

## G · Kiến trúc tác vụ & mô tả công việc

| Năng lực | Mức | Câu trình khách | Ghi chú nội bộ ⛔ |
|---|---|---|---|
| Từ điển tác vụ, mỗi tác vụ có 7 nhóm thuộc tính (định danh, RACI & năng lực, luồng vào–ra, đo lường & định mức, chiều AI, quản trị & rủi ro, vòng đời) | VH | Có | |
| Tác vụ **bắt buộc gắn KPI thật** mới được kích hoạt | VH | Hệ chặn cứng tác vụ không gắn chỉ số | Chốt chính sách Q1 |
| Trưởng phòng ủy quyền cho nhân viên soạn tác vụ, thu quyền lại được | VH | Có, quyền tự thu hồi khi nhân viên chuyển phòng | `authoring_grant` |
| Cổng duyệt: người soạn ≠ người duyệt, trưởng phòng là cổng kích hoạt | VH | Có | |
| Vòng lặp tối ưu liên tục: đang chạy → góp ý từ người dùng thật → mở lại sửa → duyệt → phiên bản mới | VH | Có, lịch sử phiên bản chỉ ghi thêm, so sánh được hai bản | `task_revision` append-only |
| Sinh tự động KPI + tác vụ từ cơ cấu tổ chức / quy trình ("kéo theo") | VH | Khai báo phòng ban–chức năng ⇒ hệ đề xuất sẵn bộ chỉ số và tác vụ, **giải thích được vì sao** | Auto-Derivation Engine, preview + diff |
| Nạp bộ tác vụ chuẩn hoá từ file của khách | VH | Có, kiểm tra chất lượng + phát hiện trùng trước khi nạp | Import 3 chế độ, idempotent |
| Bộ tác vụ mẫu theo ngành | CH | Cung cấp theo gói triển khai | Bộ 419 cell hiện có là **dữ liệu NHG**, không mặc định bán kèm |

## H · Nguồn dữ liệu & tích hợp

| Năng lực | Mức | Câu trình khách | Ghi chú nội bộ ⛔ |
|---|---|---|---|
| Bộ khung kết nối (Connector SDK) để nối hệ nguồn của khách | VH | Có khung chuẩn để viết kết nối tới hệ của khách | |
| Đồng bộ hai chiều, không nhân đôi bản ghi, có hàng đợi thử lại | VH | Có | Outbox + sync_record idempotent, retry trần 5 |
| Hợp đồng dữ liệu kiểm tra từng dòng khi nạp | VH | Dữ liệu sai định dạng bị chặn ngay tại cửa, báo lỗi theo dòng | `data_contract` |
| Nạp bằng file CSV khi hệ nguồn chưa mở API | VH | Có, đây là phương án dự phòng chuẩn | |
| Kết nối công cụ cộng tác (Notion, MS Planner / To-Do) | BẬT | Đã dựng sẵn, cần **tài khoản + token của khách** để kích hoạt | Hiện chạy trên connector mô phỏng; chưa từng chạy với token thật |
| Kết nối ERP / CRM / HRIS cụ thể của khách | PT | Viết theo từng hệ, dựa trên khung kết nối có sẵn | Ước lượng riêng mỗi hệ. **Rủi ro:** hệ mua ngoài thường không mở API |
| Đồng bộ theo lịch (hằng ngày / cuối kỳ) | VH | Có | Job theo lịch |
| Đồng bộ thời gian thực | PT | Đánh giá theo hệ nguồn cụ thể | |

## I · AI & tự động hoá

| Năng lực | Mức | Câu trình khách | Ghi chú nội bộ ⛔ |
|---|---|---|---|
| **Người quyết định cuối luôn là con người (HITL)** — AI chỉ đề xuất, vào hàng chờ duyệt | VH | Bất biến của sản phẩm, không tắt được | Điểm bán mạnh nhất về quản trị AI |
| Mọi đề xuất của AI đều **giải thích được** | VH | Có, kèm lý do và dữ liệu căn cứ | |
| Nhật ký tương tác AI chỉ ghi thêm, không sửa/xoá | VH | Có | `ai_interaction` append-only trigger |
| Chính sách xuất dữ liệu ra ngoài theo phân loại dữ liệu | VH | Dữ liệu nhạy cảm không rời hạ tầng; phân loại nào được gọi mô hình ngoài là do khách quyết | Egress policy |
| Khử thông tin cá nhân trước khi gửi mô hình | VH | Có | PII scrub thuận–nghịch |
| Cổng kiểm định mô hình + bộ đo chất lượng + đo chi phí trước khi bật | VH | Trước khi bật AI thật, hệ chạy bộ kiểm định và ước tính chi phí | Eval harness + unit economics + Model-Qualification Gate |
| Trợ lý hỏi–đáp trong sản phẩm (Copilot) | VH trên mô hình mô phỏng · **BẬT** để chạy mô hình thật | Giao diện trợ lý đã hoàn chỉnh; chạy với mô hình thật cần khoá API và hạn mức chi phí | Cờ `ai_gateway_live` đang **TẮT**; chi phí hiện = 0 |
| Trợ lý gợi ý ngay trong màn nghiệp vụ (soạn KPI, soạn tác vụ, cân chỉnh) | VH trên mô hình mô phỏng · **BẬT** để chạy thật | Như trên | |
| Chọn nhiều nhà cung cấp mô hình / tự vận hành mô hình nội bộ (self-host) | PT | Có thiết kế; triển khai theo yêu cầu chủ quyền dữ liệu của khách | Đa provider + Ollama/vLLM **chưa build**, cần GPU |
| Huấn luyện tinh chỉnh mô hình theo dữ liệu khách | NPV | Đánh giá riêng như dự án con | |

## J · Báo cáo, dashboard & phân tích

| Năng lực | Mức | Câu trình khách | Ghi chú nội bộ ⛔ |
|---|---|---|---|
| Màn hình riêng cho 5 nhóm: nhân viên · trưởng phòng · nhân sự · điều hành · kiểm toán | VH | Có, chạy trên dữ liệu thật | 18 màn đã rời dữ liệu giả |
| Tổng quan điều hành + cảnh báo mục tiêu rủi ro | VH | Có | |
| Ma trận tài năng 9 ô | VH | Có | |
| Đường phân bố điểm phục vụ cân chỉnh | VH | Có | |
| Nhật ký kiểm toán tra cứu được cho vai trò kiểm toán | VH | Có | |
| Xuất báo cáo ra PDF/Excel từ trong sản phẩm | PT | Bản hiện tại xem trên màn hình; xuất file theo mẫu của khách cần phát triển | Đừng nhầm với deliverable HTML A4 của đội tài liệu |
| So sánh, xếp hạng giữa các đơn vị | PT | Thuộc gói bảng điều khiển cấp tập đoàn | |

## K · Cấu hình, thương hiệu & tùy biến

| Năng lực | Mức | Câu trình khách | Ghi chú nội bộ ⛔ |
|---|---|---|---|
| Bộ nhận diện riêng theo đơn vị (logo, màu, tên) | VH | Có, khách tự đổi trên giao diện | Brand Kit, token có whitelist kiểm tra |
| Bàn thiết kế cơ cấu tổ chức & quy trình kéo–thả | VH | Có | |
| Cấu hình có **phiên bản**: nháp → xem trước → so sánh khác biệt → công bố → quay lui | VH | Có, kèm nhật ký thay đổi đầy đủ | Config-as-Data |
| Người sửa cấu hình ≠ người công bố | VH | Có | SoD `config:write ⟂ config:publish` |
| Khách **tự cấu hình** không phụ thuộc nhà cung cấp | VH | Đây là định vị lõi: doanh nghiệp tự cấu hình, không cần bản riêng cho từng đơn vị | |
| Song ngữ Việt – Anh | VH | Có sẵn toàn hệ | |
| Ngôn ngữ thứ ba | PT | Bổ sung được, cần ngày công dịch + kiểm | |

## L · Phi chức năng, bảo mật & tuân thủ

| Năng lực | Mức | Câu trình khách | Ghi chú nội bộ ⛔ |
|---|---|---|---|
| Cô lập dữ liệu giữa các đơn vị ở tầng CSDL, chặn mặc định | VH | Có, đã kiểm chứng bằng bộ test rò rỉ dữ liệu chéo | RLS fail-closed |
| Nhật ký kiểm toán **chỉ ghi thêm**, không sửa/xoá được | VH | Có, kể cả quản trị viên | Trigger CSDL |
| Ghi vết mọi thao tác nhạy cảm cùng giao dịch nghiệp vụ | VH | Có | |
| Đăng nhập một lần (SSO) qua Microsoft Entra ID | BẬT | Cấu trúc định danh đã khớp chuẩn Entra; kích hoạt cần **tenant Azure của khách** | Claims đã map; **chưa từng cắm OIDC thật** — luôn tính ngày công tích hợp + phụ thuộc phía khách |
| Xác thực nhiều lớp (MFA) | PT | Theo yêu cầu bảo mật của khách | |
| Đặt hạ tầng tại Việt Nam / on-premise | BẬT | Triển khai được trên hạ tầng do khách chỉ định | Hạ tầng chuẩn: PostgreSQL + Redis, container hoá |
| Chính sách thời hạn lưu trữ & xoá dữ liệu theo Nghị định 13 | VH cho hai nhóm dữ liệu · **PT** cho phần còn lại | Có bộ quy tắc lưu trữ theo nhóm dữ liệu, bắt buộc **chạy thử trước** rồi mới chạy thật; nhật ký kiểm toán không bị đụng tới | [Trục C L5] `retention_policy` + `retention_run`, chạy thật phải trỏ tới một lượt chạy thử còn hạn. Mới có bộ thực thi cho **2 nhóm** (kết quả đánh giá → khử danh; nhật ký hệ thống → xoá cứng); `cold_archive` **chưa thực thi được** (chưa có kho lạnh). ⛔ **KHÔNG** hứa "tuân thủ NĐ13 sẵn" — hứa đúng: có cơ chế, còn danh mục nhóm dữ liệu phải chốt với khách |
| Sổ đăng ký dữ liệu: nhóm dữ liệu · chủ dữ liệu · 4 mức phân loại | VH | Mọi nhóm dữ liệu có chủ và mức phân loại; đơn vị chỉ siết chặt được, không nới lỏng | [Trục C L0] `data_asset` + trigger chặn nới lỏng; vai `data_steward` là vai duy nhất sửa |
| Kiểm soát xuất dữ liệu: một cổng duy nhất, ghi vết ai–gì–mức nào–ra đâu | VH | Mọi đường dữ liệu ra ngoài đi qua một cổng, không khai báo thì không xuất được | [Trục C L1+L6] `ExportGuard` fail-closed + `export_log` append-only; cổng của job nền nằm ở tầng service nên worker cũng đi qua |
| Ngoại lệ chính sách **có thời hạn**, tự hết hiệu lực | VH | Nới quyền phải có người duyệt khác người xin, trần 72 giờ, hết hạn tự mất — không ai gia hạn được | [Trục C L3] `policy_exception`; kiểm tại cửa mỗi request, không phụ thuộc job dọn |
| Cờ rủi ro **sinh tự động** + luồng xử lý sự cố | VH cho B5/B0 · **PT** màn hình cho B3/V1 | Cờ suy ra từ sự kiện đã ghi, không có màn nhập tay; sự cố đóng phải ghi nguyên nhân gốc | [Trục C L4] `risk_flag` + `incident`; B3/V1 mới có API, **chưa có màn hình** |
| Lớp quản trị nền tảng xuyên đơn vị, tách khỏi quyền nghiệp vụ | VH | Người vận hành nền tảng thấy trạng thái mọi đơn vị mà không đọc được nội dung nghiệp vụ | [Trục C L2] read model + GUC, **không** cấp BYPASSRLS cho người thật; có ca đối chứng 403 ở mọi endpoint nghiệp vụ |
| Chịu tải đỉnh cuối kỳ đánh giá | BẬT | Định cỡ theo quy mô người dùng của khách | Chưa có số đo tải công bố được — không nêu con số cụ thể |

## M · Phạm vi, lộ trình & quản trị thay đổi

| Năng lực | Mức | Câu trình khách | Ghi chú nội bộ ⛔ |
|---|---|---|---|
| Mô hình triển khai: chạy thí điểm một đơn vị → nhân rộng, **không phân nhánh mã nguồn** | VH | Có, đây là mô hình chuẩn của nền tảng | |
| Hồ sơ hướng dẫn người dùng | VH | Có sổ tay người dùng theo luồng công việc | `09-so-tay-nguoi-dung/` |
| Bản trải nghiệm thử toàn nền tảng trước khi ký | VH | Có bản trải nghiệm để khách dùng thử các persona | `10-trai-nghiem-nen-tang/` |
| Đào tạo & quản trị thay đổi | CH | Theo gói dịch vụ triển khai | |

---

## Ba câu trả lời chuẩn cho câu hỏi khó

**"Sản phẩm này đã chạy thật ở đâu chưa?"**
→ Nền tảng đang vận hành nội bộ tại tập đoàn với đầy đủ vòng đánh giá, từ điển tác vụ và hệ quản trị 3 tầng. Được phép nói: đã có người dùng thật thuộc 5 nhóm vai trò khác nhau. **Không** được nêu tên đơn vị nội bộ, số lượng người dùng hay số liệu vận hành khi chưa được duyệt.

**"AI có tự chấm điểm nhân viên không?"**
→ Không, và đây là thiết kế có chủ đích. AI đề xuất, con người duyệt; mọi đề xuất đều giải thích được và lưu vết. Dữ liệu nhạy cảm không rời hạ tầng nếu khách không cho phép.

**"Bao giờ dùng được?"**
→ Không cam kết mốc trong BRD. BRD chốt **yêu cầu**; lộ trình và ngày công nằm ở tài liệu đề xuất giải pháp, sau khi đã chốt danh sách hạng mục **PT** và các phụ thuộc phía khách (token, tenant Azure, quyền truy cập hệ nguồn).
