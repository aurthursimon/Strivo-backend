import { BadRequestException, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { AuthService } from './auth.service';

@Injectable()
export class GoogleOAuthStartGuard extends AuthGuard('google') {
  constructor(private readonly authService: AuthService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const state = typeof request.query.state === 'string' ? request.query.state : '';
    const codeChallenge =
      typeof request.query.code_challenge === 'string' ? request.query.code_challenge : '';
    const method =
      typeof request.query.code_challenge_method === 'string'
        ? request.query.code_challenge_method
        : '';

    if (state.length < 16 || state.length > 512) {
      throw new BadRequestException({
        code: 'OAUTH_STATE_REQUIRED',
        message: 'state OAuth invalido ou ausente.',
      });
    }
    if (method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
      throw new BadRequestException({
        code: 'OAUTH_PKCE_REQUIRED',
        message: 'PKCE S256 e obrigatorio para iniciar o OAuth.',
      });
    }

    return {
      scope: ['email', 'profile'],
      state: this.authService.createOAuthState(state, codeChallenge),
    };
  }
}

@Injectable()
export class GoogleOAuthCallbackGuard extends AuthGuard('google') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const code = typeof request.query.code === 'string' ? request.query.code : '';
    const state = typeof request.query.state === 'string' ? request.query.state : '';
    const providerError = typeof request.query.error === 'string' ? request.query.error : undefined;

    if (providerError || !code || !state) {
      throw new BadRequestException({
        code: providerError ? 'OAUTH_PROVIDER_ERROR' : 'OAUTH_CALLBACK_INVALID',
        message: providerError
          ? 'Autorizacao Google cancelada ou recusada.'
          : 'Callback OAuth invalido ou incompleto.',
      });
    }

    return super.canActivate(context);
  }
}
