---
type: convention
title: RLS đa đơn vị — withTenant và đường đọc xuyên đơn vị
description: Cách iPMS giữ cách ly đơn vị mà không dùng BYPASSRLS, và cái bẫy RETURNING
tags: [security, database, rls]
verified: 2026-08-06
sources: [05-build/packages/db/src/index.ts, OWNER_DIGEST.md]
---
Mọi truy vấn nghiệp vụ đi qua `withTenant()`
([packages/db/src/index.ts](../05-build/packages/db/src/index.ts)). RLS bật trên
mọi bảng và **fail-closed** khi chưa set tenant context. Vai runtime `ipms_app`
là least-privilege: không DELETE bảng nghiệp vụ, không `BYPASSRLS`.

Đọc xuyên đơn vị (`platform_admin`) giải bằng cách tách hai chiều:
- **Ghi:** job làm mới snapshot đi từng đơn vị một qua `withTenant(t)` — không
  tồn tại truy vấn nào đọc dữ liệu hai đơn vị cùng lúc.
- **Đọc:** một GUC riêng, **cố ý không set** tenant context ⇒ mọi bảng nghiệp
  vụ trả 0 dòng. Bán kính nổ đo được bằng test, kèm ca đối chứng chứng minh dữ
  liệu có thật (rỗng vì RLS, không vì DB rỗng).

Ba cách sai đã loại: cấp `BYPASSRLS` cho vai người dùng · nới policy bảng
nghiệp vụ · để job chạy bằng owner connection.

**Bẫy `RETURNING`.** Postgres áp policy **SELECT** lên mệnh đề RETURNING, mà
`prisma.create()` luôn sinh RETURNING. Lỗi báo *"new row violates row-level
security policy"* nghe như WITH CHECK sai, thực tế là SELECT sai. Cách xử lý
đúng là bỏ RETURNING (id tự sinh), không bật thêm quyền đọc cho đường ghi.

**Trùng tên quyền giữa hai tầng là đường rò không nhìn thấy khi đọc mã.**
`exportlog:read` từng cho `platform_admin` đọc chi tiết vết xuất của một đơn
vị; nay tách `exportlog:read_metadata` (số đếm) khỏi `exportlog:read` (chi
tiết). Chỉ ca quét toàn bộ endpoint mới thấy loại lỗi này.

Liên quan: [bat-bien-quan-tri.md](bat-bien-quan-tri.md), [cong-xuat-du-lieu.md](cong-xuat-du-lieu.md)
