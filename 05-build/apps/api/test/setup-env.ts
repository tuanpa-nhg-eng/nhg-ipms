// Jest setup — env cho test (F2: secret phải tường minh, không fallback ngầm)
process.env.DEV_JWT_SECRET = process.env.DEV_JWT_SECRET ?? 'ipms-test-secret';
process.env.ALLOW_DEV_TOKEN = 'true';
