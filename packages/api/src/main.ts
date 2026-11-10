import { NestFactory } from '@nestjs/core';
import {
  ArgumentMetadata,
  BadRequestException,
  PipeTransform,
  ValidationPipe,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import * as cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter, TransformInterceptor, createValidationException } from './common';
import { createCorsPolicy } from './common/security/cors-policy';
import { APP_NAME } from './shared/constants';

const isTruthyEnv = (value: string | undefined) =>
  value ? ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()) : false;

const dangerousBodyKeys = new Set(['__proto__', 'prototype', 'constructor']);

function findDangerousBodyKey(value: unknown, path = 'body'): string | undefined {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const nested = findDangerousBodyKey(value[i], `${path}[${i}]`);
      if (nested) return nested;
    }
    return undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    const keyPath = `${path}.${key}`;
    if (dangerousBodyKeys.has(key)) {
      return keyPath;
    }
    const nested = findDangerousBodyKey((value as Record<string, unknown>)[key], keyPath);
    if (nested) return nested;
  }

  return undefined;
}

class DangerousBodyKeysPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (!['body', 'query', 'param'].includes(metadata.type)) {
      return value;
    }

    const unsafeKey = findDangerousBodyKey(value, metadata.type);
    if (!unsafeKey) {
      return value;
    }

    throw new BadRequestException({
      code: 'BAD_REQUEST',
      message: 'Payload contem campo invalido.',
      errors: [{ field: unsafeKey, messages: ['Campo nao permitido.'] }],
    });
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '10mb' });
  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  if (process.env.NODE_ENV === 'production') {
    app.use((req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      );
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      if (req.path.startsWith('/api/') && req.path !== '/api/health') {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Pragma', 'no-cache');
      }
      next();
    });
  }

  const corsPolicy = createCorsPolicy(process.env.CORS_ORIGINS, process.env.NODE_ENV);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.header('origin');
    if (corsPolicy.isOriginAllowed(origin)) {
      next();
      return;
    }
    res.status(403).json({
      statusCode: 403,
      code: 'CORS_ORIGIN_DENIED',
      message: 'Origem nao autorizada.',
      path: req.path,
    });
  });

  app.enableCors({
    origin: (origin, callback) => {
      callback(null, corsPolicy.isOriginAllowed(origin));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-Requested-With',
      'X-Client-Version',
      'X-Request-Id',
      'Accept-Language',
    ],
    exposedHeaders: ['X-Request-Id'],
  });

  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const unsafeKey = findDangerousBodyKey(req.body);
    if (!unsafeKey) {
      next();
      return;
    }

    res.status(400).json({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'Payload contem campo invalido.',
      path: req.url,
      errors: [{ field: unsafeKey, messages: ['Campo nao permitido.'] }],
    });
  });
  app.setGlobalPrefix('api');

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  app.useGlobalPipes(
    new DangerousBodyKeysPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: createValidationException,
    }),
  );

  const shouldEnableSwagger =
    process.env.NODE_ENV !== 'production' || isTruthyEnv(process.env.ENABLE_SWAGGER);

  if (shouldEnableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(APP_NAME)
      .setDescription('API de contagem de calorias por foto')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
