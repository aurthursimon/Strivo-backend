import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ValidationError } from 'class-validator';

export const HTTP_STATUS_DEFAULT_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

export function defaultHttpCodeForStatus(status: number): string {
  return HTTP_STATUS_DEFAULT_CODES[status] ?? 'HTTP_ERROR';
}

export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): Array<{ field: string; messages: string[] }> {
  const out: Array<{ field: string; messages: string[] }> = [];
  for (const err of errors) {
    const field = parent ? `${parent}.${err.property}` : err.property;
    if (err.constraints) {
      out.push({ field, messages: Object.values(err.constraints) });
    }
    if (err.children?.length) {
      out.push(...flattenValidationErrors(err.children, field));
    }
  }
  return out;
}

export function prismaKnownRequestToPayload(e: Prisma.PrismaClientKnownRequestError): {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  switch (e.code) {
    case 'P2002': {
      const meta = e.meta?.target;
      const fields = Array.isArray(meta) ? meta : meta != null ? [String(meta)] : [];
      return {
        status: HttpStatus.CONFLICT,
        code: 'UNIQUE_VIOLATION',
        message:
          fields.length > 0
            ? `Já existe um registro com o mesmo valor para: ${fields.join(', ')}.`
            : 'Este registro já existe e não pode ser duplicado.',
        details: { prismaCode: e.code, fields },
      };
    }
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'RECORD_NOT_FOUND',
        message: 'Registro não encontrado ou já foi removido.',
        details: { prismaCode: e.code },
      };
    case 'P2003':
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'FOREIGN_KEY_VIOLATION',
        message: 'Referência inválida: registro relacionado não foi encontrado.',
        details: { prismaCode: e.code },
      };
    default:
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'DATABASE_CONSTRAINT',
        message: 'Não foi possível concluir a operação no banco de dados.',
        details: { prismaCode: e.code },
      };
  }
}
