-- [Learning Loop L3] ai_model_price — bảng giá model cho unit economics (PRD §16).
-- Catalog GLOBAL (tenant_id NULL): app CHỈ ĐỌC (chuẩn F44 — không có đường ghi từ app),
-- seed/B3 cập nhật giá. Unique partial cho global (chuẩn F56).

-- CreateTable
CREATE TABLE "ai_model_price" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "model" TEXT NOT NULL,
    "input_usd_per_mtok" DECIMAL(10,4) NOT NULL,
    "output_usd_per_mtok" DECIMAL(10,4) NOT NULL,
    "note" TEXT,
    "as_of" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_model_price_pkey" PRIMARY KEY ("id")
);

-- Unique: 1 giá global per model (F56) + 1 giá per (tenant, model) nếu sau này override
CREATE UNIQUE INDEX "ai_model_price_global_model_key"
  ON "ai_model_price"("model") WHERE tenant_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX "ai_model_price_tenant_model_key"
  ON "ai_model_price"("tenant_id", "model") WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;

-- Giá không âm tại tầng DB
ALTER TABLE "ai_model_price" ADD CONSTRAINT "ai_model_price_nonnegative_check"
  CHECK (input_usd_per_mtok >= 0 AND output_usd_per_mtok >= 0);

-- RLS chuẩn F44: app đọc global + tenant mình; KHÔNG cấp INSERT/UPDATE (catalog read-only)
ALTER TABLE ai_model_price ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_or_global ON ai_model_price FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT ON ai_model_price TO ipms_app;
