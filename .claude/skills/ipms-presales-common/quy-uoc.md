# Quy ước hồ sơ Tiền bán hàng iPMS (Presales)

Áp dụng cho mọi khách hàng tiềm năng của **Nền tảng iPMS** — NHG ở vai **nhà cung cấp**.

## 1. Mã khách hàng (Customer ID)

Định dạng: `KH-{NĂM}-{SỐ THỨ TỰ 2 chữ số}-{TÊN NGẮN}`

- Ví dụ: `KH-2026-01-VANLANG`, `KH-2026-02-HOASEN`
- TÊN NGẮN: viết hoa, không dấu, không khoảng trắng, ≤ 12 ký tự — lấy theo tên thương hiệu khách, không lấy tên pháp nhân dài.
- Một tập đoàn nhiều pháp nhân vẫn dùng **một mã**; các đơn vị con ghi trong BRD §4, không tách hồ sơ.

## 2. Cấu trúc thư mục hồ sơ (tính từ gốc dự án)

```
12-khach-hang/
├── 00-tai-san-ban-hang/                 # bản TRẮNG dùng lại cho mọi khách
│   ├── phieu-khach-tu-khai.html         # biểu mẫu khách tự điền (self-contained)
│   └── ho-so-nang-luc-rut-gon.html      # bản trình khách của sổ năng lực (nếu đã dựng)
└── {NĂM}/
    └── {MÃ-KH}/
        ├── 01-tiep-can/
        │   ├── thong-tin-khach.md       # pháp nhân, quy mô, sponsor, đầu mối, NDA
        │   └── phieu-tu-khai-da-dien.*  # bản khách gửi lại
        ├── 02-khao-sat/
        │   ├── BB-01-vong1-lanh-dao.md  # biên bản từng buổi, xem mục 4
        │   └── bang-chung/BC-01-....xlsx
        ├── 03-yeu-cau/
        │   ├── ho-so.json               # ★ NGUỒN DUY NHẤT — sinh ra 2 file dưới
        │   ├── ma-tran-truy-vet.md
        │   ├── 01_BRD_{MÃ-KH}_{v}.docx  # sinh ra, KHÔNG sửa tay
        │   └── 02_Phu_luc_{MÃ-KH}_{v}.xlsx
        ├── 04-fit-gap/
        │   ├── fit-gap-noi-bo.md        # ⛔ KHÔNG gửi khách
        │   └── fit-gap-trinh-khach.md
        └── 05-ban-giao/
            ├── brd-da-ky.pdf
            └── nhat-ky-thay-doi-pham-vi.md
```

## 3. Frontmatter tối thiểu

```yaml
---
ma_kh: KH-2026-01-VANLANG
loai: bien-ban | brd | ma-tran | fit-gap | thong-tin-khach
trang_thai: draft | reviewed | sent | signed
pham_vi_luu_hanh: noi-bo | trinh-khach        # BẮT BUỘC — quyết định hàng rào mục 5
nguoi_lap: <vai trò hoặc "Claude hỗ trợ, <vai trò> soát xét">
ngay_lap: 2026-07-28
---
```

**Bất biến:** file `trang_thai: signed` không sửa nội dung. Thay đổi sau khi ký → tạo `-v2` + ghi vào `nhat-ky-thay-doi-pham-vi.md` (ngày, ai yêu cầu, ảnh hưởng chi phí/lộ trình).

## 4. Đặt tên

| Loại | Định dạng | Ví dụ |
|---|---|---|
| Biên bản khảo sát | `BB-{nn}-vong{1..4}-{nhóm}.md` | `BB-03-vong2-hr.md` |
| Bằng chứng thu thập | `BC-{nn}-{mô-tả-ngắn}.{ext}` | `BC-02-bo-kpi-phong-tuyensinh.xlsx` |
| Yêu cầu nghiệp vụ | `BR-{PHÂN HỆ A..M}-{nn}` | `BR-E-03`, `BR-L-02` |
| Giả định · Ràng buộc · Rủi ro | `GD-{nn}` · `RB-{nn}` · `RR-{nn}` | `RR-04` |

Phân hệ A–M lấy **nguyên** từ `11-khao-sat-yeu-cau/NHG_iPMS_BA_Discovery_Playbook.html` — nhờ vậy mọi `BR` tự truy vết ngược về đúng phân hệ và câu hỏi đã hỏi.

