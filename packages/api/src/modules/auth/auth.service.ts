import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as ms from 'ms';
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPrivateKey,
  createPublicKey,
  createVerify,
  randomBytes,
  sign,
  timingSafeEqual,
} from 'crypto';
import { Prisma, ScanAccountCleanupStatus } from '@prisma/client';
import { PrismaService } from '../../prisma';
import { ReferralsService } from '../referrals';
import { ProductAnalyticsService } from '../product-analytics';
import { EmailService } from './email.service';
import { ENV_TOKEN } from '../../config';
import type { Env } from '../../config';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { LinkPasswordDto } from './dto/link-password.dto';
import type { GoogleProfile } from './google.strategy';
import type { OAuthCodeExchangeDto } from './dto';
import {
  legacyAppleIdentitySubjectHash,
  lockSocialIdentity,
  socialIdentitySubjectHash,
} from './social-identity-lock';

const BCRYPT_ROUNDS = 12;
const APPLE_LEGACY_KEY_ID = 'legacy-jwt-refresh-v1';
const AES_GCM_IV_BYTES = 12;
const AES_GCM_AUTH_TAG_BYTES = 16;

export function resolveGoogleMobileAudiences(config: {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_ANDROID_CLIENT_ID?: string;
  GOOGLE_IOS_CLIENT_ID?: string;
}): string[] {
  return [config.GOOGLE_CLIENT_ID, config.GOOGLE_ANDROID_CLIENT_ID, config.GOOGLE_IOS_CLIENT_ID]
    .map((audience) => audience?.trim())
    .filter((audience): audience is string => Boolean(audience))
    .filter((audience, index, audiences) => audiences.indexOf(audience) === index);
}

interface TokenPayload {
  sub: string;
  email: string | null;
}

interface AppleJwtHeader {
  alg?: string;
  kid?: string;
}

interface AppleIdentityPayload {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  nonce?: string;
}

interface AppleJwk {
  kid: string;
  alg?: string;
  kty: string;
  n: string;
  e: string;
}

interface AppleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
}

type AppleRevocationTokenType = 'refresh_token' | 'access_token';

interface AppleRevocationToken {
  token: string;
  type: AppleRevocationTokenType;
}

export interface StoredAppleRevocationCredential {
  tokenCiphertext: string;
  tokenIv: string;
  tokenTag: string;
  tokenType: string;
  tokenKeyId?: string | null;
}

