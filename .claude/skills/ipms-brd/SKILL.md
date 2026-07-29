---
name: ipms-brd
description: Soạn Tài liệu Yêu cầu Nghiệp vụ (BRD) cho khách hàng quan tâm Nền tảng iPMS - từ phiếu khách tự khai hoặc biên bản khảo sát thành yêu cầu BR truy vết, đối chiếu năng lực (fit-gap) và bản A4 song ngữ trình khách ký. Dùng khi cần "BRD", "tài liệu yêu cầu nghiệp vụ", "khảo sát khách hàng iPMS", "fit-gap", "phiếu khảo sát khách hàng", "hồ sơ yêu cầu cho khách".
---

# BRD — Tài liệu Yêu cầu Nghiệp vụ

## ⚠️ Hai loại BRD — chọn đúng loại trước khi làm bất cứ gì

| | **BRD khách hàng** (nội dung chính của skill này) | **BRD nền tảng** |
|---|---|---|
| Trả lời câu hỏi | Khách hàng này cần gì? | Xây iPMS thành cái gì? |
| Người đọc | Tổ chức khách hàng, ký xác nhận | Ban Điều hành, các khối V1/B0/B1/B2/B3/B5 |
| Hàng rào nội bộ | **BẬT** — không nhắc tên NHG, khối chức năng, trạng thái xây dựng | **TẮT** — là tài liệu nội bộ, bắt buộc nhắc |
| Nguồn | `03-yeu-cau/ho-so.json` từ khuôn `templates/ho-so.mau.json` | `templates/brd-nen-tang.mau.json` |
| Bộ sinh file | `scripts/xuat-ho-so.py` | `scripts/xuat-brd-nen-tang.py` |
| Hồ sơ | `12-khach-hang/{NĂM}/{MÃ-KH}/` | `02-dac-ta/BRD-Nen-Tang/` |

**Dùng nhầm loại là sự cố:** chạy bộ sinh file khách hàng trên dữ liệu nền tảng sẽ bị hàng rào chặn (đúng); chạy ngược lại thì **không có gì chặn** và ghi chú nội bộ sẽ ra tới khách. Kiểm tên script trước khi chạy.

**Bản trống để điền** — cùng bộ sinh file, thêm cờ `--trong`:

```bash
py .claude/skills/ipms-presales-common/scripts/xuat-brd-nen-tang.py \
   .claude/skills/ipms-presales-common/templates/brd-nen-tang.mau.json \
   --trong --dong-trong 8 --out <thư-mục>
```

Bản trống giữ nguyên khung 18 mục và 13 sheet, xoá mọi câu trả lời, giữ lại phần **khung gợi ý** (12 câu hỏi bắt buộc, 8 mắt xích chuỗi truy vết, danh mục module, tên nhóm phi chức năng, giai đoạn lộ trình), thêm dòng `▸ Cần điền` cho từng mục và ô/dòng trống để viết. Sinh từ **cùng một nguồn** với bản đã điền nên hai bản không bao giờ lệch cấu trúc — sửa khung ở một chỗ, cả hai cùng đổi.

Danh sách khoá được giữ lại khi làm trống nằm trong hằng `GIU` của script; thêm mục khung mới thì khai vào đó, nếu không nó sẽ bị xoá sạch ở bản trống.

BRD nền tảng lấy trục từ `00-boi-canh/NHG_Strategic_Context_v0_1.md`: mười hai câu hỏi bắt buộc (§10), ranh giới AI được phép / không được phép (§9.3), bốn mức phân loại dữ liệu và danh mục governance (§7). **Mục 4 của tài liệu đó là LÕI: Từ điển Tác vụ gắn KPI** — mọi module khác tồn tại để phục vụ hoặc khai thác lõi này; cắt phạm vi thì cắt thứ khác trước.

---

## BRD khách hàng

NHG ở vai **nhà cung cấp**; khách hàng là tổ chức có nhu cầu về quản trị hiệu suất.

