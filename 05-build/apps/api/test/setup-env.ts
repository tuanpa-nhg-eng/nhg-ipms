// Jest setup — env cho test (F2: secret phải tường minh, không fallback ngầm)
process.env.DEV_JWT_SECRET = process.env.DEV_JWT_SECRET ?? 'ipms-test-secret';
process.env.ALLOW_DEV_TOKEN = 'true';
// DB dev-only mặc định (đồng bộ .env.example / docker-compose.dev.yml) —
// chỉ áp khi biến chưa set để CI/máy khác override được. KHÔNG phải secret prod.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://ipms_app:ipms_app_dev_only@localhost:55432/ipms?schema=public';
process.env.OWNER_DATABASE_URL =
  process.env.OWNER_DATABASE_URL ??
  'postgresql://ipms_owner:ipms_dev_only@localhost:55432/ipms?schema=public';
// Lát 4c: tắt cache PolicyGuard trong test — policy global do owner ghi thẳng DB
// (không qua API nên không invalidate được cache) phải có hiệu lực ngay
process.env.POLICY_CACHE_TTL_MS = process.env.POLICY_CACHE_TTL_MS ?? '0';
