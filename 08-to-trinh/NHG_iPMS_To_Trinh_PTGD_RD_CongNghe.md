<!-- Thể thức văn bản hành chính (Nghị định 30/2020/NĐ-CP). Bản trình ký: NHG_iPMS_To_Trinh_PTGD_RD_CongNghe.html (A4, Times New Roman). -->

<!-- Ô cơ quan (góc trái) đặt LOGO Tập đoàn NHG thay cho dòng chữ tên tập đoàn. -->

| | |
|---|---|
| ![Logo Tập đoàn Giáo dục Nguyễn Hoàng](../design-system/public/logo.png) | **CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM** |
| **BAN DỰ ÁN NỀN TẢNG iPMS** | **Độc lập - Tự do - Hạnh phúc** |
| ¯¯¯¯¯¯¯¯¯ | ¯¯¯¯¯¯¯¯¯¯¯¯¯ |
| Số: ......./TTr-iPMS | *TP. Hồ Chí Minh, ngày ...... tháng ...... năm 2026* |

<br>

<div align="center">

# TỜ TRÌNH
### Về việc báo cáo tiến độ, đề xuất nguồn lực và lộ trình triển khai Nền tảng Quản trị Hiệu suất Thông minh (iPMS)

</div>

<br>

**Kính gửi:** Phó Tổng Giám đốc phụ trách Ban Nghiên cứu, Phát triển và Ứng dụng Công nghệ.

Căn cứ định hướng chiến lược chuyển đổi số và ứng dụng trí tuệ nhân tạo (AI-First) của Tập đoàn;

Căn cứ các đặc tả kỹ thuật, thiết kế và kế hoạch – ngân sách của Dự án đã được xây dựng;

Thực hiện chủ trương xây dựng Nền tảng Quản trị Hiệu suất Thông minh (iPMS) dùng chung cho toàn Tập đoàn,

Ban Dự án Nền tảng iPMS kính trình Phó Tổng Giám đốc báo cáo tiến độ triển khai và đề xuất một số nội dung như sau:

---

## I. BỐI CẢNH VÀ MỤC TIÊU

**1. Bối cảnh.** Tập đoàn có nhu cầu về một lớp vận hành hiệu suất thống nhất, chuẩn hóa cho hệ sinh thái đa ngành, đa đơn vị. Trên cơ sở kế thừa nghiệp vụ quản trị KPI hiện hữu và các đặc tả kỹ thuật đã hoàn thiện, Dự án được triển khai theo hai chủ trương cốt lõi: (i) xây dựng nền tảng **cấu hình linh hoạt** (config-driven, tailor-made) để nhiều đơn vị dùng chung một hệ thống mà không phải tách bản riêng; (ii) đưa **tác nhân trí tuệ nhân tạo (AI Agent)** tham gia trực tiếp vào quá trình xây dựng.

**2. Mục tiêu.**

a) **Một nền tảng – nhiều đơn vị:** chuẩn hóa quản trị mục tiêu (OKR → KGI → KPI), đánh giá đa chiều, hiệu chỉnh và kết nối bảng lương; mỗi đơn vị thành viên tự cấu hình thay vì tách bản riêng.

b) **Con người dẫn dắt – trí tuệ nhân tạo hỗ trợ:** mọi quyết định trọng yếu (chấm điểm, tính lương, duyệt cấu hình) đều có người thật quyết định ở khâu cuối.

c) **Quản trị được – an toàn – có vết:** cô lập dữ liệu theo đơn vị là mặc định; mọi thay đổi đều được ghi nhật ký không thể sửa xóa.

---

## II. KẾT QUẢ TRIỂN KHAI ĐẾN NAY

**1. Phương pháp thực hiện (điểm nhấn về ứng dụng công nghệ).**

Điểm khác biệt của Dự án không chỉ nằm ở sản phẩm, mà ở chính phương pháp tạo ra sản phẩm:

a) **Tác nhân trí tuệ nhân tạo giữ vai trò kiến trúc sư trưởng xây dựng.** Toàn bộ hệ thống phía sau (backend) và giao diện cấu hình được xây dựng bởi một AI Agent vận hành tự chủ có kiểm soát, tuân thủ một bộ nguyên tắc kỹ thuật và các lằn ranh an toàn (RED-LINE) do Tập đoàn đặt ra.

