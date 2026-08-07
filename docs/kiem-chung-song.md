---
type: landmine
title: Kiểm chứng sống — đo đúng đối tượng
description: Vì sao driver sống phải nằm trong repo và những cách kết quả xanh trở nên vô nghĩa
tags: [testing, verification]
verified: 2026-08-06
sources: [05-build/scripts/verify/, OWNER_DIGEST.md]
---
Driver sống nằm ở [05-build/scripts/verify/](../05-build/scripts/verify/) và
commit như mã nguồn: `verify-admin.mjs`, `verify-governance.mjs`,
`verify-redteam-truc-c.mjs`, `verify-ai-identity.mjs`. Driver trục A (120/120)
và trục B (29/29) viết trong scratchpad phiên và đã mất — những con số đó
không tái lập được.

Bốn cách một kết quả xanh trở nên vô nghĩa, cả bốn đều đã xảy ra:

1. **Đo bằng vai sai.** `ipms_owner` bỏ qua RLS hoàn toàn ⇒ probe "chứng minh"
   RLS cho qua trong khi thực tế đang chặn. Đo bằng `ipms_app`.
2. **Đo mã cũ.** `start:dev` không watch ⇒ kill PID :4000 rồi start lại trước
   mọi kiểm chứng live.
3. **Assert chạy 0 lần.** Test xanh vì vòng lặp không có phần tử nào. Luôn
   `expect(length).toBeGreaterThan(0)` trước vòng lặp assert bảo mật; không
   `if (!x) return` trong test hồi quy.
4. **Không chốt mốc trước khi đo.** Đòn "nới X" chỉ có nghĩa khi bản chuẩn
   đang chặt về X. Ca test phải dựng nền từ bản chuẩn.

Driver phải quét **đủ mọi vai** được phép mở màn đó — F176 và F177 lọt vì chỉ
đánh `mgr@`, quên `hr@`/`exec@`. Và jest chạy trong transaction không bao giờ
bắt được rác trạng thái mà driver để lại trên DB thật; spec chạm bảng cấu hình
phải dọn ở `beforeAll`, không chỉ `afterAll`.

Liên quan: [nhip-lam-viec.md](nhip-lam-viec.md), [khong-bia-so.md](khong-bia-so.md)
