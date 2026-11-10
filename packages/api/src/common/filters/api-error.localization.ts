import { HttpStatus } from '@nestjs/common';
import { normalizeAcceptLanguage } from '../locale/accept-language';
import type { ApiErrorBody } from './http-exception.filter';

type ApiLocale = 'en' | 'pt' | 'es';
type MessageSet = Record<ApiLocale, string>;

const message = (pt: string, en: string, es: string): MessageSet => ({ pt, en, es });

const STATUS_MESSAGES: Record<number, MessageSet> = {
  [HttpStatus.BAD_REQUEST]: message(
    'A solicitação contém dados inválidos.',
    'The request contains invalid data.',
    'La solicitud contiene datos no válidos.',
  ),
  [HttpStatus.UNAUTHORIZED]: message(
    'Sua sessão não é válida. Entre novamente.',
    'Your session is not valid. Please sign in again.',
    'Tu sesión no es válida. Vuelve a iniciar sesión.',
  ),
  [HttpStatus.FORBIDDEN]: message(
    'Você não tem permissão para realizar esta ação.',
    'You do not have permission to perform this action.',
    'No tienes permiso para realizar esta acción.',
  ),
  [HttpStatus.NOT_FOUND]: message(
    'O item solicitado não foi encontrado.',
    'The requested item was not found.',
    'No se encontró el elemento solicitado.',
  ),
  [HttpStatus.CONFLICT]: message(
    'Os dados foram atualizados. Recarregue e tente novamente.',
    'The data has changed. Reload and try again.',
    'Los datos cambiaron. Vuelve a cargar e inténtalo de nuevo.',
  ),
  [HttpStatus.GONE]: message(
    'Esta ação não está mais disponível.',
    'This action is no longer available.',
    'Esta acción ya no está disponible.',
  ),
  [HttpStatus.UNPROCESSABLE_ENTITY]: message(
    'Não foi possível processar os dados informados.',
    'The provided data could not be processed.',
    'No se pudieron procesar los datos proporcionados.',
  ),
  [HttpStatus.PAYLOAD_TOO_LARGE]: message(
    'O arquivo é muito grande. Escolha um arquivo menor.',
    'The file is too large. Choose a smaller file.',
    'El archivo es demasiado grande. Elige uno más pequeño.',
  ),
  [HttpStatus.TOO_MANY_REQUESTS]: message(
    'Muitas tentativas. Aguarde um instante e tente novamente.',
    'Too many attempts. Wait a moment and try again.',
    'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  ),
  [HttpStatus.SERVICE_UNAVAILABLE]: message(
    'O serviço está temporariamente indisponível. Tente novamente em instantes.',
    'The service is temporarily unavailable. Try again shortly.',
    'El servicio no está disponible temporalmente. Inténtalo de nuevo en unos instantes.',
  ),
  [HttpStatus.INTERNAL_SERVER_ERROR]: message(
    'Ocorreu um erro interno. Tente novamente; se persistir, entre em contato com o suporte.',
    'An internal error occurred. Try again; if it persists, contact support.',
    'Ocurrió un error interno. Inténtalo de nuevo; si persiste, contacta con soporte.',
  ),
};

const CODE_MESSAGES: Record<string, MessageSet> = {
  INVALID_CREDENTIALS: message(
    'E-mail ou senha incorretos.',
    'Invalid email or password.',
    'Correo electrónico o contraseña incorrectos.',
  ),
  PASSWORD_RESET_TOKEN_INVALID: message(
    'Link de redefinição inválido ou expirado. Solicite um novo.',
    'This password reset link is invalid or expired. Request a new one.',
    'El enlace de restablecimiento no es válido o ha caducado. Solicita uno nuevo.',
  ),
  WORKOUT_BLOCKED: message(
    'A geração do treino está bloqueada pela condição de saúde informada. Procure orientação profissional.',
    'Workout generation is blocked for the reported health condition. Please seek professional guidance.',
    'La generación del entrenamiento está bloqueada por la condición de salud informada. Busca orientación profesional.',
  ),
  VALIDATION_ERROR: message(
    'Verifique os campos e tente novamente.',
    'Check the fields and try again.',
    'Revisa los campos e inténtalo de nuevo.',
  ),
  UNIQUE_VIOLATION: message(
    'Já existe um registro com esses dados.',
    'A record with this data already exists.',
    'Ya existe un registro con estos datos.',
  ),
  RECORD_NOT_FOUND: message(
    'O registro não foi encontrado ou já foi removido.',
    'The record was not found or has already been removed.',
    'No se encontró el registro o ya fue eliminado.',
  ),
  FOREIGN_KEY_VIOLATION: message(
    'Um registro relacionado não foi encontrado.',
    'A related record was not found.',
    'No se encontró un registro relacionado.',
  ),
  DATABASE_CONSTRAINT: message(
    'Não foi possível concluir a operação.',
    'The operation could not be completed.',
    'No se pudo completar la operación.',
  ),
  DATABASE_VALIDATION: message(
    'Os dados enviados são inválidos.',
    'The submitted data is invalid.',
    'Los datos enviados no son válidos.',
  ),
  DATABASE_UNAVAILABLE: message(
    'O serviço está temporariamente indisponível. Tente novamente em instantes.',
    'The service is temporarily unavailable. Try again shortly.',
    'El servicio no está disponible temporalmente. Inténtalo de nuevo en unos instantes.',
  ),
  PAYLOAD_TOO_LARGE: message(
    'O arquivo é muito grande. Escolha um arquivo menor.',
    'The file is too large. Choose a smaller file.',
    'El archivo es demasiado grande. Elige uno más pequeño.',
  ),
  INTERNAL_ERROR: message(
    'Ocorreu um erro interno. Tente novamente; se persistir, entre em contato com o suporte.',
    'An internal error occurred. Try again; if it persists, contact support.',
    'Ocurrió un error interno. Inténtalo de nuevo; si persiste, contacta con soporte.',
  ),
};

export function localizeApiError(body: ApiErrorBody, acceptLanguage?: string): ApiErrorBody {
  const locale: ApiLocale = normalizeAcceptLanguage(acceptLanguage) ?? 'en';
  const localized = CODE_MESSAGES[body.code] ?? STATUS_MESSAGES[body.statusCode];
  const fallback = STATUS_MESSAGES[HttpStatus.INTERNAL_SERVER_ERROR]!;

  return {
    ...body,
    message: (localized ?? fallback)[locale],
    ...(body.errors
      ? {
          errors: body.errors.map((error) => ({
            field: error.field,
            messages: [message('Valor inválido.', 'Invalid value.', 'Valor no válido.')[locale]],
          })),
        }
      : {}),
  };
}
