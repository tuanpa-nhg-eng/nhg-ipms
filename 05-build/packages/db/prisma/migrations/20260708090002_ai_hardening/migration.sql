-- [F56] Phase 3 lát 4a hardening — unique (tenant_id, name) KHÔNG chặn trùng name
-- khi tenant_id IS NULL (Postgres coi NULL ≠ NULL). Partial unique index chặn
-- hai row global cùng tên tool (listTools/invoke sẽ chọn nhất quán).
CREATE UNIQUE INDEX "mcp_tool_global_name_key" ON "mcp_tool"("name") WHERE "tenant_id" IS NULL;