**Đọc trước khi làm bất cứ việc gì:**
- `../ipms-presales-common/quy-uoc.md` — mã khách hàng, cây hồ sơ, **hàng rào nội bộ ↔ trình khách (§5)**
- `../ipms-presales-common/so-nang-luc-ipms.md` — nguồn sự thật DUY NHẤT cho câu "iPMS đáp ứng…"
- `../ipms-presales-common/thang-do.md` — MoSCoW, 5 mức fit, mức trưởng thành, phân loại dữ liệu
- `11-khao-sat-yeu-cau/NHG_iPMS_BA_Discovery_Playbook.html` — bộ câu hỏi 13 phân hệ A–M (nguồn của hệ mã `BR-{A..M}-nn`)

Template: `../ipms-presales-common/templates/`.

## Khởi tạo hồ sơ khách

Chưa có thì tạo `12-khach-hang/{NĂM}/{MÃ-KH}/01..05` theo quy ước, kèm `01-tiep-can/thong-tin-khach.md` (pháp nhân, ngành, quy mô nhân sự, số đơn vị, sponsor theo **chức danh**, đầu mối, ngày ký NDA, kênh liên lạc).

## Quy trình

### Bước 1 — Nạp đầu vào

Hai kênh, dùng một hoặc cả hai:

**① Phiếu khách tự khai** — gửi `12-khach-hang/00-tai-san-ban-hang/phieu-khach-tu-khai.html` (bản trắng, self-contained, chỉ gồm ~30 câu ★ bắt buộc). Khách điền trên trình duyệt → in PDF hoặc bấm "Xuất câu trả lời" gửi lại → lưu vào `01-tiep-can/`.
Phiếu tự khai **không thay thế** phỏng vấn: nó rút ngắn vòng 1 và giúp chuẩn bị câu đào sâu. Câu trả lời từ phiếu ghi nguồn là `TK` (tự khai).

**② Biên bản khảo sát** — chạy playbook theo 4 vòng (① lãnh đạo & sponsor: A, B, M · ② nhân sự & chuyên gia hiệu suất: C, D, E, F · ③ trưởng phòng & nghiệp vụ: E, G, J · ④ CNTT/an ninh/pháp chế: H, I, K, L). Mỗi buổi một file `02-khao-sat/BB-{nn}-vong{k}-{nhóm}.md` theo `templates/bien-ban-khao-sat.md`.

**Bằng chứng thật là bắt buộc.** Với phân hệ E và F, không có file KPI thật của ≥2 phòng ban và bảng quy đổi điểm thì **không** viết yêu cầu cho hai phân hệ đó — ghi vào §15 Câu hỏi mở. Bằng chứng lưu `02-khao-sat/bang-chung/BC-{nn}-....` và chỉ được **trỏ mã**, không nhúng nội dung nhạy cảm vào BRD.

### Bước 2 — Chuẩn hoá câu trả lời thành yêu cầu `BR`

Một câu trả lời khảo sát **không phải** một yêu cầu. Chuyển hoá theo mẫu:

> `BR-{PHÂN HỆ}-{nn}` · **Phát biểu yêu cầu** (một câu, chủ ngữ là "Hệ thống phải…") · **Vì sao** (nhu cầu nghiệp vụ đứng sau) · **Tiêu chí chấp nhận** (đo được, kiểm chứng được khi nghiệm thu) · **Nguồn** (`BB-03 Q4` hoặc `TK-Q12`, kèm mã bằng chứng `BC-nn`) · **MoSCoW**

Ví dụ chuyển hoá đúng:

| Câu khảo sát | ✗ Viết sai | ✓ Yêu cầu đúng |
|---|---|---|
| "KPI có cấu trúc cha–con không?" → *"Có, KPI doanh thu gồm 3 KPI con"* | "Hỗ trợ KPI cha–con" | **BR-E-03** — Hệ thống phải cho phép định nghĩa KPI tổng hợp từ ≥2 KPI thành phần, mỗi thành phần có trọng số riêng, tổng trọng số = 100%. *Chấp nhận:* dựng lại đúng KPI "Doanh thu tuyển sinh" (BC-02) gồm 3 thành phần và điểm tính ra khớp bảng tính hiện hành ±0,5 điểm. *Nguồn:* BB-03 Q2, BC-02. *MoSCoW:* M |

