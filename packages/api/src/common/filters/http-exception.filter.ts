import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { defaultHttpCodeForStatus, prismaKnownRequestToPayload } from './exception-normalizer';
import { localizeApiError } from './api-error.localization';

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  path: string;
  errors?: Array<{ field: string; messages: string[] }>;
  details?: unknown;
  retryAfterSeconds?: number;
}

function normalizeHttpException(exception: HttpException, requestPath: string): ApiErrorBody {
  const statusCode = exception.getStatus();
  const res = exception.getResponse();
  const baseCode = defaultHttpCodeForStatus(statusCode);

  if (typeof res === 'string') {
    return {
      statusCode,
      code: baseCode,
      message: res,
      path: requestPath,
    };
  }

  if (typeof res !== 'object' || res === null) {
    return {
      statusCode,
      code: baseCode,
      message: 'Erro na requisição.',
      path: requestPath,
    };
  }

  const obj = res as Record<string, unknown>;
  const code = typeof obj.code === 'string' && obj.code.length > 0 ? obj.code : baseCode;
  const messageRaw = obj.message;
  let message = 'Erro na requisição.';
  if (typeof messageRaw === 'string') {
    message = messageRaw;
  } else if (Array.isArray(messageRaw)) {
    const parts = messageRaw.filter((x): x is string => typeof x === 'string');
    message = parts.length > 0 ? parts.join(' ') : message;
  }

  const errors = Array.isArray(obj.errors) ? obj.errors : undefined;
  const details = obj.details !== undefined ? obj.details : undefined;
  const retryAfterSeconds =
    typeof obj.retryAfterSeconds === 'number' ? obj.retryAfterSeconds : undefined;

  const body: ApiErrorBody = {
    statusCode,
    code,
    message,
    path: requestPath,
  };

  if (errors?.length) {
    body.errors = errors as ApiErrorBody['errors'];
  }
  if (details !== undefined) {
    body.details = details;
  }
  if (retryAfterSeconds !== undefined) {
    body.retryAfterSeconds = retryAfterSeconds;
  }

  return body;
}

function isPayloadTooLargeException(exception: unknown): boolean {
  if (!exception || typeof exception !== 'object') {
    return false;
  }

  const candidate = exception as {
    status?: unknown;
    statusCode?: unknown;
    type?: unknown;
    name?: unknown;
  };

  return (
    candidate.status === HttpStatus.PAYLOAD_TOO_LARGE ||
    candidate.statusCode === HttpStatus.PAYLOAD_TOO_LARGE ||
    candidate.type === 'entity.too.large' ||
    candidate.name === 'PayloadTooLargeError'
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const path = typeof request?.url === 'string' ? request.url : '';
    const acceptLanguageHeader = request?.headers?.['accept-language'];
    const acceptLanguage = Array.isArray(acceptLanguageHeader)
      ? acceptLanguageHeader.join(',')
      : acceptLanguageHeader;
    const send = (body: ApiErrorBody) =>
      response.status(body.statusCode).json(localizeApiError(body, acceptLanguage));

    if (isPayloadTooLargeException(exception)) {
      send({
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Payload muito grande. Reduza o tamanho da requisicao.',
        path,
      } satisfies ApiErrorBody);
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const p = prismaKnownRequestToPayload(exception);
      const body: ApiErrorBody = {
        statusCode: p.status,
        code: p.code,
        message: p.message,
        path,
        ...(p.details !== undefined ? { details: p.details } : {}),
      };
      if (p.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(`${request.method} ${path} ${p.status}`, exception.stack);
      }
      send(body);
      return;
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.warn(`${request.method} ${path} PrismaClientValidationError`);
      send({
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'DATABASE_VALIDATION',
        message: 'Dados inválidos para consulta ao banco.',
        path,
      } satisfies ApiErrorBody);
      return;
    }

    if (
      exception instanceof Prisma.PrismaClientRustPanicError ||
      exception instanceof Prisma.PrismaClientUnknownRequestError ||
      exception instanceof Prisma.PrismaClientInitializationError
    ) {
      this.logger.error(
        `${request.method} ${path} Prisma fatal`,
        exception instanceof Error ? exception.stack : undefined,
      );
      send({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'DATABASE_UNAVAILABLE',
        message: 'Banco de dados temporariamente indisponível. Tente novamente em instantes.',
        path,
      } satisfies ApiErrorBody);
      return;
    }

    if (exception instanceof HttpException) {
      const body = normalizeHttpException(exception, path);
      if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(`${request.method} ${path} ${body.statusCode}`, exception.stack);
      }
      send(body);
      return;
    }

    this.logger.error(
      `${request.method} ${path} ${HttpStatus.INTERNAL_SERVER_ERROR}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    send({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor. Se persistir, entre em contato com o suporte.',
      path,
    } satisfies ApiErrorBody);
  }
}
