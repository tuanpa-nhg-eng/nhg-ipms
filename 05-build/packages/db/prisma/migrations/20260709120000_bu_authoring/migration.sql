-- Phase 3 lát 4f — BU Authoring Gate (Spec_BU_Authoring_Gate §5 + §6.5)
-- Thư viện 3 tầng: local (BU draft) → submitted (curation) → canonical (tenant/group).
-- Canonical cell = task_cell.config_version_id IS NULL + lib_scope IN ('tenant','group').

-- 1. Mở rộng task_cell (nguồn gốc + scope thư viện + promotion)
ALTER TABLE "task_cell" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'library';
ALTER TABLE "task_cell" ADD COLUMN "lib_scope" TEXT NOT NULL DEFAULT 'local';
ALTER TABLE "task_cell" ADD COLUMN "contributed_by" UUID;
ALTER TABLE "task_cell" ADD COLUMN "canonical_id" UUID;
ALTER TABLE "task_cell" ADD COLUMN "usage_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "task_cell" ADD CONSTRAINT "task_cell_origin_check"
  CHECK ("origin" IN ('library', 'bu_authored', 'imported', 'ai_drafted'));
ALTER TABLE "task_cell" ADD CONSTRAINT "task_cell_lib_scope_check"
  CHECK ("lib_scope" IN ('local', 'tenant', 'group'));

-- [chuẩn F56] mã canonical (config_version_id NULL) phải duy nhất trong tenant —
-- unique (tenant,code,version) sẵn có KHÔNG đỡ được vì NULL ≠ NULL trong Postgres
CREATE UNIQUE INDEX "task_cell_canonical_code_key" ON "task_cell"("tenant_id", "code")
  WHERE "config_version_id" IS NULL AND "deleted_at" IS NULL;

-- 2. Mở rộng kpi_template
ALTER TABLE "kpi_template" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'library';
ALTER TABLE "kpi_template" ADD COLUMN "lib_scope" TEXT NOT NULL DEFAULT 'tenant';
ALTER TABLE "kpi_template" ADD COLUMN "contributed_by" UUID;

-- 3. Gói đóng góp (wrapper 1 lần submit)
CREATE TABLE "library_contribution" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "org_unit_id" UUID,
    "function_id" UUID,
    "type" TEXT NOT NULL,
    "task_cell_id" UUID,
    "kpi_ref" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "quality_score" DECIMAL(5,2),
    "quality_report" JSONB,
    "target_scope" TEXT NOT NULL DEFAULT 'tenant',
    "curator_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "library_contribution_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "library_contribution_status_check" CHECK ("status" IN
      ('draft','submitted','in_review','needs_changes','approved','rejected','deprecated','published')),
    CONSTRAINT "library_contribution_type_check" CHECK ("type" IN
      ('task_cell','kpi','task_cell_with_kpi')),
    CONSTRAINT "library_contribution_scope_check" CHECK ("target_scope" IN ('tenant','group'))
);
CREATE INDEX "library_contribution_tenant_id_status_idx" ON "library_contribution"("tenant_id", "status");
CREATE INDEX "library_contribution_author_id_idx" ON "library_contribution"("author_id");

-- 4. Audit trail curation
CREATE TABLE "library_review" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contribution_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_review_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "library_review_action_check" CHECK ("action" IN
      ('comment','request_changes','approve','reject','merge','publish')),
    CONSTRAINT "library_review_contribution_fkey" FOREIGN KEY ("contribution_id")
      REFERENCES "library_contribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "library_review_contribution_id_idx" ON "library_review"("contribution_id");

-- 5. Ứng viên trùng (dedup) — hệ gợi ý, NGƯỜI quyết
CREATE TABLE "library_dedup_candidate" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contribution_id" UUID NOT NULL,
    "similar_task_cell_id" UUID,
    "similar_kpi_template_id" UUID,
    "similarity" DECIMAL(4,3),
    "reason" TEXT,
    "resolution" TEXT NOT NULL DEFAULT 'pending',
    "resolved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "library_dedup_candidate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "library_dedup_resolution_check" CHECK ("resolution" IN
      ('pending','merge','keep_both','discard')),
    CONSTRAINT "library_dedup_contribution_fkey" FOREIGN KEY ("contribution_id")
      REFERENCES "library_contribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "library_dedup_contribution_id_idx" ON "library_dedup_candidate"("contribution_id");

-- 6. Template pack chuẩn hoá (§6.5) — tenant NULL = pack dùng chung (global/group)
CREATE TABLE "library_template" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "code" TEXT NOT NULL,
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT,
    "domain" TEXT,
    "format" TEXT NOT NULL DEFAULT 'json',
    "schema" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'published',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "library_template_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "library_template_tenant_code_version_key"
  ON "library_template"("tenant_id", "code", "version");
CREATE UNIQUE INDEX "library_template_global_code_version_key"
  ON "library_template"("code", "version") WHERE "tenant_id" IS NULL AND "deleted_at" IS NULL;

-- 7. Import run (preview → apply, idempotent)
CREATE TABLE "library_import_run" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" UUID,
    "source_ref" TEXT,
    "mode" TEXT NOT NULL,
    "config_version_id" UUID,
    "rows" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'preview',
    "diff" JSONB,
    "stats" JSONB,
    "error" JSONB,
    "imported_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "library_import_run_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "library_import_run_mode_check" CHECK ("mode" IN
      ('as_local','as_submission','as_canonical')),
    CONSTRAINT "library_import_run_status_check" CHECK ("status" IN
      ('preview','applied','failed'))
);
CREATE INDEX "library_import_run_tenant_id_idx" ON "library_import_run"("tenant_id");

-- 8. RLS + grants — chuẩn fail-closed
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'library_contribution','library_review','library_dedup_candidate','library_import_run'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO ipms_app', t);
  END LOOP;
END
$$;

-- library_template: chuẩn F44 — SELECT thấy global, app KHÔNG ghi được row global
ALTER TABLE library_template ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_or_global ON library_template FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_write ON library_template FOR INSERT
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_update ON library_template FOR UPDATE
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON library_template TO ipms_app;
