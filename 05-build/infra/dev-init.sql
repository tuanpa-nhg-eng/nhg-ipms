-- DEV-ONLY bootstrap (docker-entrypoint-initdb.d) — KHÔNG dùng ở prod.
-- Prod: ops tự tạo role + password mạnh từ vault trước khi migrate.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ipms_app') THEN
    CREATE ROLE ipms_app NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
ALTER ROLE ipms_app LOGIN PASSWORD 'ipms_app_dev_only';
