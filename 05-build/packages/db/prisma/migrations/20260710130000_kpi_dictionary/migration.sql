-- Phase 3 lát 4h — Từ điển KPI chuẩn (Spec_Task_Dictionary §4.5 + §12 Q1 CHẶN CỨNG)
-- Mở rộng kpi_template thành từ điển KPI chính thức: metadata semantic + cờ is_dictionary.
-- Mọi task_cell active/canonical phải gắn kpiRef tồn tại trong từ điển này (enforce ở service).

ALTER TABLE "kpi_template" ADD COLUMN "definition" TEXT;
ALTER TABLE "kpi_template" ADD COLUMN "grain" TEXT;
ALTER TABLE "kpi_template" ADD COLUMN "data_classification" TEXT;
ALTER TABLE "kpi_template" ADD COLUMN "ai_boundary" TEXT;
ALTER TABLE "kpi_template" ADD COLUMN "source_system" TEXT;
ALTER TABLE "kpi_template" ADD COLUMN "domain" TEXT;
-- is_dictionary=true: mục từ điển KPI chuẩn (nguồn tham chiếu bắt buộc), phân biệt với
-- kpi_template do derivation/BU sinh ra tạm.
ALTER TABLE "kpi_template" ADD COLUMN "is_dictionary" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "kpi_template_tenant_dictionary_idx" ON "kpi_template"("tenant_id", "is_dictionary");
