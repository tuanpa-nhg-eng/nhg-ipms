---
type: org-requirement
title: Bất biến quản trị J / K / N
description: Ba bộ bất biến tích luỹ qua trục B, C, D — ở đâu và khuôn chung
tags: [governance, security, invariants]
verified: 2026-08-06
sources: [02-dac-ta/NHG_iPMS_Ke_Hoach_Truc_B_Quan_Tri_3_Tang.md, 02-dac-ta/NHG_iPMS_Ke_Hoach_Truc_C_Lop_Bao_Ve_Niem_Tin.md, 02-dac-ta/NHG_iPMS_Ke_Hoach_Truc_D_Lop_AI_Co_Danh_Tinh.md]
---
Bảng đầy đủ nằm trong ba file kế hoạch ở `02-dac-ta/` (ngoài git — xem
[tai-lieu-ngoai-git.md](tai-lieu-ngoai-git.md)). Bộ sau giữ nguyên bộ trước:
K10 giữ J1–J13, N10 giữ J1–J13 + K1–K10. Lát nào phá là lát đó sai.

- **J1–J13 · quản trị 3 tầng:** không leo thang quyền, không god-account
  (`tenant_admin` không có `audit:read`), quyền quyết định cái được render,
  mutation admin bị từ chối vẫn ghi audit, đóng vai là chỉ-đọc tuyệt đối với
  danh tính kép `act`/`sub` và TTL ≤30 phút.
- **K1–K10 · lớp bảo vệ niềm tin:** không `BYPASSRLS` cho người thật, không
  `@Exported` thì không xuất được, `restricted` không rời hệ dạng tệp trong mọi
  trường hợp, mọi ngoại lệ có hạn (trần 72h) và người xin ≠ người duyệt,
  `platform_admin` không giữ quyền nghiệp vụ nào.
- **N1–N10 · lớp AI có danh tính:** agent lạ ⇒ 422, mức phân loại suy từ
  `data_asset`, trần là thuộc tính của agent chứ không của phiên, quyền hữu
  hiệu = quyền người gọi ∩ hiến chương, đơn vị chỉ siết được.

Khuôn chung: **cưỡng chế ở tầng thấp nhất có thể** — trigger DB > CHECK lược đồ
> guard tầng API — vì đường ghi trực tiếp (script vá dữ liệu, endpoint thêm sau,
job nền) không đi qua validator tầng API. Và mỗi bất biến cần một test đóng
đinh: không test thì coi như chưa có cơ chế.

Liên quan: [cong-xuat-du-lieu.md](cong-xuat-du-lieu.md), [so-dang-ky-du-lieu.md](so-dang-ky-du-lieu.md), [rls-multi-tenant.md](rls-multi-tenant.md)