b) **Kiểm định đối kháng độc lập.** Mỗi phần việc đều được một tác nhân kiểm định độc lập (tách vai với bên xây dựng) rà soát theo tư duy tấn công, phát hiện và chặn các lỗi nghiêm trọng trước khi hợp nhất mã nguồn. Cơ chế này đóng vai trò như một chốt kiểm soát chất lượng thường trực.

c) **Minh chứng thực tế cho chiến lược AI-First.** Dự án không chỉ ứng dụng trí tuệ nhân tạo, mà sử dụng trí tuệ nhân tạo để tạo ra tài sản công nghệ thật, với chi phí và thời gian giảm đáng kể (chi tiết tại Mục IV). Đây là mô hình quản trị ứng dụng AI có thể nhân rộng cho các dự án công nghệ khác.

**2. Các phân hệ đã hoàn thành.**

| Giai đoạn | Nội dung đã xây dựng | Trạng thái |
|---|---|:---:|
| Giai đoạn 0 – Nền tảng | Đa đơn vị (multi-tenant); cô lập dữ liệu ở mức bản ghi theo nguyên tắc chặn mặc định; phân quyền theo vai trò và phạm vi; nhật ký kiểm toán không thể sửa xóa; cờ điều khiển tính năng. | Hoàn thành |
| Giai đoạn 1 – Lõi KPI và chiến lược | Từ điển KPI (công thức có phiên bản, bất biến, có duyệt); bộ máy chấm điểm an toàn (bậc thang điểm, tổng trọng số bằng 100); thẻ điểm; phân rã mục tiêu OKR → KGI → KPI kèm tổng hợp sức khỏe mục tiêu; kho minh chứng chống trùng lặp. | Hoàn thành |
| Giai đoạn 2 – Trọn vòng đánh giá | Cập nhật tiến độ → tự đánh giá và đánh giá của quản lý → tính điểm (chốt phiên bản) → phòng cân chỉnh → chốt kết quả (có người duyệt) → kết xuất sang bảng lương. | Hoàn thành |
| Giai đoạn 3 – Nền tự cấu hình và AI | Xưởng cấu hình (cấu hình quản lý như dữ liệu có phiên bản: nháp → so sánh → phát hành → hoàn tác; bộ nhận diện thương hiệu; bộ máy tự suy diễn kéo theo KPI và tác vụ; thiết kế quy trình; trung tâm tích hợp). Khung ứng dụng AI (cổng AI, máy chủ kết nối công cụ, bộ đánh giá chất lượng) đã sẵn sàng, hiện chạy ở chế độ giả lập, sẽ kết nối mô hình thật khi được cấp khóa. Cơ chế quản trị bằng mã. Cổng để đơn vị tự soạn thư viện tác vụ. | Hoàn thành |
| Mô-đun Từ điển Tác vụ | Nạp 815 tác vụ chuẩn hóa và 20 chỉ số KPI chuẩn; ủy quyền phân cấp (trưởng phòng cấp quyền cho nhân viên); vòng lặp tối ưu liên tục (tác vụ được góp ý → mở lại → chỉnh sửa → duyệt → nâng phiên bản, lưu lịch sử bất biến); màn tra cứu toàn hệ thống đã đưa vào sử dụng. | Đang hoàn thiện giao diện |

**3. Điểm nhấn kiến trúc và công nghệ.**

a) **Cấu hình linh hoạt (config-driven tailor-made):** 8 đơn vị thành viên dùng chung một nền, tự cấu hình thương hiệu, cơ cấu và quy trình mà không phải tách mã nguồn, qua đó giảm mạnh chi phí sở hữu và tăng tốc mở rộng.

b) **Sáu nền tảng công nghệ tiên tiến đã kích hoạt:** cấu hình quản lý như dữ liệu có phiên bản; quản trị chính sách bằng mã; máy chủ kết nối công cụ AI (chuẩn MCP); tích hợp liên hệ thống kèm hộp thư gửi tin cậy; bộ đánh giá chất lượng AI; cờ điều khiển tính năng.

c) **An toàn theo thiết kế:** cô lập dữ liệu mặc định; tách vai bất khả xâm phạm (người soạn khác người duyệt); người thật quyết định ở khâu cuối; nhật ký bất biến.

