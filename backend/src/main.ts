import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

/** Matches `backend.port` in colossus.yaml, which the deploy manifests read. */
const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // Every route lives under /api so nginx can serve the SPA at / and
  // reverse-proxy /api to this process from the same origin.
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip properties with no DTO decorator instead of rejecting them. This
      // is what makes a client-supplied `role` on signup, or `userId` on a
      // movement, silently ineffective rather than a privilege-escalation path.
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // In production the SPA and the API share an origin through nginx, so CORS is
  // not exercised. Reflecting the request origin keeps `ng serve` and direct
  // API access working without pinning a single hostname.
  const frontendUrl = process.env.FRONTEND_URL;
  app.enableCors({
    origin: frontendUrl ?? true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('StockRoom API')
    .setDescription('Inventory management — items, locations, stock movements and reports')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`StockRoom API listening on http://0.0.0.0:${port}/api`);
  logger.log(`Swagger docs at http://0.0.0.0:${port}/api/docs`);
}

void bootstrap();
