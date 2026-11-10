import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { AuthService, resolveGoogleMobileAudiences } from '../auth.service';
import { PrismaService } from '../../../prisma';
import { ENV_TOKEN } from '../../../config';
import { ReferralsService } from '../../referrals';
import { ProductAnalyticsService } from '../../product-analytics';
import { EmailService } from '../email.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  oAuthAuthorizationCode: {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  passwordResetToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  appleCredential: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  scanAccountCleanupTask: {
    findFirst: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $transaction: jest.fn(),
};

const mockJwt = {
  signAsync: jest.fn().mockResolvedValue('mock-access-token'),
  verifyAsync: jest.fn(),
};

const mockEnv = {
  JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-chars',
  JWT_ACCESS_EXPIRATION: '15m',
  JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-chars',
  JWT_REFRESH_EXPIRATION: '7d',
  APPLE_TOKEN_ENCRYPTION_KEY_ID: 'apple-test-v1',
  APPLE_TOKEN_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
  FRONTEND_URL: 'http://localhost:5173',
  APP_URL: 'http://localhost:8081/app',
};

const mockReferrals = {
  ensureUserReferralCode: jest.fn().mockResolvedValue('MOCKCODE'),
  tryAttachInviter: jest.fn().mockResolvedValue(undefined),
};

const mockProductAnalytics = {
  attachVisitorToUser: jest.fn().mockResolvedValue(undefined),
};

const mockEmailService = {
  send: jest.fn().mockResolvedValue(undefined),
};

describe('resolveGoogleMobileAudiences', () => {
  it('accepts web, Android, and iOS token audiences without duplicates', () => {
    expect(
      resolveGoogleMobileAudiences({
        GOOGLE_CLIENT_ID: 'web-client',
        GOOGLE_ANDROID_CLIENT_ID: 'android-client',
        GOOGLE_IOS_CLIENT_ID: 'ios-client',
      }),
    ).toEqual(['web-client', 'android-client', 'ios-client']);

    expect(
      resolveGoogleMobileAudiences({
        GOOGLE_CLIENT_ID: 'shared-client',
        GOOGLE_IOS_CLIENT_ID: 'shared-client',
      }),
    ).toEqual(['shared-client']);
  });
});

