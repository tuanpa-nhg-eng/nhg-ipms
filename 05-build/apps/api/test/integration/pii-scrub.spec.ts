/**
 * Integration — [F59 trả nợ] PII scrub thuận-nghịch qua ai-gateway thật (DB + inline assist):
 * request rời gateway (client mock) chỉ thấy bản đã scrub · ai_interaction audit log
 * KHÔNG bao giờ giữ PII gốc (chỉ đếm piiScrubbed) · caller nội bộ (ai_suggestion) vẫn
 * nhận giá trị THẬT (nghịch, rehydrate trong RAM — không dựng kho PII thứ hai).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { createPrismaClient, PrismaClient, uuidv7 } from '@ipms/db';
import { AppModule } from '../../src/app.module';
import { getJwtSecret } from '../../src/common/auth/jwt.guard';

jest.setTimeout(120_000);

interface Ctx { id: string; token: string; userId: string }

describe('[F59] PII scrub thuận-nghịch trên ai-gateway', () => {
  let app: INestApplication;
  let owner: PrismaClient;
  let author: Ctx;
  const uniq = Date.now();

  beforeAll(async () => {
    owner = createPrismaClient(process.env.OWNER_DATABASE_URL);
    async function ctxFor(tenantCode: string, emailPrefix: string): Promise<Ctx> {
      const tenant = await owner.tenant.findUnique({ where: { code: tenantCode } });
      const user = await owner.appUser.findFirst({
        where: { tenantId: tenant!.id, email: { startsWith: emailPrefix } },
      });
      const token = jwt.sign(
        { sub: user!.id, tid: tenant!.id, email: user!.email, person_id: user!.personId ?? undefined },
        getJwtSecret(), { expiresIn: '1h' },
      );
      return { id: tenant!.id, token, userId: user!.id };
    }
    author = await ctxFor('H.01', 'author@');

    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await owner?.$disconnect();
  });

  const as = (c: Ctx) => ({ Authorization: `Bearer ${c.token}`, 'X-Tenant-Id': c.id });
  const api = () => request(app.getHttpServer());

  it('email trong input người dùng → ai_interaction.input SCRUB, ai_suggestion.reason vẫn giá trị THẬT', async () => {
    const email = `ung.vien.${uniq}@nhg.edu.vn`;
    const cell = { nameVi: `Liên hệ ${email} trước khi duyệt ${uniq}`, code: 'TS-G01-C01-T001' };
    const res = await api().post('/api/v1/ai/inline/taskcell.kpi_link')
      .set(as(author)).send({ input: { payload: cell } });
    expect(res.status).toBe(201);

    // Nghịch — caller (API response + ai_suggestion.reason) thấy email THẬT
    expect(res.body.reason as string).toContain(email);
    const suggestionRow = await owner.aiSuggestion.findFirst({ where: { id: res.body.suggestion.id } });
    expect(suggestionRow!.reason).toContain(email);

    // Thuận — audit log ai_interaction KHÔNG BAO GIỜ giữ email gốc, chỉ token + đếm
    const interaction = await owner.aiInteraction.findFirst({
      where: { tenantId: author.id, agent: 'inline.taskcell.kpi_link' },
      orderBy: { at: 'desc' },
    });
    expect(interaction).not.toBeNull();
    const input = interaction!.input as any;
    expect(JSON.stringify(input)).not.toContain(email);
    expect(JSON.stringify(input)).toMatch(/\[\[PII:email:\d+\]\]/);
    expect(input.piiScrubbed.email).toBeGreaterThanOrEqual(1);
  });

  it('SĐT + CCCD trong description (derivation.rule) → scrub trong log, không lộ ở audit', async () => {
    const phone = '0912345678';
    const cccd = '123456789012';
    const description = `Áp dụng cho nhân sự SĐT ${phone}, CCCD ${cccd} — vòng ${uniq}`;
    const res = await api().post('/api/v1/ai/inline/derivation.rule')
      .set(as(author)).send({ input: { description } });
    expect(res.status).toBe(201);

    const interaction = await owner.aiInteraction.findFirst({
      where: { tenantId: author.id, agent: 'inline.derivation.rule' },
      orderBy: { at: 'desc' },
    });
    const input = interaction!.input as any;
    expect(JSON.stringify(input)).not.toContain(phone);
    expect(JSON.stringify(input)).not.toContain(cccd);
    expect(input.piiScrubbed.phone).toBe(1);
    expect(input.piiScrubbed.cccd).toBe(1);
    // Nghịch — reason trả về cho caller vẫn nêu đúng mô tả gốc (rehydrate)
    expect(res.body.reason as string).toContain(phone);
    expect(res.body.reason as string).toContain(cccd);
  });

  it('tên nhân sự CÓ TRONG Person của tenant → bị scrub ở audit log (đối chiếu DB, không đoán mò)', async () => {
    const fullName = `Phạm Thị Kiểm Thử ${uniq}`;
    const p = await owner.person.create({
      data: {
        id: uuidv7(), tenantId: author.id, employeeCode: `PII-TEST-${uniq}`,
        fullName, status: 'active', email: `pii-test-${uniq}@h01.nhg.local`,
      },
    });
    try {
      const cell = { nameVi: `Bàn giao cho ${fullName}`, code: 'TS-G01-C01-T001' };
      const res = await api().post('/api/v1/ai/inline/taskcell.kpi_link')
        .set(as(author)).send({ input: { payload: cell } });
      expect(res.status).toBe(201);
      expect(res.body.reason as string).toContain(fullName); // nghịch — reason vẫn tên thật

      const interaction = await owner.aiInteraction.findFirst({
        where: { tenantId: author.id, agent: 'inline.taskcell.kpi_link' },
        orderBy: { at: 'desc' },
      });
      const input = interaction!.input as any;
      expect(JSON.stringify(input)).not.toContain(fullName);
      expect(input.piiScrubbed.name).toBeGreaterThanOrEqual(1);
    } finally {
      await owner.person.deleteMany({ where: { id: p.id } });
    }
  });

  it('input KHÔNG có PII → piiScrubbed không xuất hiện (không dán nhãn giả)', async () => {
    const cell = { nameVi: `Tác vụ sạch không PII ${uniq}`, code: 'TS-G01-C01-T001' };
    const res = await api().post('/api/v1/ai/inline/taskcell.kpi_link')
      .set(as(author)).send({ input: { payload: cell } });
    expect(res.status).toBe(201);
    const interaction = await owner.aiInteraction.findFirst({
      where: { tenantId: author.id, agent: 'inline.taskcell.kpi_link' },
      orderBy: { at: 'desc' },
    });
    const input = interaction!.input as any;
    expect(input.piiScrubbed).toBeUndefined();
  });
});
