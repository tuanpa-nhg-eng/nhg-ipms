// [F81] Nạp .env (dev) TRƯỚC mọi import khác — không override env đã set (prod: env từ
// platform), quiet để không noise stdout
process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET ?? 'true';
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  // CORS fail-closed: chỉ bật khi khai báo origin tường minh (dev FE :3000/:3001);
  // prod đi qua reverse proxy cùng origin — không set env này.
  // [F80] nhánh default dev KHÔNG bao giờ bật ở production (kể cả ALLOW_DEV_TOKEN đặt nhầm)
  const devDefault = process.env.ALLOW_DEV_TOKEN === 'true' && process.env.NODE_ENV !== 'production'
    ? 'http://localhost:3000,http://localhost:3001' : '';
  const corsOrigins = (process.env.CORS_ORIGINS ?? devDefault).split(',').filter(Boolean);
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Id'],
    });
  }
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // ApiErrorFilter đăng ký qua APP_FILTER trong AppModule (nhất quán cả test)

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('NHG iPMS API')
      .setDescription('Intelligent Performance Management System — REST API v1')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, doc);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`iPMS API listening on :${port} — docs at /api/docs`);
}
bootstrap();
