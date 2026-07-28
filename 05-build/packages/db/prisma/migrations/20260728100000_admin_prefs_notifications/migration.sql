-- [Trục B L1] Tuỳ chọn cá nhân (settings.self) + thông báo cá nhân (notify.self).
-- Bảng MỚI DUY NHẤT của lát này: notification_setting. Tuỳ chọn thì rẻ hơn dùng
-- một cột jsonb sẵn có trên app_user (whitelist key ở tầng service, cùng khuôn
-- tenant.settings).

ALTER TABLE "app_user" ADD COLUMN "preferences" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "notification_setting" (
    "tenant_id" UUID NOT NULL,
    "app_user_id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_setting_pkey" PRIMARY KEY ("app_user_id","event_key","channel")
);

CREATE INDEX "notification_setting_tenant_id_app_user_id_idx"
  ON "notification_setting"("tenant_id", "app_user_id");

ALTER TABLE "notification_setting" ADD CONSTRAINT "notification_setting_app_user_id_fkey"
  FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS tenant-bound fail-closed (chuẩn F44) — mỗi người CHỈ ghi được setting của CHÍNH
-- MÌNH; enforce "chính mình" ở tầng service (appUserId lấy từ JWT, không nhận qua body).
ALTER TABLE notification_setting ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_setting
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_setting TO ipms_app;