Luật:
- **Mọi `BR` phải truy vết về ít nhất một câu trả lời có bằng chứng.** Không có yêu cầu "cho có", không suy diễn hộ khách.
- Không đưa giải pháp vào yêu cầu. Viết *"phải phân tách người soạn và người duyệt KPI"*, không viết *"phải dùng sod_rule của iPMS"*.
- Thiếu thông tin thì **không bịa**: chèn `⟪CHỜ KHÁCH: <câu hỏi cụ thể>⟫` ngay tại chỗ và nhân bản sang §15. Một BRD phát hành được phép còn `⟪CHỜ KHÁCH⟫`, nhưng **không** ở yêu cầu mức `M`.
- Yêu cầu phi chức năng vẫn dùng mã phân hệ `BR-L-nn` — không tạo hệ mã song song.

### Bước 3 — Đối chiếu năng lực, xác định khoảng trống

Với mỗi `BR`, tra `so-nang-luc-ipms.md` → gán **một** trong 5 mức fit (`thang-do.md` §2). Quy tắc:

- Không tìm thấy dòng năng lực tương ứng ⇒ **Cần phát triển** hoặc **Ngoài phạm vi**. Không được suy đoán "chắc là có".
- Sổ năng lực cũ hơn **30 ngày** ⇒ đọc lại `STATUS.md` + `OWNER_DIGEST.md`, ghi ngày đối chiếu vào BRD §12.
- `M` × (Cần phát triển | Ngoài phạm vi) ⇒ mở ngay một mục `RR-nn` mức **Cao** ở §14.
- Mức **Sẵn sàng — cần kích hoạt** luôn kéo theo một dòng ở §13 Phụ thuộc (khách phải cấp gì: token, tenant Azure, quyền truy cập hệ nguồn, hạ tầng).

Kết quả ghi hai bản (`templates/fit-gap.md`):
- `04-fit-gap/fit-gap-noi-bo.md` — ⛔ có ước lượng ngày công, rủi ro thương mại, ghi chú nội bộ từ sổ năng lực.
- `04-fit-gap/fit-gap-trinh-khach.md` — chỉ mức fit + mô tả khoảng trống + phương án, **không** ngày công nội bộ, **không** ghi chú nội bộ.

### Bước 4 — Ma trận truy vết

`03-yeu-cau/ma-tran-truy-vet.md` theo `templates/ma-tran-truy-vet.md`. Đây là xương sống kiểm chứng chất lượng BRD: mỗi dòng `BR-id · nguồn · bằng chứng · MoSCoW · mức fit · năng lực iPMS · tiêu chí chấp nhận · gap`.

Ba phép kiểm bắt buộc chạy trên ma trận trước khi soạn BRD:
1. **Không mồ côi** — mọi `BR` có nguồn; mọi câu ★ trong playbook đã hỏi đều đã sinh ra `BR` hoặc được ghi "không áp dụng, lý do…".
2. **Không rỗng** — mọi `BR` mức `M` có tiêu chí chấp nhận đo được.
3. **Không lệch** — mọi mức fit trỏ về đúng một dòng trong sổ năng lực.

### Bước 5 — Kết tinh vào `ho-so.json` rồi sinh bộ hồ sơ

**Một nguồn, nhiều đầu ra.** Toàn bộ nội dung BRD nằm trong `03-yeu-cau/ho-so.json` (khuôn: `templates/ho-so.mau.json`). Không soạn song song bản Word thủ công — mọi sửa đổi sửa ở JSON rồi sinh lại, nếu không sẽ có hai nguồn sự thật và chúng sẽ lệch nhau.

Ghi chú nội bộ để trong khoá `_noibo` của từng yêu cầu (mức nền tảng, ngày công, rủi ro thương mại). **Bộ sinh file loại bỏ mọi khoá bắt đầu bằng `_` trước khi dựng tài liệu** — không có đường nào để chúng chảy ra bản gửi khách.

```bash
py .claude/skills/ipms-presales-common/scripts/xuat-ho-so.py 12-khach-hang/{NĂM}/{MÃ-KH}/03-yeu-cau/ho-so.json
```

Sinh ra bộ hai file gửi khách:

| File | Vai trò | Vì sao định dạng này |
|---|---|---|
| `01_BRD_{MÃ-KH}_{v}.docx` | Tài liệu chính, 15 mục | Khách rà bằng Track Changes và comment — thứ PDF không làm được |
| `02_Phu_luc_{MÃ-KH}_{v}.xlsx` | 7 sheet, khách ghi ý kiến trực tiếp | Lọc, đếm, chốt ưu tiên tại chỗ trong buổi làm việc |

