---
type: org-requirement
title: Nhịp làm việc với chủ dự án
description: Cổng duyệt kế hoạch, dừng báo cáo theo lát, OWNER_DIGEST, và Reviewer đối kháng
tags: [process, workflow]
verified: 2026-08-06
sources: [OWNER_DIGEST.md]
---
Kế hoạch là hợp đồng, không phải thủ tục: lập kế hoạch chi tiết L0–L7 → chủ dự
án duyệt → mới build. Kế hoạch chưa duyệt thì không viết dòng mã nào.

Build tuần tự theo lát. Nhịp dừng báo cáo được thoả thuận **trong** kế hoạch
từng trục (thường hết lát hợp đồng API và hết lát mốc demo). Hết lát: dừng,
ghi mục mới vào [OWNER_DIGEST.md](../OWNER_DIGEST.md), chờ phản hồi.

`OWNER_DIGEST.md` là kênh async duy nhất. Mỗi mục ghi: quyết định đã tự chốt ·
giả định · tác động · trạng thái review. Nêu cả **lệch so với kế hoạch** và
**ranh giới cố ý** để Reviewer soi — báo trước còn hơn bị phát hiện muộn.

Kết mỗi trục: Reviewer đối kháng độc lập, verdict `PASS` / `PASS-WITH-FIXES` /
`FAIL`. Vé đánh số **liên tục toàn dự án** (F1 → F200 tính tới 06/08/2026),
không reset theo trục. Trục kế tiếp khai báo trước số vé bắt đầu.

Một khẳng định sai trong chú thích được đọc như bằng chứng ở mọi lần sửa sau
(bài học F191). Chú thích biện minh phải được kiểm lại khi tiền đề đổi.
