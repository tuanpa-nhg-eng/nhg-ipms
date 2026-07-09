-- Phase 3 lát 4f — hardening theo Reviewer:
-- [F92b] import phải mang scope org_unit của người import (bu_author scoped)
ALTER TABLE "library_import_run" ADD COLUMN "org_unit_id" UUID;