describe('AuthService', () => {
  let service: AuthService;

  function mockFreshAppleAuthorization() {
    const internals = service as unknown as {
      exchangeAppleAuthorizationCode: (
        code: string,
        subject: string,
      ) => Promise<{ token: string; type: 'refresh_token' }>;
      storeAppleRevocationToken: (
        userId: string,
        token: { token: string; type: 'refresh_token' },
      ) => Promise<void>;
    };
    jest
      .spyOn(internals, 'exchangeAppleAuthorizationCode')
      .mockResolvedValue({ token: 'fresh-apple-refresh', type: 'refresh_token' });
    jest.spyOn(internals, 'storeAppleRevocationToken').mockResolvedValue(undefined);
    return internals;
  }

  beforeEach(async () => {
    Object.assign(mockEnv, {
      APPLE_TOKEN_ENCRYPTION_KEY_ID: 'apple-test-v1',
      APPLE_TOKEN_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
    });
    delete (mockEnv as { APPLE_TOKEN_ENCRYPTION_PREVIOUS_KEYS?: string })
      .APPLE_TOKEN_ENCRYPTION_PREVIOUS_KEYS;
    delete (mockEnv as { GOOGLE_CLIENT_ID?: string }).GOOGLE_CLIENT_ID;
    delete (mockEnv as { GOOGLE_IOS_CLIENT_ID?: string }).GOOGLE_IOS_CLIENT_ID;
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ReferralsService, useValue: mockReferrals },
        { provide: ProductAnalyticsService, useValue: mockProductAnalytics },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ENV_TOKEN, useValue: mockEnv },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma),
    );
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.scanAccountCleanupTask.findFirst.mockResolvedValue(null);
  });

  describe('Google mobile login', () => {
    it('returns an authentication error when Google rejects a malformed token', async () => {
      Object.assign(mockEnv, {
        GOOGLE_CLIENT_ID: 'web-client.apps.googleusercontent.com',
        GOOGLE_IOS_CLIENT_ID: 'ios-client.apps.googleusercontent.com',
      });

      await expect(service.googleMobileLogin('invalid')).rejects.toMatchObject({
        response: {
          code: 'GOOGLE_TOKEN_INVALID',
          message: 'Token Google invalido.',
        },
        status: 401,
      });
    });
  });

  describe('guest account', () => {
    it('creates an idempotent guest account tied to the installation', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'guest-1',
        email: null,
        provider: 'GUEST',
        deletedAt: null,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-guest-1' });
      mockPrisma.refreshToken.update.mockResolvedValue({});

      await expect(
        service.createGuest('installation-id-with-at-least-32-characters'),
      ).resolves.toEqual({
        accessToken: 'mock-access-token',
        refreshToken: expect.any(String),
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: null,
          name: expect.stringMatching(/^User\d{4}$/),
          provider: 'GUEST',
          guestInstallationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      });
      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        { sub: 'guest-1', email: null },
        expect.any(Object),
      );
    });

    it('reuses the same guest without creating a duplicate', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'guest-1',
        email: null,
        provider: 'GUEST',
        deletedAt: null,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-guest-1' });
      mockPrisma.refreshToken.update.mockResolvedValue({});

      await service.createGuest('installation-id-with-at-least-32-characters');

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('upgrades the legacy guest label to a deterministic temporary name', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'guest-1',
        email: null,
        name: 'My Peptides User',
        provider: 'GUEST',
        deletedAt: null,
      });
      mockPrisma.user.update.mockResolvedValue({
        id: 'guest-1',
        email: null,
        name: 'User1234',
        provider: 'GUEST',
        deletedAt: null,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-guest-1' });
      mockPrisma.refreshToken.update.mockResolvedValue({});

      await service.createGuest('installation-id-with-at-least-32-characters');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'guest-1' },
        data: { name: expect.stringMatching(/^User\d{4}$/) },
      });
    });

    it('secures the same user id instead of creating a second account', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce({
          id: 'guest-1',
          email: null,
          name: 'My Peptides User',
          avatarUrl: null,
          emailVerifiedAt: null,
          provider: 'GUEST',
          deletedAt: null,
        })
        .mockResolvedValueOnce(null);
      mockPrisma.user.update.mockResolvedValue({ id: 'guest-1' });
      const linkGuestIdentity = (
        service as unknown as {
          linkGuestIdentity: (
            userId: string,
            identity: {
              provider: 'GOOGLE';
              providerId: string;
              email: string;
              name: string;
            },
          ) => Promise<{ linked: true; provider: 'GOOGLE' }>;
        }
      ).linkGuestIdentity.bind(service);

      await expect(
        linkGuestIdentity('guest-1', {
          provider: 'GOOGLE',
          providerId: 'google-sub-1',
          email: 'guest@example.com',
          name: 'Guest Protected',
        }),
      ).resolves.toEqual({ linked: true, provider: 'GOOGLE' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'guest-1' },
        data: expect.objectContaining({
          provider: 'GOOGLE',
          providerId: 'google-sub-1',
          guestInstallationHash: null,
        }),
      });
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('links Google to the guest id after removing a historical deleted identity', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce({
          id: 'guest-2',
          email: null,
          name: 'User4321',
          avatarUrl: null,
          emailVerifiedAt: null,
          provider: 'GUEST',
          deletedAt: null,
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'deleted-google-1' });
      mockPrisma.user.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.update.mockResolvedValue({ id: 'guest-2' });
      const linkGuestIdentity = (
        service as unknown as {
          linkGuestIdentity: (
            userId: string,
            identity: {
              provider: 'GOOGLE';
              providerId: string;
              email: string;
              name: string;
            },
          ) => Promise<{ linked: true; provider: 'GOOGLE' }>;
        }
      ).linkGuestIdentity.bind(service);

      await expect(
        linkGuestIdentity('guest-2', {
          provider: 'GOOGLE',
          providerId: 'google-sub-2',
          email: 'google@example.com',
          name: 'Google User',
        }),
      ).resolves.toEqual({ linked: true, provider: 'GOOGLE' });

      expect(mockPrisma.user.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'deleted-google-1',
          provider: 'GOOGLE',
          providerId: 'google-sub-2',
          deletedAt: { not: null },
        },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'guest-2' },
        data: expect.objectContaining({
          provider: 'GOOGLE',
          providerId: 'google-sub-2',
          guestInstallationHash: null,
        }),
      });
    });

    it('uses only the Apple first name when securing a guest account', async () => {
      jest
        .spyOn(
          service as unknown as {
            verifyAppleIdentityToken: (token: string) => Promise<unknown>;
          },
          'verifyAppleIdentityToken',
        )
        .mockResolvedValue({ sub: 'apple-sub-1', email: 'apple@example.com' });
      mockPrisma.user.findFirst
        .mockResolvedValueOnce({
          id: 'guest-1',
          email: null,
          name: 'User1234',
          avatarUrl: null,
          emailVerifiedAt: null,
          provider: 'GUEST',
          deletedAt: null,
        })
        .mockResolvedValueOnce(null);
      mockPrisma.user.update.mockResolvedValue({ id: 'guest-1' });
      mockFreshAppleAuthorization();

      await service.linkApple(
        'guest-1',
        'identity-token',
        'request-nonce-1234',
        'Matheus Augusto',
        'fresh-authorization-code',
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'guest-1' },
        data: expect.objectContaining({
          email: 'apple@example.com',
          name: 'Matheus',
          provider: 'APPLE',
        }),
      });
    });

    it('keeps the temporary name when Apple no longer returns a name', async () => {
      jest
        .spyOn(
          service as unknown as {
            verifyAppleIdentityToken: (token: string) => Promise<unknown>;
          },
          'verifyAppleIdentityToken',
        )
        .mockResolvedValue({ sub: 'apple-sub-1', email: 'apple@example.com' });
      mockPrisma.user.findFirst
        .mockResolvedValueOnce({
          id: 'guest-1',
          email: null,
          name: 'User1234',
          avatarUrl: null,
          emailVerifiedAt: null,
          provider: 'GUEST',
          deletedAt: null,
        })
        .mockResolvedValueOnce(null);
      mockPrisma.user.update.mockResolvedValue({ id: 'guest-1' });
      mockFreshAppleAuthorization();

      await service.linkApple(
        'guest-1',
        'identity-token',
        'request-nonce-1234',
        undefined,
        'fresh-authorization-code',
      );

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'guest-1' },
        data: expect.objectContaining({ name: 'User1234', provider: 'APPLE' }),
      });
    });

    it('claims a disabled Apple identity when securing a new guest account', async () => {
      jest
        .spyOn(
          service as unknown as {
            verifyAppleIdentityToken: (token: string) => Promise<unknown>;
          },
          'verifyAppleIdentityToken',
        )
        .mockResolvedValue({ sub: 'apple-sub-1' });
      mockPrisma.user.findFirst
        .mockResolvedValueOnce({
          id: 'guest-1',
          email: null,
          name: 'User1234',
          avatarUrl: null,
          emailVerifiedAt: null,
          provider: 'GUEST',
          deletedAt: null,
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'deleted-apple-1' });
      mockPrisma.user.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.update.mockResolvedValue({ id: 'guest-1' });
      mockFreshAppleAuthorization();

      await expect(
        service.linkApple(
          'guest-1',
          'identity-token',
          'request-nonce-1234',
          undefined,
          'fresh-authorization-code',
        ),
      ).resolves.toEqual({ linked: true, provider: 'APPLE' });

      expect(mockPrisma.user.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'deleted-apple-1',
          provider: 'APPLE',
          providerId: 'apple-sub-1',
          deletedAt: { not: null },
        },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'guest-1' },
        data: expect.objectContaining({
          provider: 'APPLE',
          providerId: 'apple-sub-1',
          email: null,
          name: 'User1234',
        }),
      });
    });

    it('does not link Apple while an older identity revocation is pending', async () => {
      jest
        .spyOn(
          service as unknown as {
            verifyAppleIdentityToken: (token: string) => Promise<unknown>;
          },
          'verifyAppleIdentityToken',
        )
        .mockResolvedValue({ sub: 'apple-sub-pending' });
      mockPrisma.scanAccountCleanupTask.findFirst.mockResolvedValue({ id: 'cleanup-pending' });
      const appleInternals = mockFreshAppleAuthorization();

      await expect(
        service.linkApple(
          'guest-1',
          'identity-token',
          'request-nonce-1234',
          undefined,
          'fresh-authorization-code',
        ),
      ).rejects.toMatchObject({
        status: 503,
        response: expect.objectContaining({ code: 'APPLE_REVOCATION_IN_PROGRESS' }),
      });

      expect(appleInternals.exchangeAppleAuthorizationCode).not.toHaveBeenCalled();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('reactivates Apple with a new local identity so pending cleanup cannot erase it', async () => {
      jest
        .spyOn(
          service as unknown as {
            verifyAppleIdentityToken: (token: string) => Promise<unknown>;
          },
          'verifyAppleIdentityToken',
        )
        .mockResolvedValue({ sub: 'apple-sub-1' });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'apple-1',
        email: null,
        name: 'Deleted Apple User',
        provider: 'APPLE',
        providerId: 'apple-sub-1',
        emailVerified: false,
        emailVerifiedAt: null,
        deletedAt: new Date('2026-08-18T00:00:00Z'),
      });
      mockPrisma.user.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.create.mockResolvedValue({
        id: 'apple-2',
        email: null,
        name: 'Apple User',
        provider: 'APPLE',
        providerId: 'apple-sub-1',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        deletedAt: null,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'refresh-1' });
      mockPrisma.refreshToken.update.mockResolvedValue({});
      const appleInternals = service as unknown as {
        exchangeAppleAuthorizationCode: (
          code: string,
          subject: string,
        ) => Promise<{ token: string; type: 'refresh_token' }>;
        storeAppleRevocationToken: (
          userId: string,
          token: { token: string; type: 'refresh_token' },
        ) => Promise<void>;
      };
      jest
        .spyOn(appleInternals, 'exchangeAppleAuthorizationCode')
        .mockResolvedValue({ token: 'fresh-apple-refresh', type: 'refresh_token' });
      jest.spyOn(appleInternals, 'storeAppleRevocationToken').mockResolvedValue(undefined);

      await expect(
        service.appleMobileLogin(
          'identity-token',
          'request-nonce-1234',
          undefined,
          'fresh-authorization-code',
        ),
      ).resolves.toEqual({
        accessToken: 'mock-access-token',
        refreshToken: expect.any(String),
      });

      expect(mockPrisma.user.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'apple-1',
          provider: 'APPLE',
          providerId: 'apple-sub-1',
          deletedAt: { not: null },
        },
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: null,
          name: 'Apple User',
          provider: 'APPLE',
          providerId: 'apple-sub-1',
          emailVerified: true,
        }),
      });
      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'apple-2' }),
        expect.any(Object),
      );
      expect(mockReferrals.ensureUserReferralCode).toHaveBeenCalledWith('apple-2');
      expect(appleInternals.exchangeAppleAuthorizationCode).toHaveBeenCalledWith(
        'fresh-authorization-code',
        'apple-sub-1',
      );
    });

    it('rechecks the durable fence under the advisory lock after Apple preflight', async () => {
      jest
        .spyOn(
          service as unknown as {
            verifyAppleIdentityToken: (token: string) => Promise<unknown>;
          },
          'verifyAppleIdentityToken',
        )
        .mockResolvedValue({ sub: 'apple-sub-1' });
      mockPrisma.scanAccountCleanupTask.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'cleanup-committed-during-exchange' });
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const appleInternals = mockFreshAppleAuthorization();

      await expect(
        service.appleMobileLogin(
          'identity-token',
          'request-nonce-1234',
          undefined,
          'fresh-authorization-code',
        ),
      ).rejects.toMatchObject({
        status: 503,
        response: expect.objectContaining({ code: 'APPLE_REVOCATION_IN_PROGRESS' }),
      });

      expect(appleInternals.exchangeAppleAuthorizationCode).toHaveBeenCalledWith(
        'fresh-authorization-code',
        'apple-sub-1',
      );
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects a stale Apple identity token without a fresh authorization code', async () => {
      jest
        .spyOn(
          service as unknown as {
            verifyAppleIdentityToken: (token: string) => Promise<unknown>;
          },
          'verifyAppleIdentityToken',
        )
        .mockResolvedValue({ sub: 'apple-sub-1' });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'deleted-apple-1',
        provider: 'APPLE',
        providerId: 'apple-sub-1',
        deletedAt: new Date('2026-08-25T12:00:00.000Z'),
      });

      await expect(
        service.appleMobileLogin('old-identity-token', 'old-nonce'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'APPLE_REAUTH_REQUIRED' }),
      });

      expect(mockPrisma.user.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('blocks Apple reactivation until the prior revocation checkpoint is durable', async () => {
      jest
        .spyOn(
          service as unknown as {
            verifyAppleIdentityToken: (token: string) => Promise<unknown>;
          },
          'verifyAppleIdentityToken',
        )
        .mockResolvedValue({ sub: 'apple-sub-1' });
      mockPrisma.scanAccountCleanupTask.findFirst.mockResolvedValue({ id: 'cleanup-1' });
      const appleInternals = mockFreshAppleAuthorization();

      await expect(
        service.appleMobileLogin(
          'identity-token',
          'request-nonce-1234',
          undefined,
          'fresh-authorization-code',
        ),
      ).rejects.toMatchObject({
        status: 503,
        response: expect.objectContaining({ code: 'APPLE_REVOCATION_IN_PROGRESS' }),
      });

      expect(mockPrisma.scanAccountCleanupTask.findFirst).toHaveBeenCalledWith({
        where: {
          providerSubjectHash: {
            in: [
              createHash('sha256').update('APPLE\0apple-sub-1').digest('hex'),
              createHash('sha256').update('apple-sub-1').digest('hex'),
            ],
          },
          status: { not: 'COMPLETED' },
        },
        select: { id: true },
      });
      expect(appleInternals.exchangeAppleAuthorizationCode).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('stores the Apple relay email when a returning Apple user does not have one yet', async () => {
      jest
        .spyOn(
          service as unknown as {
            verifyAppleIdentityToken: (token: string) => Promise<unknown>;
          },
          'verifyAppleIdentityToken',
        )
        .mockResolvedValue({
          sub: 'apple-sub-1',
          email: 'private@privaterelay.appleid.com',
        });
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'apple-1',
        email: null,
        name: 'Apple User',
        provider: 'APPLE',
        providerId: 'apple-sub-1',
        emailVerified: true,
        emailVerifiedAt: new Date('2026-08-01T00:00:00Z'),
        deletedAt: null,
      });
      mockPrisma.user.update.mockResolvedValue({
        id: 'apple-1',
        email: 'private@privaterelay.appleid.com',
        name: 'Apple User',
        provider: 'APPLE',
        providerId: 'apple-sub-1',
        emailVerified: true,
        emailVerifiedAt: new Date('2026-08-01T00:00:00Z'),
        deletedAt: null,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'refresh-1' });
      mockPrisma.refreshToken.update.mockResolvedValue({});

      await service.appleMobileLogin('identity-token', 'request-nonce-1234');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'apple-1' },
        data: expect.objectContaining({
          email: 'private@privaterelay.appleid.com',
          provider: 'APPLE',
          providerId: 'apple-sub-1',
        }),
      });
      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'private@privaterelay.appleid.com' }),
        expect.any(Object),
      );
    });
  });

  describe('Google reactivation safety', () => {
    it('checks the Google fence inside the advisory-locked transaction', async () => {
      mockPrisma.scanAccountCleanupTask.findFirst.mockResolvedValue({ id: 'google-cleanup-1' });

      await expect(
        service.googleLogin({
          email: 'google@example.com',
          name: 'Google User',
          googleId: 'google-sub-1',
        }),
      ).rejects.toMatchObject({
        status: 503,
        response: expect.objectContaining({ code: 'GOOGLE_ACCOUNT_CLEANUP_IN_PROGRESS' }),
      });

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.scanAccountCleanupTask.findFirst).toHaveBeenCalledWith({
        where: {
          providerSubjectHash: {
            in: [createHash('sha256').update('GOOGLE\0google-sub-1').digest('hex')],
          },
          status: { not: 'COMPLETED' },
        },
        select: { id: true },
      });
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('creates a new local id so cleanup and old JWTs remain bound to the deleted id', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'google-1',
        email: 'google@example.com',
        provider: 'GOOGLE',
        providerId: 'google-sub-1',
        deletedAt: new Date('2026-08-25T12:00:00.000Z'),
      });
      mockPrisma.user.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.create.mockResolvedValue({
        id: 'google-2',
        email: 'google@example.com',
        provider: 'GOOGLE',
        providerId: 'google-sub-1',
        deletedAt: null,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'refresh-google-2' });
      mockPrisma.refreshToken.update.mockResolvedValue({});

      await expect(
        service.googleLogin({
          email: 'google@example.com',
          name: 'Google User',
          googleId: 'google-sub-1',
        }),
      ).resolves.toEqual({
        accessToken: 'mock-access-token',
        refreshToken: expect.any(String),
      });

      expect(mockPrisma.user.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'google-1',
          deletedAt: { not: null },
          OR: [{ provider: 'GOOGLE', providerId: 'google-sub-1' }, { email: 'google@example.com' }],
        },
      });
      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'google-2' }),
        expect.any(Object),
      );
      expect(mockReferrals.ensureUserReferralCode).toHaveBeenCalledWith('google-2');
    });
  });

  describe('Apple account deletion authorization', () => {
    it('decrypts legacy ciphertext created with the historical JWT-derived key', () => {
      const legacyKey = createHash('sha256')
        .update(`apple-revocation:${mockEnv.JWT_REFRESH_SECRET}`)
        .digest();
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', legacyKey, iv);
      const ciphertext = Buffer.concat([
        cipher.update('legacy-apple-token', 'utf8'),
        cipher.final(),
      ]);
      const internals = service as unknown as {
        decryptAppleToken: (
          ciphertext: string,
          iv: string,
          tag: string,
          keyId?: string | null,
        ) => string;
      };

      expect(
        internals.decryptAppleToken(
          ciphertext.toString('base64'),
          iv.toString('base64'),
          cipher.getAuthTag().toString('base64'),
          null,
        ),
      ).toBe('legacy-apple-token');
    });

    it('decrypts an older versioned key after rotation', () => {
      const internals = service as unknown as {
        encryptAppleToken: (token: string) => {
          ciphertext: string;
          iv: string;
          tag: string;
          keyId: string;
        };
        decryptAppleToken: (
          ciphertext: string,
          iv: string,
          tag: string,
          keyId?: string | null,
        ) => string;
      };
      const oldKey = mockEnv.APPLE_TOKEN_ENCRYPTION_KEY_BASE64;
      const encrypted = internals.encryptAppleToken('rotated-apple-token');
      Object.assign(mockEnv, {
        APPLE_TOKEN_ENCRYPTION_KEY_ID: 'apple-test-v2',
        APPLE_TOKEN_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 8).toString('base64'),
        APPLE_TOKEN_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify({
          'apple-test-v1': oldKey,
        }),
      });

      expect(
        internals.decryptAppleToken(
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.tag,
          encrypted.keyId,
        ),
      ).toBe('rotated-apple-token');
    });

    it('rejects a truncated Apple token authentication tag', () => {
      const internals = service as unknown as {
        encryptAppleToken: (token: string) => {
          ciphertext: string;
          iv: string;
          tag: string;
          keyId: string;
        };
        decryptAppleToken: (
          ciphertext: string,
          iv: string,
          tag: string,
          keyId?: string | null,
        ) => string;
      };
      const encrypted = internals.encryptAppleToken('apple-token');
      const truncatedTag = Buffer.from(encrypted.tag, 'base64').subarray(0, 12).toString('base64');

      expect(() =>
        internals.decryptAppleToken(
          encrypted.ciphertext,
          encrypted.iv,
          truncatedTag,
          encrypted.keyId,
        ),
      ).toThrow(ServiceUnavailableException);
    });

    it('confirms the same Apple subject and stores a revocation token', async () => {
      const internals = service as unknown as {
        verifyAppleIdentityToken: (token: string) => Promise<{ sub?: string }>;
        exchangeAppleAuthorizationCode: (
          code: string,
          subject: string,
        ) => Promise<{ token: string; type: 'refresh_token' }>;
        storeAppleRevocationToken: (
          userId: string,
          token: { token: string; type: 'refresh_token' },
        ) => Promise<void>;
      };
      jest.spyOn(internals, 'verifyAppleIdentityToken').mockResolvedValue({ sub: 'apple-sub-1' });
      const exchange = jest
        .spyOn(internals, 'exchangeAppleAuthorizationCode')
        .mockResolvedValue({ token: 'apple-refresh', type: 'refresh_token' });
      const store = jest.spyOn(internals, 'storeAppleRevocationToken').mockResolvedValue(undefined);
      mockPrisma.user.findFirst.mockResolvedValue({
        provider: 'APPLE',
        providerId: 'apple-sub-1',
      });

      await expect(
        service.prepareAppleAccountDeletion(
          'user-1',
          'identity-token',
          'request-nonce-1234',
          'authorization-code',
        ),
      ).resolves.toEqual({ prepared: true });

      expect(exchange).toHaveBeenCalledWith('authorization-code', 'apple-sub-1');
      expect(store).toHaveBeenCalledWith(
        'user-1',
        {
          token: 'apple-refresh',
          type: 'refresh_token',
        },
        mockPrisma,
      );
    });

    it('rejects a different Apple subject before storing credentials', async () => {
      const internals = service as unknown as {
        verifyAppleIdentityToken: (token: string) => Promise<{ sub?: string }>;
        storeAppleRevocationToken: (userId: string, token: unknown) => Promise<void>;
      };
      jest.spyOn(internals, 'verifyAppleIdentityToken').mockResolvedValue({ sub: 'other-sub' });
      const store = jest.spyOn(internals, 'storeAppleRevocationToken');
      mockPrisma.user.findFirst.mockResolvedValue({
        provider: 'APPLE',
        providerId: 'apple-sub-1',
      });

      await expect(
        service.prepareAppleAccountDeletion(
          'user-1',
          'identity-token',
          'request-nonce-1234',
          'authorization-code',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'APPLE_ACCOUNT_MISMATCH' }),
      });
      expect(store).not.toHaveBeenCalled();
    });

    it('revokes the stored token through the official Apple endpoint', async () => {
      const internals = service as unknown as {
        decryptAppleToken: (ciphertext: string, iv: string, tag: string) => string;
        createAppleClientSecret: () => string;
        appleRequest: (url: string, params: Record<string, string>) => Promise<{ ok: boolean }>;
      };
      mockPrisma.appleCredential.findUnique.mockResolvedValue({
        tokenCiphertext: 'ciphertext',
        tokenIv: 'iv',
        tokenTag: 'tag',
        tokenType: 'refresh_token',
      });
      jest.spyOn(internals, 'decryptAppleToken').mockReturnValue('apple-refresh');
      jest.spyOn(internals, 'createAppleClientSecret').mockReturnValue('client-secret');
      const request = jest.spyOn(internals, 'appleRequest').mockResolvedValue({ ok: true });
      Object.assign(mockEnv, { APPLE_CLIENT_ID: 'app.mypeptides.glp1' });

      await service.revokeAppleAuthorization('user-1');

      expect(request).toHaveBeenCalledWith('https://appleid.apple.com/auth/revoke', {
        client_id: 'app.mypeptides.glp1',
        client_secret: 'client-secret',
        token: 'apple-refresh',
        token_type_hint: 'refresh_token',
      });
      delete (mockEnv as { APPLE_CLIENT_ID?: string }).APPLE_CLIENT_ID;
    });
  });

  describe('Apple nonce validation', () => {
    it('accepts only the nonce bound to the Apple identity token', () => {
      const assertAppleNonce = (
        service as unknown as {
          assertAppleNonce: (actual: string | undefined, expected: string) => void;
        }
      ).assertAppleNonce.bind(service);

      expect(() => assertAppleNonce('request-nonce-1234', 'request-nonce-1234')).not.toThrow();
      expect(() => assertAppleNonce('different-nonce-123', 'request-nonce-1234')).toThrow(
        UnauthorizedException,
      );
      expect(() => assertAppleNonce(undefined, 'request-nonce-1234')).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('linkPassword', () => {
    const guestUser = {
      id: 'guest-1',
      email: null,
      name: 'My Peptides User',
      provider: 'GUEST',
      deletedAt: null,
    };

    it('allows a guest to upgrade to an email/password account', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(guestUser) // current user lookup
        .mockResolvedValueOnce(null); // email conflict lookup
      mockPrisma.user.update.mockResolvedValue({ id: 'guest-1' });

      const result = await service.linkPassword('guest-1', {
        email: 'guest@example.com',
        name: 'Guest Secured',
        password: 'senhasegura123',
      });

      expect(result).toEqual({ linked: true, provider: 'EMAIL' });
      expect(mockReferrals.ensureUserReferralCode).toHaveBeenCalledWith('guest-1');
    });

    it('preserves the exact same userId (no new account is created)', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(guestUser).mockResolvedValueOnce(null);
      mockPrisma.user.update.mockResolvedValue({ id: 'guest-1' });

      await service.linkPassword('guest-1', {
        email: 'guest@example.com',
        name: 'Guest Secured',
        password: 'senhasegura123',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'guest-1' } }),
      );
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('updates the email and clears the guest installation hash', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(guestUser).mockResolvedValueOnce(null);
      mockPrisma.user.update.mockResolvedValue({ id: 'guest-1' });

      await service.linkPassword('guest-1', {
        email: 'guest@example.com',
        name: 'Guest Secured',
        password: 'senhasegura123',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'guest@example.com',
            name: 'Guest Secured',
            provider: 'EMAIL',
            guestInstallationHash: null,
          }),
        }),
      );
    });

    it('creates a bcrypt hash of the password, never storing it in plaintext', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(guestUser).mockResolvedValueOnce(null);
      mockPrisma.user.update.mockResolvedValue({ id: 'guest-1' });

      await service.linkPassword('guest-1', {
        email: 'guest@example.com',
        name: 'Guest Secured',
        password: 'senhasegura123',
      });

      const call = mockPrisma.user.update.mock.calls[0]?.[0] as {
        data: { passwordHash: string };
      };
      expect(call.data.passwordHash).not.toBe('senhasegura123');
      await expect(bcrypt.compare('senhasegura123', call.data.passwordHash)).resolves.toBe(true);
    });

    it('rejects a user that is not a GUEST', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        ...guestUser,
        provider: 'GOOGLE',
      });

      await expect(
        service.linkPassword('guest-1', {
          email: 'guest@example.com',
          name: 'Guest Secured',
          password: 'senhasegura123',
        }),
      ).rejects.toMatchObject({
        response: { code: 'ACCOUNT_ALREADY_SECURED' },
      });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an email that already belongs to another account', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(guestUser)
        .mockResolvedValueOnce({ id: 'other-user' });

      await expect(
        service.linkPassword('guest-1', {
          email: 'taken@example.com',
          name: 'Guest Secured',
          password: 'senhasegura123',
        }),
      ).rejects.toMatchObject({
        response: { code: 'EMAIL_ALREADY_REGISTERED' },
      });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a disabled/unknown account', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.linkPassword('missing-user', {
          email: 'guest@example.com',
          name: 'Guest Secured',
          password: 'senhasegura123',
        }),
      ).rejects.toMatchObject({
        response: { code: 'ACCOUNT_DISABLED' },
      });
    });
  });

  describe('register', () => {
    it('deve criar usuario e retornar tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'matheus@email.com',
      });
      mockPrisma.refreshToken.create.mockResolvedValue({
        id: 'rt-1',
        token: 'mock-refresh',
      });
      mockPrisma.refreshToken.update.mockResolvedValue({});

      const result = await service.register({
        email: 'matheus@email.com',
        name: 'Matheus',
        password: 'senhasegura123',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'matheus@email.com',
            name: 'Matheus',
          }),
        }),
      );
    });

    it('deve rejeitar email duplicado', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          email: 'matheus@email.com',
          name: 'Matheus',
          password: 'senhasegura123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('deve autenticar com credenciais corretas', async () => {
      const hash = await bcrypt.hash('senhasegura123', 10);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'matheus@email.com',
        passwordHash: hash,
      });
      mockPrisma.refreshToken.create.mockResolvedValue({
        id: 'rt-1',
        token: 'mock-refresh',
      });
      mockPrisma.refreshToken.update.mockResolvedValue({});

      const result = await service.login({
        email: 'matheus@email.com',
        password: 'senhasegura123',
      });

      expect(result.accessToken).toBe('mock-access-token');
    });

    it('deve rejeitar senha incorreta', async () => {
      const hash = await bcrypt.hash('senhasegura123', 10);
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'matheus@email.com',
        passwordHash: hash,
      });

      await expect(
        service.login({
          email: 'matheus@email.com',
          password: 'senhaerrada',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deve rejeitar usuario inexistente', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'naoexiste@email.com',
          password: 'senhasegura123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deve rejeitar usuario deletado', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'deletado@email.com',
          password: 'senhasegura123',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'deletado@email.com', deletedAt: null },
      });
    });
  });

  describe('forgotPassword', () => {
    it('cria um token e envia o e-mail para um usuario com senha', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'matheus@email.com',
        passwordHash: 'hash',
      });
      mockPrisma.passwordResetToken.create.mockResolvedValue({});

      await service.forgotPassword('matheus@email.com');

      expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      expect(mockEmailService.send).toHaveBeenCalledTimes(1);
      const sent = mockEmailService.send.mock.calls[0][0];
      expect(sent.to).toBe('matheus@email.com');
      expect(sent.html).toContain('http://localhost:8081/app/auth/reset-password?token=');
    });

    it('nao cria token nem envia e-mail para usuario inexistente, sem lancar erro', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.forgotPassword('naoexiste@email.com')).resolves.toBeUndefined();

      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mockEmailService.send).not.toHaveBeenCalled();
    });

    it('nao envia e-mail para conta social sem senha (mesmo comportamento de "nao encontrado")', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-2',
        email: 'social@email.com',
        passwordHash: null,
      });

      await service.forgotPassword('social@email.com');

      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mockEmailService.send).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('redefine a senha, marca o token como usado e revoga sessoes ativas', async () => {
      const rawToken = 'raw-reset-token';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        tokenHash,
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 'user-1', deletedAt: null },
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.passwordResetToken.update.mockResolvedValue({});
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await service.resetPassword(rawToken, 'novaSenhaSegura123');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String) },
      });
      expect(mockPrisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'prt-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('accepts the new exact password after reset and rejects the old password', async () => {
      const user = { id: 'user-reset-login', email: 'test@example.com', deletedAt: null, passwordHash: await bcrypt.hash('OldPassword123', 10) };
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({ id: 'reset-1', userId: user.id, user, usedAt: null, expiresAt: new Date(Date.now() + 60_000) });
      mockPrisma.user.update.mockImplementation(async ({ data }: { data: { passwordHash: string } }) => { user.passwordHash = data.passwordHash; return user; });
      mockPrisma.user.findFirst.mockImplementation(async () => user);
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'refresh-new' });
      mockPrisma.refreshToken.update.mockResolvedValue({});
      const newPassword = 'NewExactPassword123!';
      await service.resetPassword('valid-reset-token', newPassword);
      await expect(service.login({ email: user.email, password: newPassword })).resolves.toHaveProperty('accessToken');
      await expect(service.login({ email: user.email, password: 'OldPassword123' })).rejects.toThrow(UnauthorizedException);
    });

    it('rejeita token inexistente', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword('invalido', 'novaSenhaSegura123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejeita token ja usado', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 'user-1', deletedAt: null },
      });

      await expect(service.resetPassword('usado', 'novaSenhaSegura123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejeita token expirado', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
        user: { id: 'user-1', deletedAt: null },
      });

      await expect(service.resetPassword('expirado', 'novaSenhaSegura123')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refreshTokens', () => {
    it('deve rejeitar refresh token de usuario deletado e revogar familia', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: 'refresh-token',
        userId: 'user-1',
        familyId: 'family-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: {
          id: 'user-1',
          email: 'deletado@email.com',
          deletedAt: new Date(),
        },
      });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.refreshTokens('refresh-token')).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('logoutByAccessToken', () => {
    it('revoga refresh tokens ativos do usuario do access token', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'user-1', email: 'matheus@email.com' });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await service.logoutByAccessToken('access-token');

      expect(mockJwt.verifyAsync).toHaveBeenCalledWith('access-token', {
        secret: mockEnv.JWT_ACCESS_SECRET,
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('OAuth authorization code', () => {
    it('emite codigo descartavel e faz a troca com state e PKCE validos', async () => {
      const verifier = 'a'.repeat(43);
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const state = service.createOAuthState('client-state-123456', challenge);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'google@example.com',
        provider: 'GOOGLE',
        providerId: 'google-1',
        deletedAt: null,
      });
      mockPrisma.oAuthAuthorizationCode.create.mockResolvedValue({ id: 'oauth-code-1' });

      const authorization = await service.createGoogleAuthorizationCode(
        {
          email: 'google@example.com',
          name: 'Google User',
          googleId: 'google-1',
        },
        state,
      );

      expect(authorization.state).toBe('client-state-123456');
      expect(authorization.code).toBeDefined();
      expect(mockPrisma.oAuthAuthorizationCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          codeHash: expect.not.stringContaining(authorization.code),
          codeChallenge: challenge,
          clientState: 'client-state-123456',
        }),
      });

      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        id: 'oauth-code-1',
        codeHash: createHash('sha256').update(authorization.code).digest('hex'),
        clientState: 'client-state-123456',
        codeChallenge: challenge,
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: {
          id: 'user-1',
          email: 'google@example.com',
          deletedAt: null,
        },
      });
      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt-oauth-1' });
      mockPrisma.refreshToken.update.mockResolvedValue({});

      await expect(
        service.exchangeOAuthCode({
          code: authorization.code,
          state: 'client-state-123456',
          codeVerifier: verifier,
        }),
      ).resolves.toEqual({
        accessToken: 'mock-access-token',
        refreshToken: expect.any(String),
      });
      expect(mockPrisma.oAuthAuthorizationCode.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: 'oauth-code-1', consumedAt: null }),
        data: { consumedAt: expect.any(Date) },
      });
    });

    it('rejeita replay de codigo OAuth ja consumido', async () => {
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        id: 'oauth-code-1',
        clientState: 'client-state-123456',
        codeChallenge: createHash('sha256').update('a'.repeat(43)).digest('base64url'),
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 'user-1', email: 'google@example.com', deletedAt: null },
      });

      await expect(
        service.exchangeOAuthCode({
          code: 'c'.repeat(43),
          state: 'client-state-123456',
          codeVerifier: 'a'.repeat(43),
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
