-- Phase 3 lát 4d — canvas_layout (Spec §4.3): vị trí node Org/Process Designer
-- CreateTable
CREATE TABLE "canvas_layout" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "ref_id" UUID NOT NULL,
    "nodes" JSONB NOT NULL DEFAULT '{}',
    "edges" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "canvas_layout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "canvas_layout_tenant_id_kind_ref_id_key" ON "canvas_layout"("tenant_id", "kind", "ref_id");

-- fail-closed tầng DB: chỉ 2 kind được hỗ trợ
ALTER TABLE "canvas_layout" ADD CONSTRAINT "canvas_layout_kind_check" CHECK ("kind" IN ('org', 'process'));

-- RLS chuẩn tenant-bound + grants (không có row global)
ALTER TABLE canvas_layout ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON canvas_layout
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON canvas_layout TO ipms_app;