15 mục của bản .docx (thứ tự do bộ sinh file quy định — đây là nguồn sự thật, đừng chép tay ra chỗ khác):

| # | Mục | # | Mục |
|---|---|---|---|
| 1 | Thông tin tài liệu | 9 | **Kiến trúc tác vụ & Từ điển Tác vụ** |
| 2 | Bối cảnh & động cơ | 10 | AI & quản trị AI |
| 3 | Mục tiêu kinh doanh & tiêu chí thành công | 11 | Báo cáo & phân tích |
| 4 | Phạm vi trong / ngoài | 12 | Phi chức năng, bảo mật & tuân thủ |
| 5 | Các bên liên quan & nhóm người dùng | 13 | Đối chiếu năng lực & khoảng trống |
| 6 | Hiện trạng (as-is) | 14 | Giả định · Ràng buộc · Phụ thuộc · Rủi ro |
| 7 | Yêu cầu nghiệp vụ `BR` | 15 | Câu hỏi mở, bước tiếp theo & khối ký |
| 8 | Hệ nguồn dữ liệu & tích hợp | | |

7 sheet của phụ lục: `00` hướng dẫn đọc · `01` danh mục yêu cầu (có cột **Ý kiến của Quý vị** + **Kết luận** chọn từ danh sách) · `02` chốt ưu tiên (COUNTIFS sống, khách sửa sheet 01 thì số tự đổi) · `03` khoảng trống · `04` **kiến trúc tác vụ** (40 dòng trống để khách bổ sung) · `05` hệ nguồn dữ liệu · `06` câu hỏi mở.

Giọng văn: mô tả **nhu cầu của khách**, không phải quảng cáo sản phẩm. Mục 13 là chỗ duy nhất nói về năng lực iPMS.

**Bản ký cuối** (tuỳ chọn): khi cần bìa thương hiệu đẹp cho bản ký, dựng thêm `BRD_{MÃ-KH}_v{n}.html` từ `templates/brd-a4.html` rồi in PDF. Lưu ý file HTML này **không** sinh từ `ho-so.json` — dùng thì phải tự đồng bộ nội dung, nên chỉ dùng cho bản chốt cuối. Không cần bìa riêng thì xuất PDF thẳng từ file .docx.

### Bước 5b — Từ điển Tác vụ trong hồ sơ khách

Mục 9 và sheet `04` không phải phần phụ. Với phần lớn khách, đây là **thứ họ chưa từng có**: công việc thật của từng vị trí được mô tả chuẩn hoá và gắn chỉ số, nhờ đó kết quả đánh giá giải thích được bằng việc làm có thật thay vì cảm tính.

Cách khai thác trong khảo sát:
- Xin bản mô tả công việc hiện hành (`BC-nn`) và bảng phân công của 2–3 phòng ⇒ nạp thành các dòng `kien_truc_tac_vu.dong[]`, mỗi dòng gắn một `ma_kpi` khớp với yêu cầu phân hệ E.
- Tác vụ chưa gắn được chỉ số ⇒ **giữ nguyên trong bảng, để trống mã chỉ số**. Đó chính là bằng chứng trực quan cho khách thấy khoảng trống đo lường của họ — đừng lấp bằng chỉ số bịa.
- Sheet `04` chừa 40 dòng trống có sẵn danh sách trạng thái để khách tự bổ sung; bản khách gửi lại là đầu vào để dựng Từ điển Tác vụ khi triển khai.

⚠️ **Không gửi kèm bản Từ điển Tác vụ đang chạy nội bộ** (`06-tu-dien-tac-vu/`) — nó chứa dữ liệu tổ chức thật. Cần demo thì dựng bản mẫu trung lập riêng.

### Bước 6 — ⛔ Rà hàng rào trước khi phát hành

Chạy đủ 7 mục, không bỏ mục nào:

