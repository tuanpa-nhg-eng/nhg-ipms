-- [Lát 4j] Ủy quyền phân cấp (Spec Task Dictionary §4.4) — authoring_grant:
-- trưởng phòng (dept_head, scope org_unit) cấp/thu quyền soạn tác vụ cho nhân viên
-- TRONG phòng mình. Least-privilege enforce trong CODE (F55): capability allowlist,
-- grantee cùng phòng, không leo thang. Hiệu lực RBAC qua user_role(staff_author).
CREATE TABLE "authoring_grant" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "granter_id" UUID NOT NULL,
    "grantee_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "capability" TEXT NOT NULL DEFAULT 'taskcell:author',
    "status" TEXT NOT NULL DEFAULT 'active',
    "user_role_id" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "authoring_grant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "authoring_grant_status_check" CHECK ("status" IN ('active','revoked')),
    CONSTRAINT "authoring_grant_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id"),
    CONSTRAINT "authoring_grant_granter_fkey" FOREIGN KEY ("granter_id") REFERENCES "app_user"("id"),
    CONSTRAINT "authoring_grant_grantee_fkey" FOREIGN KEY ("grantee_id") REFERENCES "app_user"("id"),
    CONSTRAINT "authoring_grant_org_unit_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id")
);

-- 1 grant active duy nhất per (tenant, grantee, org_unit, capability) — chống double-grant/race
CREATE UNIQUE INDEX "authoring_grant_active_unique"
  ON "authoring_grant"("tenant_id", "grantee_id", "org_unit_id", "capability")
  WHERE "status" = 'active';
CREATE INDEX "authoring_grant_tenant_org_idx" ON "authoring_grant"("tenant_id", "org_unit_id", "status");
CREATE INDEX "authoring_grant_tenant_grantee_idx" ON "authoring_grant"("tenant_id", "grantee_id", "status");

-- RLS fail-closed chuẩn tenant-bound
ALTER TABLE authoring_grant ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON authoring_grant
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON authoring_grant TO ipms_app;
