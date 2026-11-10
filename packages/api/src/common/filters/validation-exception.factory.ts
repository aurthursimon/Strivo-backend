import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { flattenValidationErrors } from './exception-normalizer';

export function createValidationException(
  validationErrors: ValidationError[],
): BadRequestException {
  const errors = flattenValidationErrors(validationErrors);
  const first = errors[0];
  const summary =
    errors.length === 1 && first
      ? `${first.messages[0] ?? 'Campo inválido.'} (campo: ${first.field})`
      : 'Verifique os campos do formulário e tente novamente.';
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: summary,
    errors,
  });
}