## 5. ⛔ Hàng rào nội bộ ↔ trình khách (BẤT BIẾN)

Playbook đã ghi rõ ô "⟹ iPMS đối chiếu" là **ghi chú nội bộ của BA, không trình khách**. Hàng rào này rộng hơn thế:

**Không bao giờ được xuất hiện trong bất kỳ tài liệu `pham_vi_luu_hanh: trinh-khach` nào:**

- Số hiệu vé nội bộ (F1…F1xx), `OWNER_DIGEST.md`, `STATUS.md`, ảnh chụp tiến độ build, tên commit, kết quả test.
- Ngân sách build/vận hành nội bộ NHG, đơn giá nhân sự, so sánh chi phí nội bộ.
- Red-line đang chờ (API key, token, tenant Azure), blocker tích hợp của **khách khác** hoặc của NHG.
- Nợ kỹ thuật, lỗ hổng đã từng có, tên hệ thống nội bộ NHG (OneOffice, Bravo, H.01, tên OpCo) trừ khi nêu như case study **đã được duyệt**.
- Tên cá nhân: mọi tài liệu gọi theo **vai trò/chức danh**, không nêu tên người — với cả nhân sự NHG lẫn nhân sự khách.

**Nguồn duy nhất** được phép trích khi viết câu "iPMS đáp ứng…" là `so-nang-luc-ipms.md`. Không trích thẳng spec trong `02-dac-ta/`, không trích digest, không suy đoán từ mã nguồn.

Trước khi phát hành bản trình khách, chạy **rà hàng rào** (checklist ở `SKILL.md` §6) và ghi kết quả vào cuối file BRD dưới dạng dòng `<!-- ra-hang-rao: PASS 2026-07-28 -->`.

## 6. Bảo mật dữ liệu khách

- Dữ liệu khách thu thập (bộ KPI thật, công thức điểm→lương, sơ đồ tổ chức, danh sách nhân sự) là **Confidential**. Đóng dấu phân loại ở chân mọi trang.
- **Không** đưa PII vào BRD: không tên nhân viên, email, số điện thoại, mức lương cá nhân. Mẫu KPI trích dẫn phải khử danh (`Phòng A`, `vị trí P-03`).
- Bằng chứng file thô để trong `02-khao-sat/bang-chung/`, BRD chỉ **trỏ tới mã `BC-nn`**, không nhúng nội dung nhạy cảm.
- Có NDA trước khi nhận file thật — ghi ngày ký NDA vào `thong-tin-khach.md`.

## 7. Định dạng deliverable

| Tài liệu | Định dạng | Vì sao |
|---|---|---|
| Nguồn hồ sơ khách | **`ho-so.json`** | Một nguồn, nhiều đầu ra — không có bản Word soạn tay song song |
| BRD gửi khách rà soát | **`.docx`** sinh từ JSON | Khách rà bằng Track Changes và comment, thứ PDF không làm được |
| Phụ lục ma trận yêu cầu | **`.xlsx`** 7 sheet, sinh từ JSON | Lọc, đếm, chốt ưu tiên tại chỗ; khách ghi ý kiến vào cột dành riêng |
| Bản ký cuối (tuỳ chọn) | **HTML A4 song ngữ** → PDF | Khi cần bìa thương hiệu; nếu không thì xuất PDF thẳng từ .docx |
| Phiếu khách tự khai | **HTML self-contained** | Khách điền trên trình duyệt, không cần cài gì, không gửi dữ liệu đi đâu |
| Biên bản, ma trận, fit-gap nội bộ | **Markdown** | Đọc và diff trong git |

Bộ sinh file: `scripts/xuat-ho-so.py` (cần `python-docx` + `openpyxl`; máy không có pandoc, Python ở `AppData/Local/Programs/Python/Python313`).

**Bắt buộc self-contained** với mọi file gửi ra ngoài: logo nhúng data-URI (`templates/logo-data-uri.txt`), CSS inline, không tham chiếu `../design-system/`. File gửi khách là file rời — mọi đường dẫn tương đối đều vỡ.

Font Be Vietnam Pro nạp qua Google Fonts (`fonts.googleapis.com`) như các deliverable NHG khác; luôn khai báo fallback `system-ui, 'Segoe UI', Roboto, Arial` để bản in không vỡ khi khách offline.
