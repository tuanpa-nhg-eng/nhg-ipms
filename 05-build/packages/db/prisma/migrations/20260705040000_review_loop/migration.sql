-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('draft', 'self_done', 'manager_done', 'calibrated', 'final', 'appealed');

-- CreateTable
CREATE TABLE "checkin" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "cadence" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "progress_note" TEXT,
    "blocker" TEXT,
    "manager_comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "checkin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin_goal_update" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "checkin_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "progress_pct" DECIMAL(5,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "checkin_goal_update_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_cycle" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "review_cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "reviewee_id" UUID NOT NULL,
    "scorecard_id" UUID,
    "self_reflection" TEXT,
    "manager_assessment" TEXT,
    "strengths" TEXT,
    "gaps" TEXT,
    "development_needs" TEXT,
    "proposed_rating" TEXT,
    "final_rating" TEXT,
    "final_score" DECIMAL(6,2),
    "ipc_grade" TEXT,
    "status" "review_status" NOT NULL DEFAULT 'draft',
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_item_score" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "scorecard_item_id" UUID NOT NULL,
    "rater_id" UUID,
    "actual_value" DECIMAL(14,4),
    "achieved_pct" DECIMAL(6,2),
    "raw_score" DECIMAL(6,2),
    "weighted_score" DECIMAL(6,2),
    "source" TEXT,
    "formula_version" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "review_item_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calibration_session" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cycle_id" UUID,
    "org_unit_id" UUID,
    "scheduled_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "calibration_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calibration_decision" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "rating_before" TEXT,
    "rating_after" TEXT,
    "rationale" TEXT NOT NULL,
    "decided_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "calibration_decision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkin_tenant_id_person_id_cadence_period_key_key" ON "checkin"("tenant_id", "person_id", "cadence", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "review_tenant_id_cycle_id_reviewee_id_key" ON "review"("tenant_id", "cycle_id", "reviewee_id");

-- AddForeignKey
ALTER TABLE "checkin_goal_update" ADD CONSTRAINT "checkin_goal_update_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "checkin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "review_cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_item_score" ADD CONSTRAINT "review_item_score_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "review"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_decision" ADD CONSTRAINT "calibration_decision_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "calibration_session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

