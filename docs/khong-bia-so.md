---
type: convention
title: Không bịa số, không giữ mock sau khi nối API thật
description: Vì sao "số trông-như-thật" nguy hiểm hơn mock, và ba lần cùng một họ lỗi
tags: [product, data-integrity]
verified: 2026-08-06
sources: [OWNER_DIGEST.md]
---
Màn nào chưa có dữ liệu thật thì nêu rõ **phần chưa xây và cần gì để có**,
không dựng số minh hoạ. Giữ khối mock lại sau khi nối API thật biến nó thành
*số trông-như-thật* — nguy hiểm hơn hẳn lúc còn là mock ai cũng biết là mock.

Bốn khối đã xoá ở trục A: skill-gap L1–L5 + khoá iLMS + mentor · nhật ký
coaching có nút không lưu được gì · 9-box đặt sẵn tên người vào đủ 9 ô dù không
có trục tiềm năng · "nguy cơ nghỉ việc" + "khoảng trống kế nhiệm" kèm tên người
và % — loại số dễ bị dùng cho quyết định nhân sự nhất.

Cùng họ lỗi lặp ba lần ở phía AI: đếm lượt eval (F163) · chú thích sai về NULL
(F191) · agent bịa do test đẻ làm 100% chi phí báo cáo là giả. Bài học chung:
**bộ lọc phải dựa trên danh tính đăng ký, không dựa trên đoán tiền tố tên.**
Sửa bằng cách thêm một tiền tố nữa là lặp lại chính sai lầm cũ.

Dữ liệu demo đánh dấu bằng quy ước định danh (`employee_code` tiền tố
`H.01-DEMO-`, tên bản ghi tiền tố `[DEMO]`) và `--purge` gỡ sạch; vết trong
`audit_log` ở lại vì bảng append-only.

Liên quan: [kiem-chung-song.md](kiem-chung-song.md), [so-dang-ky-du-lieu.md](so-dang-ky-du-lieu.md)
