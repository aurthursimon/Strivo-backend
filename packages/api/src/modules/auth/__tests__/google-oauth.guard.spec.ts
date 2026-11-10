import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { GoogleOAuthCallbackGuard } from '../google-oauth.guard';

function contextWithQuery(query: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ query }) }),
  } as unknown as ExecutionContext;
}

describe('GoogleOAuthCallbackGuard', () => {
  const guard = new GoogleOAuthCallbackGuard();

  it('rejeita callback incompleto como erro de cliente em vez de erro interno', () => {
    expect(() => guard.canActivate(contextWithQuery({}))).toThrow(BadRequestException);
  });

  it('rejeita cancelamento informado pelo Google como erro de cliente', () => {
    expect(() =>
      guard.canActivate(contextWithQuery({ error: 'access_denied', state: 'signed-state' })),
    ).toThrow(BadRequestException);
  });
});
