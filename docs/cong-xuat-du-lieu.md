---
type: convention
title: Cổng xuất dữ liệu — @Exported fail-closed
description: Trần xuất theo mức phân loại × loại đích, và hai lớp fail-closed cố ý khác bản chất
tags: [security, export, governance]
verified: 2026-08-06
sources: [05-build/apps/api/src/common/export/export.guard.ts, 05-build/apps/api/src/common/export/export-surface.ts, OWNER_DIGEST.md]
---
`export_log` append-only, RLS tenant-bound, bốn cột NOT NULL: mã dữ liệu · mức
phân loại · đích · số bản ghi. Không thay `audit_log` — audit ghi "ai làm gì",
export_log trả lời "dữ liệu nào rời hệ, đi đâu, bao nhiêu dòng".

Trần xuất là bảng quyết định **mức phân loại × loại đích**, vì mức một mình
không đủ: đẩy sang hệ nội bộ và tải tệp về máy là hai rủi ro khác hẳn dù cùng
`confidential`.

| | hệ nội bộ NHG | tệp về máy | dịch vụ ngoài |
|---|---|---|---|
| public / internal | cho | cho | cho |
| confidential | cần `export:confidential` | cần `export:confidential` | CHẶN |
| restricted | CHẶN | CHẶN | CHẶN |

Hai lớp fail-closed, cần cả hai: **runtime** — route dạng xuất không khai
`@Exported` là 403, không có chế độ cảnh báo-rồi-cho-qua; **build-time** —
snapshot đóng đinh đúng tập route đang khai, thêm/bớt một khai báo làm test đỏ.
Heuristic không thể biết `POST /integrations/jobs/morning-todos/run` là đường
đẩy dữ liệu ra ngoài; snapshot một mình thì người thêm route có thể sửa cho
xanh — nhưng khi đó là sửa tường minh, có vết.

`export:confidential` là quyền **nâng trần**, không phải quyền hành động: tự nó
không gọi được endpoint nào. Nó nằm duy nhất ở vai `export_officer`, không gán
sẵn cho ai; `rbac-matrix.spec` đóng đinh cả hai vế.

**Nợ đã ghi, chưa trả:** worker BullMQ gọi `dispatchTenant()` trực tiếp, không
qua HTTP ⇒ không qua ExportGuard. Đường HTTP đã ghi vết, đường worker chưa.

Liên quan: [so-dang-ky-du-lieu.md](so-dang-ky-du-lieu.md), [bat-bien-quan-tri.md](bat-bien-quan-tri.md)