d) **Tài sản tri thức số:** Từ điển Tác vụ (815 tác vụ) và 20 KPI chuẩn tạo thành bản đồ nghiệp vụ được số hóa, dùng lại được cho tự động hóa và phân tích trong toàn Tập đoàn.

**4. Kết quả kiểm thử và chất lượng.**

a) **290/290 trường hợp kiểm thử tự động đạt** (117 kiểm thử đơn vị và 173 kiểm thử tích hợp trên cơ sở dữ liệu thật), bao gồm các tình huống rò rỉ dữ liệu chéo đơn vị, leo thang quyền, tranh chấp truy cập đồng thời và tính bất biến của lịch sử.

b) **Kiểm định đối kháng độc lập** ở mỗi phần việc; các lỗi nghiêm trọng đều được chặn và khắc phục trước khi hợp nhất, có hồ sơ truy vết đầy đủ.

c) **Kỷ luật lằn ranh an toàn (RED-LINE):** tác nhân AI không tự ý thực hiện các hành động rủi ro cao (chi tiền, đẩy dữ liệu thật ra hệ thống ngoài, xóa dữ liệu vận hành) mà luôn dừng lại và xin ý kiến lãnh đạo.

---

## III. GIÁ TRỊ VÀ HIỆU QUẢ

**1. Về nghiên cứu, phát triển và ứng dụng công nghệ.** Dự án là minh chứng thực chiến cho chiến lược AI-First: sử dụng tác nhân AI để tạo ra phần mềm doanh nghiệp thật, có kiểm soát chất lượng; hình thành một mô hình quản trị ứng dụng AI có thể nhân rộng; đồng thời chuẩn hóa và tài sản hóa dữ liệu nghiệp vụ, làm nền cho tự động hóa và các sản phẩm AI kế tiếp.

**2. Về vận hành và kinh doanh.** Mục tiêu rút ngắn khoảng 40% thời gian dựng thẻ điểm cho một đơn vị và giảm khoảng 30% công nhập liệu nhờ tự suy diễn và tích hợp; một nền tảng dùng chung cho 8 đơn vị giúp đồng nhất quản trị và bảo đảm dữ liệu hiệu suất xuyên suốt từ Tập đoàn đến cá nhân.

---

## IV. NGÂN SÁCH VÀ HIỆU QUẢ ĐẦU TƯ

*(Đơn vị: triệu đồng; tham chiếu USD theo tỷ giá 25.000 đồng/USD. Chi tiết tại tài liệu Ngân sách Xây dựng và Vận hành Nền tảng iPMS.)*

| Hạng mục | Phương án truyền thống | Phương án ứng dụng AI Agent (khuyến nghị) | Ghi chú |
|---|---:|---:|---|
| Chi phí xây dựng (một lần) | khoảng 9.900 / 13 tháng | **khoảng 5.935 (≈235 nghìn USD) / 8 tháng** | giảm khoảng 40% chi phí, 38% thời gian |
| Chi phí vận hành năm ổn định (đủ 8 đơn vị) | khoảng 7.200/năm | **khoảng 6.600 (≈260 nghìn USD)/năm** | đội vận hành tinh gọn hơn |
| Tổng chi phí sở hữu 3 năm | khoảng 28.800 | **khoảng 22.000 (≈870 nghìn USD)** | xây dựng và 3 năm vận hành |

Phương án triển khai nén trong 6 tuần (giảm rủi ro tối đa): đưa bản thí điểm tại đơn vị H.01 vào vận hành với chi phí khoảng **2.040 triệu đồng (≈82 nghìn USD)**, cho phép nhìn thấy giá trị thực tế trước khi cam kết ngân sách mở rộng. Chi phí hạ tầng lõi (trung tâm dữ liệu, nền tảng định danh, Entra ID) do Holding/Ban B3 đầu tư, không tính vào ngân sách Dự án iPMS.

---

## V. NHỮNG NỘI DUNG KÍNH TRÌNH PHÊ DUYỆT VÀ XIN Ý KIẾN

