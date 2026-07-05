-- Phase 2 hardening theo review đối kháng (F26/F33/F38)

-- [F38] rationale duyệt lưu trên review (ngoài audit_log)
ALTER TABLE "review" ADD COLUMN "final_rationale" TEXT;

-- [F26] snapshot target vào điểm — recompute được achievedPct từ dữ liệu đã lưu
ALTER TABLE "review_item_score" ADD COLUMN "target_value" DECIMAL(14,4);

-- [F26] target/base SERVER-SIDE trên scorecard item — compute không nhận từ client
ALTER TABLE "scorecard_item" ADD COLUMN "base" DECIMAL(14,4), ADD COLUMN "target" DECIMAL(14,4);

-- [F33] scope_type fail-closed: backfill null → 'self' (hẹp nhất) TRƯỚC khi NOT NULL
UPDATE "user_role" SET "scope_type" = 'self' WHERE "scope_type" IS NULL;
ALTER TABLE "user_role" ALTER COLUMN "scope_type" SET NOT NULL,
  ALTER COLUMN "scope_type" SET DEFAULT 'self';
