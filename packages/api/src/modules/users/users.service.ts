import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma';
import { serializeUser } from '../../common/enum-maps';
import type { UpdateUserDto } from './dto';
import { calculateAge, MINIMUM_NUTRITION_AGE_YEARS } from '../../shared/utils';
import { lockSocialIdentity, socialIdentitySubjectHash } from '../auth/social-identity-lock';

class AccountIdentityChangedError extends Error {}

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  provider: true,
  emailVerified: true,
  locale: true,
  countryCode: true,
  timezone: true,
  measurementSystem: true,
  regionDetectionSource: true,
  birthDate: true,
  gender: true,
  heightCm: true,
  weightKg: true,
  activityLevel: true,
  dietType: true,
  exerciseCalories: true,
  rolloverCalories: true,
  notificationsOptIn: true,
  onboardingCompleted: true,
  healthConnectOptIn: true,
  healthConnectOptInAt: true,
  createdAt: true,
  updatedAt: true,
  isAdmin: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    return serializeUser(user);
  }

  async update(userId: string, dto: UpdateUserDto) {
    await this.ensureExists(userId);

    const {
      name,
      avatarUrl,
      locale,
      countryCode,
      timezone,
      measurementSystem,
      regionDetectionSource,
      birthDate,
      gender,
      heightCm,
      weightKg,
      workouts,
      dietType,
      exerciseCalories,
      rolloverCalories,
      notificationsOptIn,
      onboardingCompleted,
      healthConnectOptIn,
      goalType,
      goalSpeed,
      targetWeightKg,
    } = dto;

    if (birthDate) {
      const ageYears = calculateAge(new Date(birthDate));
      if (!Number.isFinite(ageYears) || ageYears < MINIMUM_NUTRITION_AGE_YEARS || ageYears > 120) {
        throw new BadRequestException('birthDate fora da faixa aceita para calculo de meta.');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name,
        avatarUrl,
        locale,
        countryCode,
        timezone,
        measurementSystem,
        regionDetectionSource,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        gender,
        heightCm,
        weightKg,
        activityLevel: workouts,
        dietType,
        exerciseCalories,
        rolloverCalories,
        notificationsOptIn,
        onboardingCompleted,
        ...(healthConnectOptIn === true
          ? { healthConnectOptIn: true, healthConnectOptInAt: new Date() }
          : healthConnectOptIn === false
            ? { healthConnectOptIn: false, healthConnectOptInAt: null }
            : {}),
      },
      select: USER_SELECT,
    });

    // Roteamento de meta: atualiza a Goal ativa se existir; nunca cria uma nova.
    if (goalType !== undefined || goalSpeed !== undefined || targetWeightKg !== undefined) {
      const activeGoal = await this.prisma.goal.findFirst({
        where: { userId, isActive: true },
        select: { id: true },
      });

      if (activeGoal) {
        await this.prisma.goal.update({
          where: { id: activeGoal.id },
          data: {
            type: goalType,
            goalSpeed,
            targetWeightKg,
          },
        });
      }
    }

    return serializeUser(user);
  }

  async deleteAccount(userId: string, deletionReceiptVerified = false) {
    const subjectHash = createHash('sha256').update(userId).digest('hex');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const [candidate] = await tx.$queryRaw<
            Array<{ provider: string; providerId: string | null }>
          >(Prisma.sql`
            SELECT "provider", "providerId"
            FROM "users"
            WHERE "id" = ${userId} AND "deletedAt" IS NULL
          `);
          if (!candidate) {
            if (deletionReceiptVerified) return;
            const receipt = await tx.scanAccountCleanupTask.findUnique({
              where: { subjectHash },
              select: { id: true },
            });
            if (receipt) return;
            throw new NotFoundException('Usuario nao encontrado');
          }

          if (
            (candidate.provider === 'APPLE' || candidate.provider === 'GOOGLE') &&
            candidate.providerId
          ) {
            await lockSocialIdentity(
              tx,
              candidate.provider as 'APPLE' | 'GOOGLE',
              candidate.providerId,
            );
          }

          const [user] = await tx.$queryRaw<
            Array<{
              id: string;
              provider: string;
              providerId: string | null;
              scanAccountGeneration: number;
            }>
          >(Prisma.sql`
            SELECT "id", "provider", "providerId", "scanAccountGeneration"
            FROM "users"
            WHERE "id" = ${userId} AND "deletedAt" IS NULL
            FOR UPDATE
          `);
          if (!user) {
            if (deletionReceiptVerified) return;
            const receipt = await tx.scanAccountCleanupTask.findUnique({
              where: { subjectHash },
              select: { id: true },
            });
            if (receipt) return;
            throw new NotFoundException('Usuario nao encontrado');
          }
          if (user.provider !== candidate.provider || user.providerId !== candidate.providerId) {
            throw new AccountIdentityChangedError();
          }

          const appleCredential =
            user.provider === 'APPLE'
              ? (
                  await tx.$queryRaw<
                    Array<{
                      tokenCiphertext: string;
                      tokenIv: string;
                      tokenTag: string;
                      tokenType: string;
                      tokenKeyId: string | null;
                    }>
                  >(Prisma.sql`
                    SELECT "tokenCiphertext", "tokenIv", "tokenTag", "tokenType", "tokenKeyId"
                    FROM "apple_credentials"
                    WHERE "userId" = ${userId}
                    FOR UPDATE
                  `)
                )[0]
              : null;
          if (
            user.provider === 'APPLE' &&
            (!user.providerId ||
              !appleCredential ||
              (appleCredential.tokenType !== 'refresh_token' &&
                appleCredential.tokenType !== 'access_token'))
          ) {
            throw new ConflictException({
              code: 'APPLE_REAUTH_REQUIRED',
              message: 'Confirme novamente sua conta Apple antes de exclui-la.',
            });
          }

          await tx.scanAccountCleanupTask.create({
            data: {
              id: randomUUID(),
              subjectId: userId,
              subjectHash,
              ...((user.provider === 'APPLE' || user.provider === 'GOOGLE') && user.providerId
                ? {
                    providerSubjectHash: socialIdentitySubjectHash(
                      user.provider as 'APPLE' | 'GOOGLE',
                      user.providerId,
                    ),
                  }
                : {}),
              accountGeneration: user.scanAccountGeneration,
              appleRevocationRequired: user.provider === 'APPLE',
              ...(appleCredential
                ? {
                    appleTokenCiphertext: appleCredential.tokenCiphertext,
                    appleTokenIv: appleCredential.tokenIv,
                    appleTokenTag: appleCredential.tokenTag,
                    appleTokenType: appleCredential.tokenType,
                    appleTokenKeyId: appleCredential.tokenKeyId,
                  }
                : {}),
            },
          });
          await tx.billingSubject.updateMany({
            where: { userId },
            data: { userId: null, detachedAt: new Date() },
          });
          await tx.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await tx.user.delete({ where: { id: userId } });
        });
        return;
      } catch (error) {
        if (!(error instanceof AccountIdentityChangedError) || attempt === 1) throw error;
      }
    }
  }

  /**
   * "Resetar meus dados" - wipes everything the user logged (weight, meals,
   * water, workouts, GLP-1 doses/symptoms/treatments, goals, community posts/
   * comments/likes), but keeps the account itself: login/provider identity,
   * email, locale/theme preference, and billing/subscription are all
   * untouched. Deliberately narrower than deleteAccount() above - this is a
   * "start fresh" action, not account deletion, so nothing here revokes
   * sessions or touches BillingSubject.
   *
   * DailyLog cascades to Meal/WaterEntry/WeightEntry, and Glp1Treatment
   * cascades to its dose plan periods/dose events/symptom events/reminder
   * rules (see schema.prisma), so deleting the two parent rows is enough to
   * clear their children too. Community content is soft-deleted via
   * deletedAt, same as CommunityService.deletePost/deleteComment, so other
   * users' replies in a thread the user posted in aren't left dangling.
   */
  async resetTrackedData(userId: string): Promise<void> {
    await this.ensureExists(userId);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.dailyLog.deleteMany({ where: { userId } });
      await tx.workoutSession.deleteMany({ where: { userId } });
      await tx.trainingWorkout.deleteMany({ where: { userId } });
      await tx.trainingChallengeEntry.deleteMany({ where: { userId } });
      await tx.communityStory.deleteMany({ where: { userId } });
      await tx.goal.deleteMany({ where: { userId } });
      await tx.glp1Treatment.deleteMany({ where: { userId } });
      await tx.communityPost.updateMany({
        where: { userId, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.communityComment.updateMany({
        where: { userId, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.communityLike.deleteMany({ where: { userId } });
      await tx.user.update({ where: { id: userId }, data: { weightKg: null } });
    });
  }

  private async ensureExists(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, provider: true, providerId: true, scanAccountGeneration: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }
    return user;
  }
}