1. **Với .docx/.xlsx: bộ sinh file đã gác.** Nó loại khoá `_` theo cấu trúc, chặn cứng dấu vết nội bộ (không ghi file nếu dính), và in cảnh báo cho từ nhập nhằng — `ngày công`, `đơn giá`, `chi phí triển khai`. Cảnh báo **không** chặn vì cụm đó hợp lệ khi đang mô tả điểm đau của khách ("mất 3–5 ngày công mỗi kỳ"); việc của người thật là liếc từng chỗ và xác nhận nó là lời của khách, không phải ước lượng của mình.

   Với file HTML dựng tay, chạy tay:

   ```bash
   grep -v 'base64' <file> | grep -niE '\bF[0-9]{2,3}\b|OWNER_DIGEST|STATUS\.md|Reviewer Agent|reviewer đối kháng|\bcommit\b|[0-9]+/[0-9]+ (PASS|test)|OneOffice|Bravo|\bH\.01\b|\bOpCo\b|Nguyễn Hoàng|ngân sách nội bộ|trđ'
   ```

   *Vì sao viết thế:* lọc dòng `base64` trước (logo nhúng chứa đủ mọi chuỗi ngẫu nhiên); `F[0-9]{2,3}` chứ không phải `F[0-9]+` để không bắt nhầm mã màu hex và mã câu hỏi phân hệ F1–F9; bắt `Reviewer Agent` chứ không bắt chữ `reviewer` (xuất hiện hợp lệ trong "Customer reviewer").

   ⚠️ **.docx và .xlsx mang theo hành lý vô hình mà grep không thấy:** thuộc tính tác giả/công ty của file, comment còn sót, sheet ẩn, cột ẩn. Trước khi gửi: Word/Excel → *File · Info · Check for Issues · Inspect Document* → xoá Document Properties and Personal Information. Bộ sinh file không tạo sheet/cột ẩn, nhưng nếu bro mở ra sửa tay thì phải tự kiểm.
2. Đọc mắt thường phần văn xuôi: không có ngân sách/đơn giá nội bộ, red-line đang chờ, tên hệ thống nội bộ, tên khách hàng khác. Grep chỉ bắt được mẫu đã biết — mục này không thay thế được bằng lệnh.
3. Không có tên cá nhân — cả phía khách lẫn phía NHG. Chỉ chức danh.
4. Không có PII trong ví dụ/dữ liệu mẫu; số liệu trích từ bằng chứng đã khử danh.
5. Mọi phát biểu năng lực trỏ về được một dòng trong sổ năng lực; mọi mức **PT/NPV** đều hiện ở §12 và §14.
6. Con số ROI (nếu dùng) ghi rõ là **dải mục tiêu tham chiếu**, không phải kết quả đo tại khách.
7. File mở được độc lập: logo hiện, không lỗi đường dẫn, in A4 không vỡ.

Đạt đủ ⇒ ghi cuối file BRD: `<!-- ra-hang-rao: PASS {ngày} -->`. **Không có dòng này thì không gửi.**

### Bước 7 — Phát hành, ký, quản trị thay đổi

Gửi khách → tiếp nhận phản hồi → `brd-final.md` (`trang_thai: signed` sau khi ký). Bản đã ký **bất biến**. Thay đổi sau ký ⇒ `-v2` + một dòng trong `05-ban-giao/nhat-ky-thay-doi-pham-vi.md`: ngày · ai yêu cầu (chức danh) · `BR` bị ảnh hưởng · tác động ngày công/lộ trình · trạng thái duyệt.

## Nguyên tắc

- **Hàng rào là bất biến.** Nghi ngờ một câu có phải nội bộ không ⇒ để ở bản nội bộ. Rò một lần là mất niềm tin, không sửa lại được.
- **Bằng chứng trước, yêu cầu sau.** Không có file thật thì viết câu hỏi mở, không viết yêu cầu.
- **Không cam kết mốc thời gian trong BRD.** BRD chốt *cái gì*; *bao giờ* và *bao nhiêu* thuộc tài liệu đề xuất giải pháp, sau khi đã chốt danh sách hạng mục cần phát triển và phụ thuộc phía khách.
- **Con người quyết định cuối.** Skill soạn thảo và đối chiếu; phát hành, cam kết và ký luôn là người thật.
- BRD là tài liệu **của khách**: mô tả nhu cầu của họ bằng ngôn ngữ của họ. Phần bán hàng nằm ở mục 12 và ở tài liệu đề xuất riêng.
