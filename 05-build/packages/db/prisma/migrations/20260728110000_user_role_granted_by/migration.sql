-- [Trục B L1] "ai cấp" — user_role trước lát này không có created_by/revoked_by, nên
-- GET /admin/users/:id/effective-access không thể trả nguồn của từng quyền. NULL hợp lệ
-- cho các grant do seed dựng sẵn (không có actor thật đứng sau).

ALTER TABLE "user_role" ADD COLUMN "created_by" UUID;
ALTER TABLE "user_role" ADD COLUMN "revoked_by" UUID;
