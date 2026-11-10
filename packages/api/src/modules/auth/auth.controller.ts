import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  AppleMobileDto,
  RegisterDto,
  LoginDto,
  GoogleMobileDto,
  GuestDto,
  OAuthCodeExchangeDto,
  LinkPasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';
import { ENV_TOKEN } from '../../config';
import { CurrentUser, JwtAuthGuard, RateLimit } from '../../common';
import type { JwtPayload } from '../../common';
import type { Env } from '../../config';
import type { GoogleProfile } from './google.strategy';
import * as ms from 'ms';
import { GoogleOAuthCallbackGuard, GoogleOAuthStartGuard } from './google-oauth.guard';

const REFRESH_COOKIE = 'nutriscan_refresh';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  @Post('guest')
  @RateLimit({ name: 'auth.guest', limit: 30, windowSeconds: 3600, subject: 'ip' })
  @ApiOperation({ summary: 'Criar ou retomar conta convidada da instalacao' })
  async guest(@Body() dto: GuestDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.createGuest(dto.installationId);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('register')
  @RateLimit({ name: 'auth.register', limit: 5, windowSeconds: 3600, subject: 'ip' })
  @ApiOperation({ summary: 'Criar conta' })
  @ApiResponse({ status: 201, description: 'Conta criada' })
  @ApiResponse({ status: 409, description: 'E-mail ja cadastrado' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.register(dto);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('login')
  @RateLimit({ name: 'auth.login', limit: 10, windowSeconds: 300, subject: 'ip' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login' })
  @ApiResponse({ status: 200, description: 'Login realizado' })
  @ApiResponse({ status: 401, description: 'Credenciais invalidas' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('forgot-password')
  @RateLimit({ name: 'auth.forgot-password', limit: 5, windowSeconds: 3600, subject: 'ip' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Solicitar e-mail de redefinição de senha' })
  @ApiResponse({ status: 204, description: 'Solicitação recebida (sempre, exista ou não o e-mail)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
  }

  @Post('password/reset')
  @RateLimit({ name: 'auth.password.reset', limit: 10, windowSeconds: 3600, subject: 'ip' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Redefinir senha usando o token recebido por e-mail' })
  @ApiResponse({ status: 204, description: 'Senha redefinida' })
  @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('refresh')
  @RateLimit({ name: 'auth.refresh', limit: 30, windowSeconds: 300, subject: 'ip' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token via refresh token' })
  @ApiResponse({ status: 200, description: 'Token renovado' })
  @ApiResponse({ status: 401, description: 'Refresh token invalido' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const currentToken = this.extractRefreshToken(req);
    const tokens = await this.authService.refreshTokens(currentToken);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout (revoga refresh token)' })
  @ApiResponse({ status: 204, description: 'Logout realizado' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.tryExtractRefreshToken(req);
    if (token) {
      await this.authService.logout(token);
    } else {
      const accessToken = this.extractBearerToken(req);
      if (accessToken) {
        await this.authService.logoutByAccessToken(accessToken);
      }
    }
    this.clearRefreshCookie(res);
  }

  @Get('google')
  @UseGuards(GoogleOAuthStartGuard)
  @ApiOperation({ summary: 'Iniciar OAuth Google com state e PKCE S256' })
  @ApiResponse({ status: 302, description: 'Redireciona para Google' })
  googleAuth() {
    // Guard redireciona automaticamente
  }

  @Get('google/callback')
  @UseGuards(GoogleOAuthCallbackGuard)
  @ApiExcludeEndpoint()
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as GoogleProfile;
    const signedState = typeof req.query.state === 'string' ? req.query.state : '';
    const authorization = await this.authService.createGoogleAuthorizationCode(
      profile,
      signedState,
    );
    const redirectUrl = new URL('/auth/callback', this.env.FRONTEND_URL);
    redirectUrl.searchParams.set('code', authorization.code);
    redirectUrl.searchParams.set('state', authorization.state);
    res.redirect(redirectUrl.toString());
  }

  @Post('oauth/exchange')
  @RateLimit({ name: 'auth.oauth.exchange', limit: 20, windowSeconds: 300, subject: 'ip' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trocar codigo OAuth de uso unico por tokens usando PKCE' })
  async exchangeOAuthCode(
    @Body() dto: OAuthCodeExchangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.exchangeOAuthCode(dto);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('google/mobile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Google login via mobile idToken' })
  @ApiResponse({ status: 200, description: 'Login Google mobile realizado' })
  @ApiResponse({ status: 401, description: 'Token Google invalido' })
  async googleMobile(@Body() dto: GoogleMobileDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.googleMobileLogin(dto.idToken, dto.nonce);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('apple/mobile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apple login via mobile identityToken' })
  @ApiResponse({ status: 200, description: 'Login Apple mobile realizado' })
  @ApiResponse({ status: 401, description: 'Token Apple invalido' })
  async appleMobile(@Body() dto: AppleMobileDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.appleMobileLogin(
      dto.identityToken,
      dto.nonce,
      dto.name,
      dto.authorizationCode,
    );
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  @Post('link/google')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ name: 'auth.link.google', limit: 10, windowSeconds: 3600, subject: 'ip-user' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vincular Google a conta convidada autenticada' })
  linkGoogle(@CurrentUser() user: JwtPayload, @Body() dto: GoogleMobileDto) {
    return this.authService.linkGoogle(user.sub, dto.idToken, dto.nonce);
  }

  @Post('link/register')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ name: 'auth.link.register', limit: 10, windowSeconds: 3600, subject: 'ip-user' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Converter conta convidada em conta local com e-mail e senha' })
  linkPassword(@CurrentUser() user: JwtPayload, @Body() dto: LinkPasswordDto) {
    return this.authService.linkPassword(user.sub, dto);
  }

  @Post('link/apple')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ name: 'auth.link.apple', limit: 10, windowSeconds: 3600, subject: 'ip-user' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vincular Apple a conta convidada autenticada' })
  linkApple(@CurrentUser() user: JwtPayload, @Body() dto: AppleMobileDto) {
    return this.authService.linkApple(
      user.sub,
      dto.identityToken,
      dto.nonce,
      dto.name,
      dto.authorizationCode,
    );
  }

  @Post('apple/deletion-authorization')
  @UseGuards(JwtAuthGuard)
  @RateLimit({ name: 'auth.apple.delete', limit: 5, windowSeconds: 3600, subject: 'ip-user' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revalidar Apple e preparar revogacao antes de excluir a conta' })
  prepareAppleDeletion(@CurrentUser() user: JwtPayload, @Body() dto: AppleMobileDto) {
    if (!dto.authorizationCode) {
      throw new UnauthorizedException({
        code: 'APPLE_AUTHORIZATION_CODE_REQUIRED',
        message: 'Confirme novamente sua conta Apple.',
      });
    }
    return this.authService.prepareAppleAccountDeletion(
      user.sub,
      dto.identityToken,
      dto.nonce,
      dto.authorizationCode,
    );
  }

  private extractRefreshToken(req: Request): string {
    const token = this.tryExtractRefreshToken(req);
    if (token) return token;

    throw new UnauthorizedException({
      code: 'REFRESH_TOKEN_MISSING',
      message: 'Sessao nao encontrada. Faca login novamente.',
    });
  }

  private tryExtractRefreshToken(req: Request): string | undefined {
    // Web clients: httpOnly cookie
    const fromCookie = (req.cookies as Record<string, string | undefined>)?.[REFRESH_COOKIE];
    if (fromCookie) return fromCookie;

    // Mobile clients: request body
    const fromBody = (req.body as Record<string, unknown>)?.refreshToken;
    if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody;

    return undefined;
  }

  private extractBearerToken(req: Request): string | undefined {
    const authorization = req.header('authorization');
    if (!authorization) return undefined;
    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return undefined;
    return token;
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      // Web clients (web-funnel on Vercel) and this API (Render) are on
      // entirely different sites - every request between them is
      // cross-site. 'strict' (and 'lax', for that matter) cookies are never
      // sent cross-site by the browser at all, so this cookie was silently
      // never delivered back to the API on ANY subsequent request once set
      // - not a race, not a market-specific bug, it just never worked once
      // deployed. 'none' is the only SameSite value the browser will
      // actually send cross-site, and requires secure:true (already set
      // above for production). Non-production stays 'lax': local dev runs
      // frontend and backend on the same site (just different localhost
      // ports), where 'lax' already works and 'none' would need HTTPS.
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: ms(this.env.JWT_REFRESH_EXPIRATION as ms.StringValue),
      path: '/',
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    });
  }
}
