import { programDayNumbers, programRankingQuery, type ProgramRankRow } from './program-ranking';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import {
  CreateTrainerExerciseDto,
  CreateTrainerProgramDto,
  UpdateTrainerProfileDto,
  UpdateTrainerProgramDto,
} from './dto';

@Injectable()
export class TrainerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List public trainers with search & specialty filters.
   */
  async getPublicTrainers(search?: string, specialty?: string, limit = 20) {
    const where: any = {};

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { handle: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { bio: { contains: term, mode: 'insensitive' } },
        { user: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const trainers = await this.prisma.trainerProfile.findMany({
      where,
      take: Math.min(Math.max(limit, 1), 50),
      orderBy: [{ traineesCount: 'desc' }, { rating: 'desc' }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            programs: true,
            customExercises: true,
          },
        },
      },
    });

    if (specialty && specialty.trim()) {
      const spec = specialty.trim().toUpperCase();
      return trainers.filter((t) => {
        const specs = Array.isArray(t.specialties) ? (t.specialties as string[]) : [];
        return specs.some((s) => String(s).toUpperCase() === spec);
      });
    }

    return trainers;
  }

  /**
   * Get public trainer profile by trainerId or userId.
   */
  async getTrainerById(idOrUserId: string, currentUserId?: string) {
    const trainer = await this.prisma.trainerProfile.findFirst({
      where: {
        OR: [{ id: idOrUserId }, { userId: idOrUserId }],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
        programs: {
          where: { isPublished: true },
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: { enrollments: true },
            },
          },
        },
        customExercises: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!trainer) {
      throw new NotFoundException('Trainer profile not found');
    }

    let isEnrolledInAny = false;
    if (currentUserId) {
      const activeEnrollment = await this.prisma.trainerProgramEnrollment.findFirst({
        where: {
          userId: currentUserId,
          program: { trainerId: trainer.id },
          status: 'ACTIVE',
        },
      });
      isEnrolledInAny = Boolean(activeEnrollment);
    }

    return {
      ...trainer,
      isEnrolledInAny,
    };
  }

  /**
   * Get or automatically initialize current user's trainer profile.
   */
  async getMyTrainerProfile(userId: string) {
    let profile = await this.prisma.trainerProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            programs: true,
            customExercises: true,
          },
        },
      },
    });

    if (!profile) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');

      const handle =
        user.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .slice(0, 20) + `_${Math.floor(100 + Math.random() * 900)}`;

      profile = await this.prisma.trainerProfile.create({
        data: {
          userId,
          handle,
          title: 'Fitness & Weight Loss Coach',
          bio: 'Empowering athletes to hit their strength, weight loss, and aesthetic goals.',
          specialties: ['WEIGHT_LOSS', 'STRENGTH'],
          avatarUrl: user.avatarUrl,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: {
              programs: true,
              customExercises: true,
            },
          },
        },
      });
    }

    return profile;
  }

  /**
   * Update current user's trainer profile.
   */
  async updateMyTrainerProfile(userId: string, dto: UpdateTrainerProfileDto) {
    const existing = await this.getMyTrainerProfile(userId);

    if (dto.handle && dto.handle !== existing.handle) {
      const taken = await this.prisma.trainerProfile.findUnique({
        where: { handle: dto.handle },
      });
      if (taken && taken.id !== existing.id) {
        throw new BadRequestException('This handle is already taken');
      }
    }

    const updated = await this.prisma.trainerProfile.update({
      where: { id: existing.id },
      data: {
        handle: dto.handle ?? existing.handle,
        title: dto.title ?? existing.title,
        specialties: dto.specialties ? (dto.specialties as any) : undefined,
        certifications: dto.certifications ? (dto.certifications as any) : undefined,
        yearsExperience: dto.yearsExperience ?? existing.yearsExperience,
        instagram: dto.instagram !== undefined ? dto.instagram : existing.instagram,
        avatarUrl: dto.avatarUrl ?? existing.avatarUrl,
        coverUrl: dto.coverUrl !== undefined ? dto.coverUrl : existing.coverUrl,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            programs: true,
            customExercises: true,
          },
        },
      },
    });

    if (dto.avatarUrl) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: dto.avatarUrl },
      });
    }

    return updated;
  }

  /**
   * Upload / update avatar image for user and trainer profile.
   */
  async updateAvatar(userId: string, avatarUrl: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { userId },
    });

    if (trainer) {
      await this.prisma.trainerProfile.update({
        where: { id: trainer.id },
        data: { avatarUrl },
      });
    }

    return { avatarUrl };
  }

  // ==========================================
  // CUSTOM EXERCISES
  // ==========================================

  async listMyExercises(userId: string) {
    const trainer = await this.getMyTrainerProfile(userId);
    return this.prisma.trainerExercise.findMany({
      where: { trainerId: trainer.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createExercise(userId: string, dto: CreateTrainerExerciseDto) {
    const trainer = await this.getMyTrainerProfile(userId);
    return this.prisma.trainerExercise.create({
      data: {
        trainerId: trainer.id,
        name: dto.name.trim(),
        category: dto.category ?? 'STRENGTH',
        primaryMuscles: dto.primaryMuscles ?? [],
        equipment: dto.equipment ?? 'BODYWEIGHT',
        instructions: dto.instructions?.trim(),
        imageUrl: dto.imageUrl?.trim(),
        videoUrl: dto.videoUrl?.trim(),
      },
    });
  }

  async deleteExercise(userId: string, exerciseId: string) {
    const trainer = await this.getMyTrainerProfile(userId);
    const exercise = await this.prisma.trainerExercise.findUnique({
      where: { id: exerciseId },
    });
    if (!exercise) throw new NotFoundException('Exercise not found');
    if (exercise.trainerId !== trainer.id) {
      throw new ForbiddenException('Not authorized to delete this exercise');
    }

    await this.prisma.trainerExercise.delete({ where: { id: exerciseId } });
    return { success: true };
  }

  // ==========================================
  // PROGRAMS & SESSIONS (DAY 1, DAY 2, ETC.)
  // ==========================================

  async getMyPrograms(userId: string) {
    const trainer = await this.getMyTrainerProfile(userId);
    return this.prisma.trainerProgram.findMany({
      where: { trainerId: trainer.id },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { enrollments: true },
        },
      },
    });
  }

  async getProgramById(programId: string, currentUserId?: string) {
    const program = await this.prisma.trainerProgram.findUnique({
      where: { id: programId },
      include: {
        trainer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
        enrollments: {
          where: { status: { in: ['ACTIVE', 'COMPLETED'] }, user: { deletedAt: null } },
          take: 6,
          orderBy: { joinedAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
        _count: {
          select: { enrollments: { where: { status: { in: ['ACTIVE', 'COMPLETED'] }, user: { deletedAt: null } } } },
        },
      },
    });

    if (!program) throw new NotFoundException('Program not found');

    let isEnrolled = false;
    let enrollment: any = null;
    if (currentUserId) {
      enrollment = await this.prisma.trainerProgramEnrollment.findUnique({
        where: {
          programId_userId: {
            programId,
            userId: currentUserId,
          },
        },
      });
      isEnrolled = Boolean(enrollment && enrollment.status === 'ACTIVE');
    }

    return {
      ...program,
      isEnrolled,
      userEnrollment: enrollment,
    };
  }

  async getProgramParticipants(programId: string, userId: string, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 1000000) throw new BadRequestException('Invalid page');
    const program = await this.prisma.trainerProgram.findUnique({ where: { id: programId }, select: { daysJson: true } });
    if (!program) throw new NotFoundException('Program not found');
    const days = programDayNumbers(program.daysJson);
    const rows = await this.prisma.$queryRaw<ProgramRankRow[]>(programRankingQuery(programId, userId, days, page));
    const entries = rows.map((row) => ({ userId: row.userId, name: row.name || 'Athlete', avatarUrl: row.avatarUrl, joinedAt: row.joinedAt, completed: row.completed, rank: Number(row.rank), isMe: row.userId === userId }));
    const total = Number(rows[0]?.total ?? 0);
    return { total, totalDays: days.length, entries: entries.filter((entry) => entry.rank > (page - 1) * 30 && entry.rank <= page * 30), myEntry: entries.find((entry) => entry.isMe) ?? null, nextPage: page * 30 < total ? page + 1 : null };
  }

  async createProgram(userId: string, dto: CreateTrainerProgramDto) {
    const trainer = await this.getMyTrainerProfile(userId);

    const program = await this.prisma.trainerProgram.create({
      data: {
        trainerId: trainer.id,
        title: dto.title.trim(),
        description: dto.description?.trim() ?? '',
        goal: dto.goal ?? 'WEIGHT_LOSS',
        difficulty: dto.difficulty ?? 'INTERMEDIATE',
        durationWeeks: dto.durationWeeks ?? 4,
        coverImageUrl: dto.coverImageUrl,
        isPublished: dto.isPublished ?? true,
        daysJson: dto.days as any,
      },
      include: {
        _count: {
          select: { enrollments: true },
        },
      },
    });

    return program;
  }

  async updateProgram(userId: string, programId: string, dto: UpdateTrainerProgramDto) {
    const trainer = await this.getMyTrainerProfile(userId);
    const existing = await this.prisma.trainerProgram.findUnique({
      where: { id: programId },
    });
    if (!existing) throw new NotFoundException('Program not found');
    if (existing.trainerId !== trainer.id) {
      throw new ForbiddenException('Not authorized to edit this program');
    }

    return this.prisma.trainerProgram.update({
      where: { id: programId },
      data: {
        title: dto.title.trim(),
        description: dto.description !== undefined ? dto.description.trim() : existing.description,
        goal: dto.goal ?? existing.goal,
        difficulty: dto.difficulty ?? existing.difficulty,
        durationWeeks: dto.durationWeeks ?? existing.durationWeeks,
        coverImageUrl: dto.coverImageUrl !== undefined ? dto.coverImageUrl : existing.coverImageUrl,
        isPublished: dto.isPublished !== undefined ? dto.isPublished : existing.isPublished,
        daysJson: dto.days ? (dto.days as any) : undefined,
      },
      include: {
        _count: {
          select: { enrollments: true },
        },
      },
    });
  }

  async deleteProgram(userId: string, programId: string) {
    const trainer = await this.getMyTrainerProfile(userId);
    const existing = await this.prisma.trainerProgram.findUnique({
      where: { id: programId },
    });
    if (!existing) throw new NotFoundException('Program not found');
    if (existing.trainerId !== trainer.id) {
      throw new ForbiddenException('Not authorized to delete this program');
    }

    await this.prisma.trainerProgram.delete({ where: { id: programId } });
    return { success: true };
  }

  // ==========================================
  // PROGRAM ENROLLMENT ("BECOME PART OF THEIR EXERCISE")
  // ==========================================

  async joinProgram(userId: string, programId: string) {
    const program = await this.prisma.trainerProgram.findUnique({
      where: { id: programId },
      include: { trainer: true },
    });
    if (!program) throw new NotFoundException('Program not found');

    const enrollment = await this.prisma.trainerProgramEnrollment.upsert({
      where: {
        programId_userId: {
          programId,
          userId,
        },
      },
      create: {
        programId,
        userId,
        status: 'ACTIVE',
        currentDay: 1,
        completedDays: [],
      },
      update: {
        status: 'ACTIVE',
      },
      include: {
        program: {
          include: {
            trainer: {
              include: {
                user: {
                  select: { id: true, name: true, avatarUrl: true },
                },
              },
            },
          },
        },
      },
    });

    // Update trainer trainees count
    const totalEnrolled = await this.prisma.trainerProgramEnrollment.count({
      where: {
        program: { trainerId: program.trainerId },
        status: 'ACTIVE',
      },
    });

    await this.prisma.trainerProfile.update({
      where: { id: program.trainerId },
      data: { traineesCount: totalEnrolled },
    });

    return enrollment;
  }

  async leaveProgram(userId: string, programId: string) {
    const program = await this.prisma.trainerProgram.findUnique({
      where: { id: programId },
    });
    if (!program) throw new NotFoundException('Program not found');

    await this.prisma.trainerProgramEnrollment.deleteMany({
      where: {
        programId,
        userId,
      },
    });

    const totalEnrolled = await this.prisma.trainerProgramEnrollment.count({
      where: {
        program: { trainerId: program.trainerId },
        status: 'ACTIVE',
      },
    });

    await this.prisma.trainerProfile.update({
      where: { id: program.trainerId },
      data: { traineesCount: totalEnrolled },
    });

    return { success: true };
  }

  async getMyEnrolledPrograms(userId: string) {
    return this.prisma.trainerProgramEnrollment.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      orderBy: { joinedAt: 'desc' },
      include: {
        program: {
          include: {
            trainer: {
              include: {
                user: {
                  select: { id: true, name: true, avatarUrl: true },
                },
              },
            },
            _count: {
              select: { enrollments: true },
            },
          },
        },
      },
    });
  }

  async completeProgramDay(userId: string, programId: string, dayNumber: number) {
    const enrollment = await this.prisma.trainerProgramEnrollment.findUnique({
      where: {
        programId_userId: {
          programId,
          userId,
        },
      },
    });

    if (!enrollment) throw new NotFoundException('You are not enrolled in this program');

    const program = await this.prisma.trainerProgram.findUnique({ where: { id: programId }, select: { daysJson: true } });
    if (enrollment.status !== 'ACTIVE' || !program || !programDayNumbers(program.daysJson).includes(dayNumber)) throw new BadRequestException('Invalid program day or inactive enrollment');

    const completed = Array.isArray(enrollment.completedDays)
      ? (enrollment.completedDays as number[])
      : [];

    if (completed.includes(dayNumber)) return enrollment;
    const updatedDays = Array.from(new Set([...completed, dayNumber])).sort((a, b) => a - b);

    return this.prisma.trainerProgramEnrollment.update({
      where: { id: enrollment.id },
      data: {
        completedDays: updatedDays,
        currentDay: Math.max(enrollment.currentDay, dayNumber + 1),
      },
    });
  }

  async getFeaturedPrograms(search?: string, limit = 10) {
    const where: any = { isPublished: true };
    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { goal: { contains: term, mode: 'insensitive' } },
      ];
    }

    const programs = await this.prisma.trainerProgram.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        trainer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
        _count: {
          select: { enrollments: true },
        },
      },
    });

    if (programs.length === 0) {
      await this.seedDemoPrograms();
      return this.prisma.trainerProgram.findMany({
        where: { isPublished: true },
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          trainer: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                },
              },
            },
          },
          _count: {
            select: { enrollments: true },
          },
        },
      });
    }

    return programs;
  }

  async getFeaturedChallenges(userId?: string) {
    const programs = await this.prisma.trainerProgram.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: {
        trainer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
        _count: {
          select: { enrollments: { where: { status: { in: ['ACTIVE', 'COMPLETED'] }, user: { deletedAt: null } } } },
        },
        enrollments: userId
          ? {
              where: { userId, status: 'ACTIVE' },
              select: { id: true, status: true },
            }
          : false,
      },
    });

    const now = new Date();
    const months = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ];
    const startMonth = months[now.getMonth()];
    const startDay = now.getDate();

    const badges = ['TRENDING', 'HOT CHALLENGE', 'COMMUNITY CHOICE', 'TOP RATED'];

    return programs.map((p, idx) => {
      const isEnrolled = Array.isArray(p.enrollments) && p.enrollments.length > 0;
      const participantsCount = p._count?.enrollments ?? 0;

      const end = new Date(now.getTime() + p.durationWeeks * 7 * 86400000);
      const endMonth = months[end.getMonth()];
      const endDay = end.getDate();

      return {
        id: `challenge-${p.id}`,
        programId: p.id,
        title: p.title,
        heading: p.title,
        badge: badges[idx % badges.length],
        dates: `${startMonth} ${startDay} – ${endMonth} ${endDay} · ${p.durationWeeks} WEEKS, ZERO EXCUSES`,
        participantsCount,
        coverImageUrl:
          p.coverImageUrl ||
          'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=1080&q=80',
        durationWeeks: p.durationWeeks,
        goal: p.goal,
        difficulty: p.difficulty,
        isEnrolled,
        trainer: {
          id: p.trainer.id,
          name: p.trainer.user?.name || 'Coach',
          handle: p.trainer.handle,
          avatarUrl: p.trainer.avatarUrl || p.trainer.user?.avatarUrl,
        },
      };
    });
  }

  private async seedDemoPrograms() {
    try {
      const fola = await this.prisma.trainerProfile.findFirst({
        where: { handle: 'fola_fit' },
      });
      const jason = await this.prisma.trainerProfile.findFirst({
        where: { handle: 'jason_bjarnson' },
      });
      const sarah = await this.prisma.trainerProfile.findFirst({
        where: { handle: 'sarah_longevity' },
      });

      let demoTrainer = fola || jason || sarah;
      if (!demoTrainer) {
        demoTrainer = await this.prisma.trainerProfile.findFirst();
      }

      if (!demoTrainer) {
        let user = await this.prisma.user.findFirst();
        if (!user) {
          user = await this.prisma.user.create({
            data: {
              name: 'Coach Fola',
              email: 'fola.coach@nutriscan.dev',
            },
          });
        }
        demoTrainer = await this.prisma.trainerProfile.create({
          data: {
            userId: user.id,
            handle: 'coach_fola',
            title: 'Head Performance Coach',
            bio: 'Elite strength & conditioning.',
            verified: true,
            specialties: ['STRENGTH', 'WEIGHT_LOSS'],
          },
        });
      }

      const samplePrograms = [
        {
          trainerId: fola ? fola.id : demoTrainer.id,
          title: 'Fall Strength & Shred',
          description:
            'Maximal hypertrophy and foundational barbell/dumbbell power routines for solid muscle building and peak athleticism.',
          goal: 'STRENGTH',
          difficulty: 'ADVANCED',
          durationWeeks: 8,
          coverImageUrl:
            'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=800&q=80',
          isPublished: true,
          daysJson: [
            {
              dayNumber: 1,
              title: 'Heavy Lower Body & Squat Focus',
              focus: 'Posterior chain & quad overload',
              exercises: [
                {
                  name: 'Barbell Back Squat',
                  sets: 5,
                  reps: '5 reps',
                  restSec: 120,
                  notes: 'Progressive overload',
                },
              ],
            },
          ],
        },
        {
          trainerId: jason ? jason.id : demoTrainer.id,
          title: 'Metabolic Weight Loss',
          description:
            'High-energy metabolic conditioning and strength supersets built to accelerate caloric expenditure and metabolic rate.',
          goal: 'WEIGHT_LOSS',
          difficulty: 'INTERMEDIATE',
          durationWeeks: 8,
          coverImageUrl:
            'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80',
          isPublished: true,
          daysJson: [
            {
              dayNumber: 1,
              title: 'Full Body Metabolic Blast',
              focus: 'Compound movements & cardio endurance',
              exercises: [
                {
                  name: 'Goblet Squats',
                  sets: 4,
                  reps: '15 reps',
                  restSec: 45,
                  notes: 'Keep chest upright',
                },
                {
                  name: 'Kettlebell Swings',
                  sets: 4,
                  reps: '20 reps',
                  restSec: 45,
                  notes: 'Hinge powerfully from hips',
                },
              ],
            },
          ],
        },
        {
          trainerId: sarah ? sarah.id : demoTrainer.id,
          title: 'Active Longevity',
          description:
            'A scientifically structured program to protect joints, boost mobility, and increase daily vitality for lifelong fitness.',
          goal: 'LONGEVITY',
          difficulty: 'BEGINNER',
          durationWeeks: 6,
          coverImageUrl:
            'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=800&q=80',
          isPublished: true,
          daysJson: [
            {
              dayNumber: 1,
              title: 'Joint Mobility & Core Awakening',
              focus: 'Spine, Hips & Ankles',
              exercises: [
                {
                  name: 'Cat-Cow Flow',
                  sets: 3,
                  reps: '12 reps',
                  restSec: 45,
                  notes: 'Breathe with each cycle',
                },
                {
                  name: 'Bird Dog',
                  sets: 3,
                  reps: '10 reps/side',
                  restSec: 60,
                  notes: 'Hold for 2s at peak',
                },
                {
                  name: 'Glute Bridge',
                  sets: 3,
                  reps: '15 reps',
                  restSec: 60,
                  notes: 'Squeeze glutes at top',
                },
              ],
            },
          ],
        },
      ];

      for (const p of samplePrograms) {
        await this.prisma.trainerProgram.create({
          data: {
            trainerId: p.trainerId,
            title: p.title,
            description: p.description,
            goal: p.goal,
            difficulty: p.difficulty,
            durationWeeks: p.durationWeeks,
            coverImageUrl: p.coverImageUrl,
            isPublished: p.isPublished,
            daysJson: p.daysJson,
          },
        });
      }
    } catch (e) {
      console.warn('Failed to seed demo programs:', e);
    }
  }
}
