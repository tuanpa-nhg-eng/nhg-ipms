---
type: decision
title: Sổ đăng ký dữ liệu và danh bạ agent
description: Mức nhạy cảm và trần AI suy từ sổ, không do người gọi tự khai
tags: [governance, ai, data-classification]
verified: 2026-08-06
sources: [05-build/packages/db/src/ai-agent-directory.data.ts, OWNER_DIGEST.md]
---
`data_asset` giữ 9 nhóm dữ liệu, phân loại 4 mức
`public|internal|confidential|restricted`. Bản chuẩn cấp tập đoàn có
`tenant_id NULL`; đơn vị **chỉ siết chặt được**, cưỡng chế bằng trigger DB chứ
không chỉ validator tầng API. Mã chưa đăng ký ⇒ **404 fail-closed**, không mặc
định về `internal`.

Vai `data_steward` là vai duy nhất sửa được sổ và **không kèm quyền nghiệp vụ
nào** — người quyết định dữ liệu được xử lý thế nào không nên là người xử lý nó.

Vựng chuẩn là `restricted`; `pii` chỉ còn là bí danh tương thích ngược cho bản
ghi `ai_egress_policy` cũ. Hai vựng song song từng là mầm rò: một chỗ siết
`pii`, chỗ kia siết `restricted`, dữ liệu lọt qua khe giữa hai cách gọi.

`ai_agent` áp cùng khuôn: bản chuẩn `tenant_id NULL`, trigger
`ai_agent_no_loosen` chặn năm chiều nới lỏng (nâng trần · thêm quyền ngoài hiến
chương · thêm nhóm dữ liệu · nới HITL · tự bật agent mà bản chuẩn để `planned`).
CHECK cấp lược đồ: `hitl_mode ∈ {read_only, propose_only}` — **không giá trị
nào cho phép AI ghi thẳng**; muốn có agent tự ghi phải sửa migration có người
đọc.

Lượt gọi LLM khai `dataAssets: string[]` (chạm nhóm nào), **mức** do sổ quyết
định = max rank. Không khai ⇒ chặn. Ba cổng N1/N2/N3 chạy trước egress ở **cả**
`complete()` và `stream()` — một đường không qua cổng là đủ vô hiệu cổng.

Không seed agent cho "đủ bộ": danh bạ hoà giải BRD ⟷ mã thật, agent chưa có mã
để `planned`.

Liên quan: [bat-bien-quan-tri.md](bat-bien-quan-tri.md), [khong-bia-so.md](khong-bia-so.md)