interface OAuthStatePayload {
  clientState: string;
  codeChallenge: string;
  expiresAt: number;
  nonce: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly referralsService: ReferralsService,
    private readonly productAnalyticsService: ProductAnalyticsService,
    private readonly emailService: EmailService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  async createGuest(installationId: string) {
    const guestInstallationHash = createHmac('sha256', this.env.JWT_ACCESS_SECRET)
      .update(installationId)
      .digest('hex');
    const guestName = this.guestDisplayName(guestInstallationHash);
    let user = await this.prisma.user.findUnique({ where: { guestInstallationHash } });

    if (!user) {
      try {
        user = await this.prisma.user.create({
          data: {
            email: null,
            name: guestName,
            provider: 'GUEST',
            guestInstallationHash,
          },
        });
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error;
        user = await this.prisma.user.findUnique({ where: { guestInstallationHash } });
      }
    }

    if (!user || user.deletedAt || user.provider !== 'GUEST') {
      throw new UnauthorizedException({
        code: 'GUEST_SESSION_INVALID',
        message: 'Nao foi possivel iniciar a conta convidada.',
      });
    }

    if (user.name === 'My Peptides User') {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { name: guestName },
      });
    }
    return this.generateTokens(user.id, user.email);
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'Este e-mail já está cadastrado. Use outro e-mail ou faça login.',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash,
      },
    });

    await this.referralsService.ensureUserReferralCode(user.id);
    await this.referralsService.tryAttachInviter(user.id, dto.referralCode);

    if (dto.visitorId) {
      await this.productAnalyticsService.attachVisitorToUser(user.id, dto.visitorId);
    }

    return this.generateTokens(user.id, user.email);
  }

  async refreshTokens(currentToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: currentToken },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.user.deletedAt) {
      if (stored?.familyId) {
        await this.prisma.refreshToken.updateMany({
          where: { familyId: stored.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_INVALID',
        message: 'Sessão expirada ou inválida. Faça login novamente.',
      });
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(stored.userId, stored.user.email, stored.familyId ?? stored.id);
  }

  async logout(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (stored) {
      await this.prisma.refreshToken.updateMany({
        where: {
          OR: [{ id: stored.id }, { familyId: stored.familyId ?? stored.id }],
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }
  }

  async logoutByAccessToken(accessToken: string) {
    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(accessToken, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'Token de acesso invalido.',
      });
    }

    await this.prisma.refreshToken.updateMany({
      where: { userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async googleLogin(profile: GoogleProfile) {
    const result = await this.prisma.$transaction(async (tx) => {
      await lockSocialIdentity(tx, 'GOOGLE', profile.googleId);
      await this.assertSocialIdentityCleanupFinished('GOOGLE', profile.googleId, tx);
      const user = await this.findOrCreateGoogleUser(profile, tx);
      const tokens = await this.generateTokens(user.id, user.email, undefined, tx);
      return { tokens, userId: user.id };
    });
    await this.referralsService.ensureUserReferralCode(result.userId);
    return result.tokens;
  }

  createOAuthState(clientState: string, codeChallenge: string): string {
    const payload: OAuthStatePayload = {
      clientState,
      codeChallenge,
      expiresAt: Date.now() + 10 * 60 * 1000,
      nonce: randomBytes(16).toString('base64url'),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.env.JWT_ACCESS_SECRET)
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }

  async createGoogleAuthorizationCode(profile: GoogleProfile, signedState: string) {
    const state = this.verifyOAuthState(signedState);
    const code = randomBytes(32).toString('base64url');
    const userId = await this.prisma.$transaction(async (tx) => {
      await lockSocialIdentity(tx, 'GOOGLE', profile.googleId);
      await this.assertSocialIdentityCleanupFinished('GOOGLE', profile.googleId, tx);
      const user = await this.findOrCreateGoogleUser(profile, tx);
      await tx.oAuthAuthorizationCode.create({
        data: {
          codeHash: this.hash(code),
          userId: user.id,
          clientState: state.clientState,
          codeChallenge: state.codeChallenge,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
      return user.id;
    });
    await this.referralsService.ensureUserReferralCode(userId);
    return { code, state: state.clientState };
  }

  async exchangeOAuthCode(dto: OAuthCodeExchangeDto) {
    const codeHash = this.hash(dto.code);
    const authorization = await this.prisma.oAuthAuthorizationCode.findUnique({
      where: { codeHash },
      include: { user: true },
    });
    const valid =
      authorization &&
      !authorization.consumedAt &&
      authorization.expiresAt > new Date() &&
      !authorization.user.deletedAt &&
      authorization.clientState === dto.state &&
      this.pkceChallenge(dto.codeVerifier) === authorization.codeChallenge;

    if (!valid) {
      throw new UnauthorizedException({
        code: 'OAUTH_CODE_INVALID',
        message: 'Codigo OAuth invalido, expirado ou ja utilizado.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.oAuthAuthorizationCode.updateMany({
        where: {
          id: authorization.id,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException({
          code: 'OAUTH_CODE_INVALID',
          message: 'Codigo OAuth invalido, expirado ou ja utilizado.',
        });
      }
      return this.generateTokens(authorization.user.id, authorization.user.email, undefined, tx);
    });
  }

  private async findOrCreateGoogleUser(
    profile: GoogleProfile,
    db: Prisma.TransactionClient | PrismaService,
  ) {
    const email = profile.email.toLowerCase();
    let user = await db.user.findUnique({ where: { email } });
    if (!user) {
      user = await db.user.findFirst({
        where: { provider: 'GOOGLE' as never, providerId: profile.googleId },
      });
    }

    if (user?.deletedAt) {
      const deletedUserId = user.id;
      const removed = await db.user.deleteMany({
        where: {
          id: deletedUserId,
          deletedAt: { not: null },
          OR: [{ provider: 'GOOGLE' as never, providerId: profile.googleId }, { email }],
        },
      });
      if (removed.count !== 1) {
        throw new ConflictException({
          code: 'GOOGLE_REACTIVATION_RACE',
          message: 'A conta Google ja foi reativada em outra sessao.',
        });
      }
      user = await db.user.create({
        data: {
          email,
          name: profile.name,
          avatarUrl: profile.picture,
          provider: 'GOOGLE' as never,
          providerId: profile.googleId,
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });
    } else if (user) {
      if (user.provider !== 'GOOGLE' || user.providerId !== profile.googleId) {
        user = await db.user.update({
          where: { id: user.id },
          data: {
            provider: 'GOOGLE',
            providerId: profile.googleId,
            avatarUrl: user.avatarUrl ?? profile.picture,
            emailVerified: true,
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          },
        });
      }
    } else {
      user = await db.user.create({
        data: {
          email,
          name: profile.name,
          avatarUrl: profile.picture,
          provider: 'GOOGLE',
          providerId: profile.googleId,
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });
    }

    return user;
  }

  private async verifyGoogleMobileProfile(idToken: string, expectedNonce?: string) {
    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client(this.env.GOOGLE_CLIENT_ID);
    const audiences = resolveGoogleMobileAudiences(this.env);

    if (audiences.length === 0) {
      throw new UnauthorizedException({
        code: 'GOOGLE_NOT_CONFIGURED',
        message: 'Login Google indisponivel.',
      });
    }

    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken,
        audience: audiences,
      });
    } catch {
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_INVALID',
        message: 'Token Google invalido.',
      });
    }

    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_INVALID',
        message: 'Token Google invalido.',
      });
    }

    if (expectedNonce && payload.nonce !== expectedNonce) {
      throw new UnauthorizedException({
        code: 'GOOGLE_TOKEN_INVALID',
        message: 'Token Google invalido.',
      });
    }

    return {
      email: payload.email,
      name: payload.name ?? payload.email.split('@')[0] ?? '',
      picture: payload.picture,
      googleId: payload.sub,
    } satisfies GoogleProfile;
  }

  async googleMobileLogin(idToken: string, nonce?: string) {
    const profile = await this.verifyGoogleMobileProfile(idToken, nonce);
    return this.googleLogin(profile);
  }

  async linkGoogle(userId: string, idToken: string, nonce?: string) {
    const profile = await this.verifyGoogleMobileProfile(idToken, nonce);
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockSocialIdentity(tx, 'GOOGLE', profile.googleId);
        await this.assertSocialIdentityCleanupFinished('GOOGLE', profile.googleId, tx);
        await this.linkGuestIdentity(
          userId,
          {
            provider: 'GOOGLE',
            providerId: profile.googleId,
            email: profile.email.toLowerCase(),
            name: profile.name,
            avatarUrl: profile.picture,
          },
          tx,
        );
      });
    } catch (error) {
      this.rethrowSocialIdentityConflict(error);
    }
    await this.referralsService.ensureUserReferralCode(userId);
    return { linked: true as const, provider: 'GOOGLE' as const };
  }

  /**
   * Upgrade a GUEST account to a permanent email/password account, preserving
   * the same User.id (and therefore every Goal, DietPlan, GLP1 and referral
   * row already linked to it from the quiz). Mirrors the row-locking and
   * conflict checks of linkGuestIdentity (used by linkGoogle/linkApple)
   * without touching that shared helper, since it is keyed on a third-party
   * provider+providerId pair that does not apply to local credentials.
   */
  async linkPassword(userId: string, dto: LinkPasswordDto) {
    const email = dto.email.toLowerCase();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "users" WHERE "id" = ${userId} AND "deletedAt" IS NULL FOR UPDATE
      `;
      const current = await tx.user.findFirst({ where: { id: userId, deletedAt: null } });
      if (!current) {
        throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'Conta desativada.' });
      }
      if (current.provider !== 'GUEST') {
        throw new ConflictException({
          code: 'ACCOUNT_ALREADY_SECURED',
          message: 'Esta conta ja esta protegida.',
        });
      }

      const conflict = await tx.user.findFirst({
        where: { id: { not: userId }, deletedAt: null, email },
        select: { id: true },
      });
      if (conflict) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_REGISTERED',
          message: 'Este e-mail já está cadastrado. Use outro e-mail ou faça login.',
        });
      }

      const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      try {
        await tx.user.update({
          where: { id: userId },
          data: {
            email,
            name: dto.name,
            passwordHash,
            provider: 'EMAIL',
            guestInstallationHash: null,
          },
        });
      } catch (error) {
        if (this.isUniqueConstraintError(error)) {
          throw new ConflictException({
            code: 'EMAIL_ALREADY_REGISTERED',
            message: 'Este e-mail já está cadastrado. Use outro e-mail ou faça login.',
          });
        }
        throw error;
      }
    });
    await this.referralsService.ensureUserReferralCode(userId);
    return { linked: true as const, provider: 'EMAIL' as const };
  }

  async linkApple(
    userId: string,
    identityToken: string,
    nonce: string,
    name?: string,
    authorizationCode?: string,
  ) {
    const payload = await this.verifyAppleIdentityToken(identityToken, nonce);
    if (!payload.sub) {
      throw new UnauthorizedException({
        code: 'APPLE_TOKEN_INVALID',
        message: 'Token Apple invalido.',
      });
    }
    await this.assertSocialIdentityCleanupFinished('APPLE', payload.sub);
    if (!authorizationCode) {
      throw new UnauthorizedException({
        code: 'APPLE_REAUTH_REQUIRED',
        message: 'Autorize novamente sua conta Apple para proteger esta conta.',
      });
    }
    const email = payload.email?.toLowerCase() ?? null;
    const revocationToken = await this.exchangeAppleAuthorizationCode(
      authorizationCode,
      payload.sub,
    );
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockSocialIdentity(tx, 'APPLE', payload.sub!);
        await this.assertSocialIdentityCleanupFinished('APPLE', payload.sub!, tx);
        await this.linkGuestIdentity(
          userId,
          {
            provider: 'APPLE',
            providerId: payload.sub!,
            email,
            name: this.firstName(name),
          },
          tx,
        );
        await this.storeAppleRevocationToken(userId, revocationToken, tx);
      });
    } catch (error) {
      this.rethrowSocialIdentityConflict(error);
    }
    await this.referralsService.ensureUserReferralCode(userId);
    return { linked: true as const, provider: 'APPLE' as const };
  }

  private async linkGuestIdentity(
    userId: string,
    identity: {
      provider: 'GOOGLE' | 'APPLE';
      providerId: string;
      email: string | null;
      name?: string;
      avatarUrl?: string;
    },
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    await db.$queryRaw`
      SELECT "id" FROM "users" WHERE "id" = ${userId} AND "deletedAt" IS NULL FOR UPDATE
    `;
    const current = await db.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!current) {
      throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'Conta desativada.' });
    }
    if (current.provider !== 'GUEST') {
      throw new ConflictException({
        code: 'ACCOUNT_ALREADY_SECURED',
        message: 'Esta conta ja esta protegida.',
      });
    }

    const conflictConditions: Prisma.UserWhereInput[] = [
      { provider: identity.provider, providerId: identity.providerId },
    ];
    if (identity.email) conflictConditions.push({ email: identity.email });
    const conflict = await db.user.findFirst({
      where: {
        id: { not: userId },
        deletedAt: null,
        OR: conflictConditions,
      },
      select: { id: true },
    });
    if (conflict) {
      throw new ConflictException({
        code: 'SOCIAL_ACCOUNT_ALREADY_LINKED',
        message: 'Esta conta Apple ou Google ja esta vinculada a outro usuario.',
      });
    }

    const deletedIdentity = await db.user.findFirst({
      where: {
        provider: identity.provider,
        providerId: identity.providerId,
        deletedAt: { not: null },
      },
      select: { id: true },
    });

    const securedIdentity = {
      provider: identity.provider,
      providerId: identity.providerId,
      email: identity.email,
      name: identity.name || current.name,
      avatarUrl: current.avatarUrl ?? identity.avatarUrl,
      emailVerified: true,
      emailVerifiedAt: current.emailVerifiedAt ?? new Date(),
      guestInstallationHash: null,
    } as const;

    if (deletedIdentity) {
      const removed = await db.user.deleteMany({
        where: {
          id: deletedIdentity.id,
          provider: identity.provider,
          providerId: identity.providerId,
          deletedAt: { not: null },
        },
      });
      if (removed.count !== 1) {
        throw new ConflictException({
          code: 'SOCIAL_ACCOUNT_ALREADY_LINKED',
          message: 'Esta conta Apple ou Google ja esta vinculada a outro usuario.',
        });
      }
    }
    await db.user.update({ where: { id: userId }, data: securedIdentity });
    return { linked: true as const, provider: identity.provider };
  }

  async appleMobileLogin(
    identityToken: string,
    nonce: string,
    name?: string,
    authorizationCode?: string,
  ) {
    const payload = await this.verifyAppleIdentityToken(identityToken, nonce);
    const providerId = payload.sub;
    if (!providerId) {
      throw new UnauthorizedException({
        code: 'APPLE_TOKEN_INVALID',
        message: 'Token Apple invalido.',
      });
    }
    await this.assertSocialIdentityCleanupFinished('APPLE', providerId);

    const email = payload.email?.toLowerCase();
    let preliminaryUser = await this.prisma.user.findFirst({
      where: { provider: 'APPLE' as never, providerId },
    });

    if (!preliminaryUser && email) {
      preliminaryUser = await this.prisma.user.findUnique({ where: { email } });
    }

    if ((!preliminaryUser || preliminaryUser.deletedAt) && !authorizationCode) {
      throw new UnauthorizedException({
        code: 'APPLE_REAUTH_REQUIRED',
        message: 'Autorize novamente sua conta Apple para criar uma nova identidade.',
      });
    }
    const revocationToken = authorizationCode
      ? await this.exchangeAppleAuthorizationCode(authorizationCode, providerId)
      : null;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await lockSocialIdentity(tx, 'APPLE', providerId);
        await this.assertSocialIdentityCleanupFinished('APPLE', providerId, tx);

        let user = await tx.user.findFirst({
          where: { provider: 'APPLE' as never, providerId },
        });
        if (!user && email) user = await tx.user.findUnique({ where: { email } });
        const reactivating = Boolean(user?.deletedAt);
        if ((!user || reactivating) && !revocationToken) {
          throw new UnauthorizedException({
            code: 'APPLE_REAUTH_REQUIRED',
            message: 'Autorize novamente sua conta Apple para criar uma nova identidade.',
          });
        }
        const resolvedName =
          this.firstName(name) ||
          (reactivating ? undefined : user?.name) ||
          email?.split('@')[0] ||
          'Apple User';

        if (user?.deletedAt) {
          const removed = await tx.user.deleteMany({
            where: {
              id: user.id,
              provider: 'APPLE' as never,
              providerId,
              deletedAt: { not: null },
            },
          });
          if (removed.count !== 1) {
            throw new ConflictException({
              code: 'APPLE_REACTIVATION_RACE',
              message: 'A conta Apple ja foi reativada em outra sessao.',
            });
          }
          user = await tx.user.create({
            data: {
              email: email ?? null,
              name: resolvedName,
              provider: 'APPLE' as never,
              providerId,
              emailVerified: true,
              emailVerifiedAt: new Date(),
            },
          });
        } else if (user) {
          if (
            user.provider !== 'APPLE' ||
            user.providerId !== providerId ||
            !user.emailVerified ||
            (!user.email && Boolean(email))
          ) {
            user = await tx.user.update({
              where: { id: user.id },
              data: {
                provider: 'APPLE' as never,
                providerId,
                email: user.email ?? email,
                name: user.name || resolvedName,
                emailVerified: true,
                emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
                deletedAt: null,
              },
            });
          }
        } else {
          user = await tx.user.create({
            data: {
              email: email ?? null,
              name: resolvedName,
              provider: 'APPLE' as never,
              providerId,
              emailVerified: true,
              emailVerifiedAt: new Date(),
            },
          });
        }

        if (revocationToken) await this.storeAppleRevocationToken(user.id, revocationToken, tx);
        const tokens = await this.generateTokens(user.id, user.email, undefined, tx);
        return { tokens, userId: user.id };
      });
      await this.referralsService.ensureUserReferralCode(result.userId);
      return result.tokens;
    } catch (error) {
      this.rethrowSocialIdentityConflict(error);
    }
  }

  async prepareAppleAccountDeletion(
    userId: string,
    identityToken: string,
    nonce: string,
    authorizationCode: string,
  ) {
    const payload = await this.verifyAppleIdentityToken(identityToken, nonce);
    if (!payload.sub) {
      throw new UnauthorizedException({
        code: 'APPLE_ACCOUNT_MISMATCH',
        message: 'A conta Apple confirmada nao corresponde ao usuario autenticado.',
      });
    }

    const preliminaryUser = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { provider: true, providerId: true },
    });
    if (
      !preliminaryUser ||
      preliminaryUser.provider !== 'APPLE' ||
      payload.sub !== preliminaryUser.providerId
    ) {
      throw new UnauthorizedException({
        code: 'APPLE_ACCOUNT_MISMATCH',
        message: 'A conta Apple confirmada nao corresponde ao usuario autenticado.',
      });
    }

    const revocationToken = await this.exchangeAppleAuthorizationCode(
      authorizationCode,
      payload.sub,
    );
    await this.prisma.$transaction(async (tx) => {
      await lockSocialIdentity(tx, 'APPLE', payload.sub!);
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { provider: true, providerId: true },
      });
      if (!user || user.provider !== 'APPLE' || payload.sub !== user.providerId) {
        throw new UnauthorizedException({
          code: 'APPLE_ACCOUNT_MISMATCH',
          message: 'A conta Apple confirmada nao corresponde ao usuario autenticado.',
        });
      }
      await this.assertSocialIdentityCleanupFinished('APPLE', payload.sub!, tx);
      await this.storeAppleRevocationToken(userId, revocationToken, tx);
    });
    return { prepared: true as const };
  }

  async revokeAppleAuthorization(userId: string): Promise<void> {
    const credential = await this.prisma.appleCredential.findUnique({ where: { userId } });
    if (!credential) {
      throw new ConflictException({
        code: 'APPLE_REAUTH_REQUIRED',
        message: 'Confirme novamente sua conta Apple antes de exclui-la.',
      });
    }

    await this.revokeAppleAuthorizationCredential(credential);
  }

  async revokeAppleAuthorizationCredential(
    credential: StoredAppleRevocationCredential,
  ): Promise<void> {
    const token = this.decryptAppleToken(
      credential.tokenCiphertext,
      credential.tokenIv,
      credential.tokenTag,
      credential.tokenKeyId,
    );
    const tokenType = credential.tokenType as AppleRevocationTokenType;
    if (tokenType !== 'refresh_token' && tokenType !== 'access_token') {
      throw new ServiceUnavailableException({
        code: 'APPLE_REVOCATION_UNAVAILABLE',
        message: 'Nao foi possivel revogar o vinculo Apple agora.',
      });
    }

    const response = await this.appleRequest('https://appleid.apple.com/auth/revoke', {
      client_id: this.appleClientId(),
      client_secret: this.createAppleClientSecret(),
      token,
      token_type_hint: tokenType,
    });
    if (!response.ok) {
      throw new ServiceUnavailableException({
        code: 'APPLE_REVOCATION_UNAVAILABLE',
        message: 'Nao foi possivel revogar o vinculo Apple agora.',
      });
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha incorretos.',
      });
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatch) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha incorretos.',
      });
    }

    return this.generateTokens(user.id, user.email);
  }

  /**
   * Always resolves the same way regardless of whether the email is
   * registered - the controller returns one generic response either way,
   * so nothing here can be used to probe which emails have accounts.
   * Social-only accounts (no passwordHash) are treated the same as "not
   * found": there's no password on that account to reset.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
    if (!user?.passwordHash || !user.email) return;

    const rawToken = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        tokenHash: this.hash(rawToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const resetUrl = `${this.env.APP_URL}/auth/reset-password?${new URLSearchParams({ token: rawToken }).toString()}`;
    await this.emailService.send({
      to: user.email,
      subject: 'Redefinir sua senha - My Peptides',
      html:
        '<p>Recebemos um pedido para redefinir a senha da sua conta My Peptides.</p>' +
        `<p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a></p>` +
        '<p>Se você não pediu essa redefinição, pode ignorar este e-mail com segurança — sua senha atual continua válida. Este link expira em 1 hora.</p>',
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = this.hash(token);
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.usedAt || stored.expiresAt < new Date() || stored.user.deletedAt) {
      throw new UnauthorizedException({
        code: 'PASSWORD_RESET_TOKEN_INVALID',
        message: 'Link de redefinição inválido ou expirado. Solicite um novo.',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: stored.userId }, data: { passwordHash } });
      await tx.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      });
      // A leaked or guessed old password shouldn't keep any device logged
      // in once the real owner resets it - same posture as a changed
      // password anywhere else that matters.
      await tx.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async generateTokens(
    userId: string,
    email: string | null,
    familyId?: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const payload: TokenPayload = { sub: userId, email };

    const expiresInMs = ms(this.env.JWT_ACCESS_EXPIRATION as ms.StringValue);
    const expiresInSec = Math.floor(expiresInMs / 1000);

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: expiresInSec,
    });

    const refreshToken = randomBytes(64).toString('hex');

    const refreshExpiresInMs = ms(this.env.JWT_REFRESH_EXPIRATION as ms.StringValue);
    const expiresAt = new Date(Date.now() + refreshExpiresInMs);

    const tokenRecord = await db.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt,
        familyId,
      },
    });

    if (!familyId) {
      await db.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { familyId: tokenRecord.id },
      });
    }

    return { accessToken, refreshToken };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }

  private rethrowSocialIdentityConflict(error: unknown): never {
    if (!this.isUniqueConstraintError(error)) throw error;
    throw new ConflictException({
      code: 'SOCIAL_ACCOUNT_ALREADY_LINKED',
      message: 'Esta conta Apple ou Google ja esta vinculada a outro usuario.',
    });
  }

  private verifyOAuthState(value: string): OAuthStatePayload {
    const [encoded, signature] = value.split('.');
    if (!encoded || !signature) {
      throw new BadRequestException({
        code: 'OAUTH_STATE_INVALID',
        message: 'state OAuth invalido ou expirado.',
      });
    }

    const expected = createHmac('sha256', this.env.JWT_ACCESS_SECRET)
      .update(encoded)
      .digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new BadRequestException({
        code: 'OAUTH_STATE_INVALID',
        message: 'state OAuth invalido ou expirado.',
      });
    }

    try {
      const payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as OAuthStatePayload;
      if (
        typeof payload.clientState !== 'string' ||
        typeof payload.codeChallenge !== 'string' ||
        typeof payload.expiresAt !== 'number' ||
        payload.expiresAt <= Date.now()
      ) {
        throw new Error('expired');
      }
      return payload;
    } catch {
      throw new BadRequestException({
        code: 'OAUTH_STATE_INVALID',
        message: 'state OAuth invalido ou expirado.',
      });
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async assertSocialIdentityCleanupFinished(
    provider: 'APPLE' | 'GOOGLE',
    providerId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const pending = await db.scanAccountCleanupTask.findFirst({
      where: {
        providerSubjectHash: {
          in: [
            socialIdentitySubjectHash(provider, providerId),
            ...(provider === 'APPLE' ? [legacyAppleIdentitySubjectHash(providerId)] : []),
          ],
        },
        status: { not: ScanAccountCleanupStatus.COMPLETED },
      },
      select: { id: true },
    });
    if (pending) {
      throw new ServiceUnavailableException({
        code:
          provider === 'APPLE'
            ? 'APPLE_REVOCATION_IN_PROGRESS'
            : 'GOOGLE_ACCOUNT_CLEANUP_IN_PROGRESS',
        message: `A exclusao ${provider === 'APPLE' ? 'Apple' : 'Google'} anterior ainda esta sendo concluida. Tente novamente.`,
      });
    }
  }

  private guestDisplayName(guestInstallationHash: string): string {
    const suffix = Number.parseInt(guestInstallationHash.slice(0, 8), 16) % 10_000;
    return `User${suffix.toString().padStart(4, '0')}`;
  }

  private firstName(name?: string): string | undefined {
    return name?.trim().split(/\s+/)[0] || undefined;
  }

  private pkceChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  private async exchangeAppleAuthorizationCode(
    authorizationCode: string,
    expectedSubject: string,
  ): Promise<AppleRevocationToken> {
    const response = await this.appleRequest('https://appleid.apple.com/auth/token', {
      client_id: this.appleClientId(),
      client_secret: this.createAppleClientSecret(),
      code: authorizationCode,
      grant_type: 'authorization_code',
    });
    const body = (await response.json().catch(() => ({}))) as AppleTokenResponse;
    if (!response.ok || !body.id_token) {
      throw new UnauthorizedException({
        code: 'APPLE_AUTHORIZATION_CODE_INVALID',
        message: 'A autorizacao Apple expirou ou e invalida.',
      });
    }

    const exchangedIdentity = await this.verifyAppleIdentityToken(body.id_token);
    if (exchangedIdentity.sub !== expectedSubject) {
      throw new UnauthorizedException({
        code: 'APPLE_ACCOUNT_MISMATCH',
        message: 'A autorizacao Apple nao corresponde ao usuario autenticado.',
      });
    }

    if (body.refresh_token) {
      return { token: body.refresh_token, type: 'refresh_token' };
    }
    if (body.access_token) {
      return { token: body.access_token, type: 'access_token' };
    }
    throw new ServiceUnavailableException({
      code: 'APPLE_REVOCATION_TOKEN_MISSING',
      message: 'A Apple nao retornou um token que possa ser revogado.',
    });
  }

  private async storeAppleRevocationToken(
    userId: string,
    revocationToken: AppleRevocationToken,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const encrypted = this.encryptAppleToken(revocationToken.token);
    await db.appleCredential.upsert({
      where: { userId },
      create: {
        userId,
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenTag: encrypted.tag,
        tokenType: revocationToken.type,
        tokenKeyId: encrypted.keyId,
      },
      update: {
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenTag: encrypted.tag,
        tokenType: revocationToken.type,
        tokenKeyId: encrypted.keyId,
      },
    });
  }

  private encryptAppleToken(token: string) {
    const iv = randomBytes(AES_GCM_IV_BYTES);
    const { id: keyId, key } = this.currentAppleEncryptionKey();
    const cipher = createCipheriv('aes-256-gcm', key, iv, {
      authTagLength: AES_GCM_AUTH_TAG_BYTES,
    });
    const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      keyId,
    };
  }

  private decryptAppleToken(
    ciphertext: string,
    iv: string,
    tag: string,
    keyId?: string | null,
  ): string {
    try {
      const ivBuffer = Buffer.from(iv, 'base64');
      const tagBuffer = Buffer.from(tag, 'base64');
      const ciphertextBuffer = Buffer.from(ciphertext, 'base64');
      if (
        ivBuffer.length !== AES_GCM_IV_BYTES ||
        tagBuffer.length !== AES_GCM_AUTH_TAG_BYTES ||
        ciphertextBuffer.length === 0
      ) {
        throw new Error('Invalid Apple token ciphertext');
      }
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.appleEncryptionKeyForDecryption(keyId),
        ivBuffer,
        { authTagLength: AES_GCM_AUTH_TAG_BYTES },
      );
      decipher.setAuthTag(tagBuffer);
      return Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException({
        code: 'APPLE_REVOCATION_UNAVAILABLE',
        message: 'Nao foi possivel revogar o vinculo Apple agora.',
      });
    }
  }

  private legacyAppleEncryptionKey(): Buffer {
    return createHash('sha256').update(`apple-revocation:${this.env.JWT_REFRESH_SECRET}`).digest();
  }

  private currentAppleEncryptionKey(): { id: string; key: Buffer } {
    const id = this.env.APPLE_TOKEN_ENCRYPTION_KEY_ID;
    const encoded = this.env.APPLE_TOKEN_ENCRYPTION_KEY_BASE64;
    if (!id || !encoded) {
      throw new ServiceUnavailableException({
        code: 'APPLE_REVOCATION_NOT_CONFIGURED',
        message: 'A chave de criptografia Apple nao esta configurada.',
      });
    }
    return { id, key: Buffer.from(encoded, 'base64') };
  }

  private appleEncryptionKeyForDecryption(keyId?: string | null): Buffer {
    const previous = this.previousAppleEncryptionKeys();
    if (!keyId || keyId === APPLE_LEGACY_KEY_ID) {
      return previous.get(APPLE_LEGACY_KEY_ID) ?? this.legacyAppleEncryptionKey();
    }
    if (keyId === this.env.APPLE_TOKEN_ENCRYPTION_KEY_ID) {
      return this.currentAppleEncryptionKey().key;
    }
    const key = previous.get(keyId);
    if (!key) throw new Error('Unknown Apple token encryption key id');
    return key;
  }

  private previousAppleEncryptionKeys(): Map<string, Buffer> {
    const value = this.env.APPLE_TOKEN_ENCRYPTION_PREVIOUS_KEYS;
    if (!value) return new Map();
    const parsed = JSON.parse(value) as Record<string, string>;
    return new Map(
      Object.entries(parsed).map(([keyId, key]) => [keyId, Buffer.from(key, 'base64')]),
    );
  }

  private appleClientId(): string {
    if (!this.env.APPLE_CLIENT_ID) {
      throw new ServiceUnavailableException({
        code: 'APPLE_REVOCATION_NOT_CONFIGURED',
        message: 'Revogacao Apple nao configurada.',
      });
    }
    return this.env.APPLE_CLIENT_ID;
  }

  private createAppleClientSecret(): string {
    const teamId = this.env.APPLE_TEAM_ID;
    const keyId = this.env.APPLE_KEY_ID;
    const privateKeyBase64 = this.env.APPLE_PRIVATE_KEY_BASE64;
    if (!teamId || !keyId || !privateKeyBase64) {
      throw new ServiceUnavailableException({
        code: 'APPLE_REVOCATION_NOT_CONFIGURED',
        message: 'Revogacao Apple nao configurada.',
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: teamId,
        iat: now,
        exp: now + 5 * 60,
        aud: 'https://appleid.apple.com',
        sub: this.appleClientId(),
      }),
    ).toString('base64url');
    const signingInput = `${header}.${payload}`;

    try {
      const privateKey = createPrivateKey({
        key: Buffer.from(privateKeyBase64, 'base64').toString('utf8'),
        format: 'pem',
      });
      const signature = sign('sha256', Buffer.from(signingInput), {
        key: privateKey,
        dsaEncoding: 'ieee-p1363',
      }).toString('base64url');
      return `${signingInput}.${signature}`;
    } catch {
      throw new ServiceUnavailableException({
        code: 'APPLE_REVOCATION_NOT_CONFIGURED',
        message: 'A chave de revogacao Apple e invalida.',
      });
    }
  }

  private async appleRequest(url: string, params: Record<string, string>): Promise<Response> {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'APPLE_REVOCATION_UNAVAILABLE',
        message: 'Nao foi possivel comunicar com a Apple agora.',
      });
    }
  }

  private async verifyAppleIdentityToken(
    identityToken: string,
    expectedNonce?: string,
  ): Promise<AppleIdentityPayload> {
    const clientId = this.env.APPLE_CLIENT_ID;
    if (!clientId) {
      throw new UnauthorizedException({
        code: 'APPLE_NOT_CONFIGURED',
        message: 'Login Apple nao configurado.',
      });
    }

    const [headerPart, payloadPart, signaturePart] = identityToken.split('.');
    if (!headerPart || !payloadPart || !signaturePart) {
      throw new UnauthorizedException({
        code: 'APPLE_TOKEN_INVALID',
        message: 'Token Apple invalido.',
      });
    }

    const header = this.decodeJwtPart<AppleJwtHeader>(headerPart);
    const payload = this.decodeJwtPart<AppleIdentityPayload>(payloadPart);
    if (header.alg !== 'RS256' || !header.kid) {
      throw new UnauthorizedException({
        code: 'APPLE_TOKEN_INVALID',
        message: 'Token Apple invalido.',
      });
    }

    let response: Response;
    try {
      response = await fetch('https://appleid.apple.com/auth/keys', {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new UnauthorizedException({
        code: 'APPLE_KEYS_UNAVAILABLE',
        message: 'Nao foi possivel validar login Apple.',
      });
    }
    if (!response.ok) {
      throw new UnauthorizedException({
        code: 'APPLE_KEYS_UNAVAILABLE',
        message: 'Nao foi possivel validar login Apple.',
      });
    }

    const jwks = (await response.json()) as { keys?: AppleJwk[] };
    const jwk = jwks.keys?.find((key) => key.kid === header.kid && key.alg === 'RS256');
    if (!jwk) {
      throw new UnauthorizedException({
        code: 'APPLE_TOKEN_INVALID',
        message: 'Token Apple invalido.',
      });
    }

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${headerPart}.${payloadPart}`);
    verifier.end();
    const publicKey = createPublicKey({ key: jwk as never, format: 'jwk' });
    const valid = verifier.verify(publicKey, this.base64UrlToBuffer(signaturePart));
    if (!valid) {
      throw new UnauthorizedException({
        code: 'APPLE_TOKEN_INVALID',
        message: 'Token Apple invalido.',
      });
    }

    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (
      payload.iss !== 'https://appleid.apple.com' ||
      !audiences.includes(clientId) ||
      !payload.exp ||
      payload.exp * 1000 <= Date.now()
    ) {
      throw new UnauthorizedException({
        code: 'APPLE_TOKEN_INVALID',
        message: 'Token Apple invalido.',
      });
    }

    if (expectedNonce) this.assertAppleNonce(payload.nonce, expectedNonce);

    return payload;
  }

  private assertAppleNonce(actualNonce: string | undefined, expectedNonce: string): void {
    const actual = Buffer.from(actualNonce ?? '', 'utf8');
    const expected = Buffer.from(expectedNonce, 'utf8');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException({
        code: 'APPLE_TOKEN_INVALID',
        message: 'Token Apple invalido.',
      });
    }
  }

  private decodeJwtPart<T>(part: string): T {
    try {
      return JSON.parse(this.base64UrlToBuffer(part).toString('utf8')) as T;
    } catch {
      throw new UnauthorizedException({
        code: 'APPLE_TOKEN_INVALID',
        message: 'Token Apple invalido.',
      });
    }
  }

  private base64UrlToBuffer(value: string): Buffer {
    let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4;
    if (padding) {
      base64 += '='.repeat(4 - padding);
    }
    return Buffer.from(base64, 'base64');
  }
}
