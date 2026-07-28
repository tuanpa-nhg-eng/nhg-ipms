-- [Trục B L3] Người quản lý đơn vị. Cột thô (không FK cứng, giống created_by/updated_by) —
-- validate ở service (person tồn tại, cùng tenant qua RLS).
ALTER TABLE "org_unit" ADD COLUMN "manager_id" UUID;
