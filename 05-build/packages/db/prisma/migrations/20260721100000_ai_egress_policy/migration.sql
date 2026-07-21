-- [Last-mile Lát 2] ai_egress_policy — cấu hình tenant thu hẹp egress theo dataClass/đích.
-- Bất biến pii/confidential ⇒ mock-only nằm trong CODE (egress-policy.ts), KHÔNG phụ
-- thuộc bảng này — bảng chỉ chứa override cho public/internal (tenant CHẶN THÊM, không
-- mở rộng ra khỏi bất biến cứng).

-- CreateTable
CREATE TABLE "ai_egress_policy" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "data_class" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_egress_policy_pkey" PRIMARY KEY ("id")
);

-- Unique ĐẦY ĐỦ (không partial) — chuẩn ai_launch_bar, khớp Prisma upsert() ON CONFLICT.
-- Soft-delete xử lý như launch_bar: upsert() reset deletedAt=null ở nhánh update.
CREATE UNIQUE INDEX "ai_egress_policy_tenant_class_dest_key"
  ON "ai_egress_policy"("tenant_id", "data_class", "destination");
CREATE INDEX "ai_egress_policy_tenant_id_idx" ON "ai_egress_policy"("tenant_id");

-- Whitelist tại tầng DB — row lạ không lọt vào engine (chuẩn F72/F137)
ALTER TABLE "ai_egress_policy" ADD CONSTRAINT "ai_egress_policy_data_class_check"
  CHECK (data_class IN ('public', 'internal', 'confidential', 'pii'));
ALTER TABLE "ai_egress_policy" ADD CONSTRAINT "ai_egress_policy_destination_check"
  CHECK (destination IN ('mock', 'anthropic', 'self_host'));

-- RLS tenant-bound fail-closed chuẩn F44
ALTER TABLE ai_egress_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_egress_policy
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON ai_egress_policy TO ipms_app;
