import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
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
