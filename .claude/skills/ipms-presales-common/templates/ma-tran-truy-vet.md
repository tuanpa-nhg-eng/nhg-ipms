---
ma_kh: KH-{NĂM}-{nn}-{TÊNNGẮN}
loai: ma-tran
trang_thai: draft
pham_vi_luu_hanh: noi-bo
ngay_lap: {YYYY-MM-DD}
---

# Ma trận truy vết yêu cầu — {TÊN KHÁCH}

Xương sống kiểm chứng chất lượng BRD. ⛔ Bản nội bộ — cột "Năng lực iPMS" trích từ `so-nang-luc-ipms.md`.

## Ma trận

| BR | Yêu cầu (rút gọn) | Nguồn | Bằng chứng | MoSCoW | Mức fit | Năng lực iPMS đối ứng | Tiêu chí chấp nhận | Gap / Ghi chú |
|---|---|---|---|---|---|---|---|---|
| BR-E-01 | {…} | BB-03 Q2 | BC-02 | M | Sẵn sàng | E · Từ điển KPI cha–con | {…} | — |
| BR-H-02 | {…} | BB-05 Q1 | — | M | Cần phát triển | H · Kết nối ERP/CRM khách | {…} | RR-03 |

## Ba phép kiểm bắt buộc

Chạy trước khi soạn BRD, ghi kết quả vào đây.

### ① Không mồ côi
- [ ] Mọi `BR` có cột Nguồn ≠ rỗng.
- [ ] Mọi câu ★ (bắt buộc hỏi) của 13 phân hệ đã được hỏi và đã sinh `BR`, **hoặc** ghi rõ "không áp dụng — lý do".

**Câu ★ chưa có câu trả lời:**

| Phân hệ | Câu ★ | Lý do chưa có | Chặn BR nào |
|---|---|---|---|

### ② Không rỗng
- [ ] Mọi `BR` mức `M` có tiêu chí chấp nhận **đo được** (có số, có ngưỡng, hoặc có phép so sánh với bằng chứng thật).
- [ ] Không còn `⟪CHỜ KHÁCH⟫` trong bất kỳ `BR` mức `M` nào.

### ③ Không lệch
- [ ] Mọi mức fit trỏ về đúng một dòng trong `so-nang-luc-ipms.md`.
- [ ] Ngày đối chiếu sổ năng lực: {ngày} — nếu sổ cũ hơn 30 ngày, đã đọc lại `STATUS.md`: ☐ rồi.
- [ ] Mọi `M` × (Cần phát triển | Ngoài phạm vi) đã có `RR-nn` mức **Cao**.
- [ ] Mọi *Sẵn sàng — cần kích hoạt* đã có một dòng Phụ thuộc `PT-nn`.

## Thống kê

| Phân hệ | Số BR | M | S | C | W |
|---|---|---|---|---|---|
| A–M | | | | | |

Tỷ lệ `M` trên tổng: {…}% — *>60% ⇒ quay lại làm việc lại về ưu tiên với khách.*