| TT | Nội dung | Đề xuất của Ban Dự án |
|:---:|---|---|
| 1 | Chủ trương tiếp tục triển khai theo phương án ứng dụng AI Agent và phương án nén 6 tuần để đưa bản thí điểm H.01 vào vận hành. | Kính đề nghị **phê duyệt**. |
| 2 | Cấp khóa truy cập dịch vụ mô hình AI (Claude/Anthropic) và trần ngân sách để kích hoạt lớp AI thật (hiện đang chạy giả lập). | Cấp khóa; trần khởi điểm khoảng **50 USD/tháng** cho môi trường phát triển – kiểm thử, dùng mô hình tối ưu chi phí. |
| 3 | Cấp tài khoản kết nối thử nghiệm (sandbox) với Notion và Microsoft Graph (Planner/To-Do) để kiểm chứng luồng đồng bộ công việc hai chiều. | Cấp tài khoản môi trường thử; chưa đẩy dữ liệu thật. |
| 4 | Cho ý kiến về một số chính sách vận hành: (a) nhân viên có được xem điểm trước khi chốt kết quả hay không; (b) định nghĩa "KPI hợp lệ" trong cơ chế chặn cứng. | Chốt theo định hướng của Ban B1; giá trị mặc định đã được cấu hình, có thể điều chỉnh nhanh. |
| 5 | Xác nhận khả năng mở giao diện lập trình (API) của các hệ thống mua ngoài: AIC, Salesforce, phần mềm CRM tuyển sinh. | Kính đề nghị giao Ban Công nghệ/B3 xác nhận sớm; trường hợp chưa mở, sử dụng phương án dự phòng qua tập tin CSV/ETL. |

*Các nội dung số 2 và số 3 thuộc nhóm lằn ranh an toàn: tác nhân AI đã chủ động tạm dừng và chờ quyết định của lãnh đạo, không tự ý thực hiện.*

---

## VI. LỘ TRÌNH TRIỂN KHAI TIẾP THEO

1. **Trước mắt (đang thực hiện):** hoàn thiện giao diện Từ điển Tác vụ (bảng điều khiển cấp phòng: ủy quyền, duyệt, mở lại; lịch sử phiên bản; góp ý).

2. **Đưa bản thí điểm H.01 vào vận hành (khoảng 6 tuần):** vận hành trọn vòng quản trị hiệu suất thật; kích hoạt lớp AI và các kết nối tích hợp (phụ thuộc nội dung số 2 và số 3 tại Mục V).

3. **Trung hạn:** kết nối dữ liệu tuyển sinh và vận hành; hoàn thiện Hệ Quản trị ba tầng; xây dựng Bảng điều khiển cấp Tập đoàn (phụ thuộc nội dung số 5).

4. **Dài hạn:** nhân rộng ra 8 đơn vị thành viên trên cùng một nền, không tách mã nguồn; đưa các tác nhân AI nghiệp vụ vào vận hành.

---

## VII. KIẾN NGHỊ

Nền tảng iPMS đã đạt trạng thái vững về kỹ thuật, có bằng chứng chất lượng rõ ràng, đồng thời là minh chứng thực chiến cho năng lực ứng dụng công nghệ và trí tuệ nhân tạo của Tập đoàn. Để chuyển từ giai đoạn xây dựng sang giai đoạn tạo giá trị vận hành thực tế, Ban Dự án kính đề nghị Phó Tổng Giám đốc:

1. Phê duyệt chủ trương tiếp tục triển khai theo phương án ứng dụng AI Agent và phương án nén 6 tuần đưa bản thí điểm H.01 vào vận hành;

2. Cấp các nguồn lực chốt chặn: khóa truy cập dịch vụ AI kèm trần ngân sách; tài khoản kết nối thử nghiệm;

3. Cho ý kiến về các nội dung chính sách nêu tại Mục V và giao Ban Công nghệ/B3 xác nhận khả năng mở giao diện lập trình của các hệ thống bên thứ ba.

Kính trình Phó Tổng Giám đốc xem xét, quyết định./.

<br>

| | |
|---|---|
| **Nơi nhận:** | **TRƯỞNG BAN DỰ ÁN iPMS** |
| - Như trên; | |
| - Ban B3, Ban B1 (để phối hợp); | *(Ký, ghi rõ họ tên)* |
| - Lưu: VT, Ban Dự án iPMS. | |

---

> *Tài liệu kèm theo: (1) Đặc tả và Thiết kế kỹ thuật iPMS; (2) Ngân sách Xây dựng và Vận hành; (3) Nhật ký quyết định và tồn đọng (OWNER_DIGEST); (4) Trạng thái dự án (STATUS).*
