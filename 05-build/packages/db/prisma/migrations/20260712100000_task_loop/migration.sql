-- ============================================================
-- [Lát 4k] Vòng lặp tối ưu liên tục (Spec Task Dictionary §4.1–4.3, §6):
-- active → góp ý (task_feedback) → reopen → sửa → trưởng phòng duyệt
-- → ACTIVE v+1 (task_revision append-only). Mỗi vòng làm tác vụ tốt dần.
-- ============================================================

-- 4.1. task_cell: vòng đời vận hành + phòng sở hữu + chuỗi phiên bản
ALTER TABLE "task_cell" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "task_cell" ADD CONSTRAINT "task_cell_status_check"
  CHECK ("status" IN ('draft','active','reopened','deprecated'));
ALTER TABLE "task_cell" ADD COLUMN "owner_org_unit_id" UUID REFERENCES "org_unit"("id");
ALTER TABLE "task_cell" ADD COLUMN "active_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "task_cell" ADD COLUMN "supersedes_id" UUID REFERENCES "task_cell"("id");
CREATE INDEX "task_cell_tenant_status_idx" ON "task_cell"("tenant_id", "status")
  WHERE "config_version_id" IS NULL;

-- 4.2. Lịch sử phiên bản — mỗi lần active ghi 1 snapshot BẤT BIẾN (append-only)
CREATE TABLE "task_revision" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "task_cell_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "contribution_id" UUID,
    "change_summary" TEXT,
    "activated_by" UUID,
    "activated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_revision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_revision_cell_fkey" FOREIGN KEY ("task_cell_id") REFERENCES "task_cell"("id"),
    CONSTRAINT "task_revision_contribution_fkey" FOREIGN KEY ("contribution_id") REFERENCES "library_contribution"("id"),
    CONSTRAINT "task_revision_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id")
);
CREATE UNIQUE INDEX "task_revision_cell_version_unique" ON "task_revision"("task_cell_id", "version");
CREATE INDEX "task_revision_tenant_cell_idx" ON "task_revision"("tenant_id", "task_cell_id");

-- APPEND-ONLY như audit_log: trigger chặn UPDATE/DELETE kể cả table owner
CREATE OR REPLACE FUNCTION forbid_task_revision_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'task_revision is append-only (lịch sử phiên bản bất biến)';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER task_revision_append_only
  BEFORE UPDATE OR DELETE ON "task_revision"
  FOR EACH ROW EXECUTE FUNCTION forbid_task_revision_mutation();

-- 4.3. Góp ý sử dụng thực tế — kênh phát hiện "cần tối ưu thêm"
CREATE TABLE "task_feedback" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "task_cell_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "version" INTEGER,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'optimize',
    "status" TEXT NOT NULL DEFAULT 'open',
    "triaged_by" UUID,
    "reopened_contribution_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "task_feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_feedback_category_check" CHECK ("category" IN ('optimize','defect','question')),
    CONSTRAINT "task_feedback_status_check" CHECK ("status" IN ('open','triaged','reopened','resolved','wontfix')),
    CONSTRAINT "task_feedback_cell_fkey" FOREIGN KEY ("task_cell_id") REFERENCES "task_cell"("id"),
    CONSTRAINT "task_feedback_author_fkey" FOREIGN KEY ("author_id") REFERENCES "app_user"("id"),
    CONSTRAINT "task_feedback_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id")
);
CREATE INDEX "task_feedback_tenant_cell_status_idx" ON "task_feedback"("tenant_id", "task_cell_id", "status");

-- RLS fail-closed chuẩn tenant-bound + grants least-privilege
ALTER TABLE "task_revision" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "task_revision"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON "task_revision" TO ipms_app;  -- KHÔNG UPDATE/DELETE (append-only 2 lớp)

ALTER TABLE "task_feedback" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "task_feedback"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON "task_feedback" TO ipms_app;

-- Backfill: cell canonical hiện hữu (seed 4i + publish 4f) đang VẬN HÀNH
-- → status='active', active_version=1 + revision v1 (snapshot trạng thái hiện tại).
-- Q1 đã đảm bảo từ 4h: mọi canonical đều có kpi_ref thật.
UPDATE "task_cell" SET "status" = 'active', "active_version" = 1
  WHERE "config_version_id" IS NULL AND "deleted_at" IS NULL;
INSERT INTO "task_revision" ("id", "tenant_id", "task_cell_id", "version", "snapshot", "change_summary", "activated_at")
SELECT gen_random_uuid(), tc."tenant_id", tc."id", 1,
       jsonb_build_object(
         'code', tc."code", 'groupCode', tc."group_code", 'clusterCode', tc."cluster_code",
         'nameVi', tc."name_vi", 'nameEn', tc."name_en",
         'responsibleRole', tc."responsible_role", 'accountableRole', tc."accountable_role",
         'consulted', tc."consulted", 'informed', tc."informed",
         'inputs', tc."inputs", 'outputs', tc."outputs", 'measures', tc."measures",
         'aiLevel', tc."ai_level", 'aiDimension', tc."ai_dimension",
         'governance', tc."governance", 'riskLevel', tc."risk_level", 'lifecycle', tc."lifecycle",
         'kpiRef', tc."kpi_ref"
       ),
       'Backfill lát 4k — canonical hiện hữu kích hoạt v1', CURRENT_TIMESTAMP
FROM "task_cell" tc
WHERE tc."config_version_id" IS NULL AND tc."deleted_at" IS NULL;
