import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

describe('AllExceptionsFilter', () => {
  it('preserva retryAfterSeconds em respostas 429', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const request = { method: 'POST', url: '/api/auth/login' };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
    const filter = new AllExceptionsFilter();

    filter.catch(
      new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Muitas tentativas. Aguarde alguns instantes e tente novamente.',
          retryAfterSeconds: 42,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        retryAfterSeconds: 42,
        path: '/api/auth/login',
      }),
    );
  });

  it.each([
    ['en-US', 'The requested item was not found.', 'Invalid value.'],
    ['pt-BR', 'O item solicitado não foi encontrado.', 'Valor inválido.'],
    ['es-419', 'No se encontró el elemento solicitado.', 'Valor no válido.'],
  ])('localiza toda a resposta de erro para %s', (acceptLanguage, message, fieldMessage) => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const request = {
      method: 'GET',
      url: '/api/example',
      headers: { 'accept-language': acceptLanguage },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter().catch(
      new HttpException(
        {
          code: 'EXAMPLE_NOT_FOUND',
          message: 'Mensagem interna que nunca deve vazar.',
          errors: [{ field: 'name', messages: ['Campo inválido.'] }],
        },
        HttpStatus.NOT_FOUND,
      ),
      host,
    );

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'EXAMPLE_NOT_FOUND',
        message,
        errors: [{ field: 'name', messages: [fieldMessage] }],
      }),
    );
  });
});

describe('login error messages', () => {
  it.each([
    ['en', 'Invalid email or password.'],
    ['es', 'Correo electrónico o contraseña incorrectos.'],
    ['pt', 'E-mail ou senha incorretos.'],
  ])('does not describe invalid credentials as an expired session in %s', (locale, expectedMessage) => {
    const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ method: 'POST', url: '/api/auth/login', headers: { 'accept-language': locale } }) }) } as unknown as ArgumentsHost;
    new AllExceptionsFilter().catch(new HttpException({ code: 'INVALID_CREDENTIALS', message: 'internal' }, HttpStatus.UNAUTHORIZED), host);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'INVALID_CREDENTIALS', message: expectedMessage }));
  });
});
