import path from 'path';
import { randomBytes } from 'crypto';
import { PrismaClient, AuthProvider } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { DIET_RECIPE_CATALOG } from './diet-catalog';
import { TACO_FOODS } from './taco-data';
import { WORKOUT_TEMPLATE_CATALOG } from './workout-catalog';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

const DEV_USER_EMAIL = (process.env.DEV_SEED_EMAIL ?? 'matheus@nutriscan.dev').toLowerCase();
const DEV_USER_PASSWORD = process.env.DEV_SEED_PASSWORD ?? 'nutriscan-dev-1';
const DEV_USER_NAME = process.env.DEV_SEED_NAME ?? 'Matheus';

const ADMIN_USER_EMAIL = (process.env.ADMIN_SEED_EMAIL ?? 'admin@calordiet.com').toLowerCase();
const ADMIN_USER_PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? 'C@lorDiet123';
const ADMIN_USER_NAME = process.env.ADMIN_SEED_NAME ?? 'My Peptides Admin';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SHOULD_SEED_DEV_USER = !IS_PRODUCTION || process.env.SEED_DEV_USER === 'true';
const SHOULD_SEED_ADMIN_USER = !IS_PRODUCTION || process.env.SEED_ADMIN_USER === 'true';

// Em producao, os fallbacks hardcoded acima nunca podem ser usados de fato:
// se alguem ligar SEED_DEV_USER/SEED_ADMIN_USER=true sem tambem configurar a
// senha real, falhar explicitamente e melhor que criar silenciosamente um
// usuario com credencial conhecida publicamente (este arquivo e versionado).
if (IS_PRODUCTION && SHOULD_SEED_DEV_USER && !process.env.DEV_SEED_PASSWORD) {
  throw new Error(
    'SEED_DEV_USER=true em producao exige DEV_SEED_PASSWORD configurada (sem fallback hardcoded permitido).',
  );
}
if (IS_PRODUCTION && SHOULD_SEED_ADMIN_USER && !process.env.ADMIN_SEED_PASSWORD) {
  throw new Error(
    'SEED_ADMIN_USER=true em producao exige ADMIN_SEED_PASSWORD configurada (sem fallback hardcoded permitido).',
  );
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

async function seedAchievements(): Promise<void> {
  const result = await prisma.achievementDefinition.createMany({
    data: [
      {
        slug: 'first_meal',
        icon: 'Utensils',
        sortOrder: 1,
        criteria: { kind: 'MEAL_COUNT', min: 1 },
      },
      {
        slug: 'streak_7',
        icon: 'Flame',
        sortOrder: 2,
        criteria: { kind: 'STREAK', min: 7 },
      },
      {
        slug: 'weight_logs_3',
        icon: 'Scale',
        sortOrder: 3,
        criteria: { kind: 'WEIGHT_LOGS', min: 3 },
      },
    ],
    skipDuplicates: true,
  });
  if (result.count > 0) {
    console.log(`Achievements: ${result.count} definicoes inseridas.`);
  }
}

async function seedBadges(): Promise<void> {
  const result = await prisma.badge.createMany({
    data: [
      {
        slug: 'first_steps',
        name: 'Primeiros Passos',
        description: 'Acumule seus primeiros 100 pontos.',
        pointsThreshold: 100,
        sortOrder: 1,
      },
      {
        slug: 'getting_serious',
        name: 'Pegando o Ritmo',
        description: 'Alcance 500 pontos e suba de nivel.',
        pointsThreshold: 500,
        sortOrder: 2,
      },
      {
        slug: 'committed',
        name: 'Comprometido',
        description: 'Alcance 2000 pontos.',
        pointsThreshold: 2000,
        sortOrder: 3,
      },
      {
        slug: 'champion',
        name: 'Campeao',
        description: 'Alcance 5000 pontos.',
        pointsThreshold: 5000,
        sortOrder: 4,
      },
    ],
    skipDuplicates: true,
  });
  if (result.count > 0) {
    console.log(`Badges: ${result.count} definicoes inseridas.`);
  }
}

async function seedDevUser(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEV_USER_PASSWORD, BCRYPT_ROUNDS);
  await prisma.user.upsert({
    where: { email: DEV_USER_EMAIL },
    update: {
      name: DEV_USER_NAME,
      passwordHash,
      emailVerified: true,
      provider: AuthProvider.EMAIL,
    },
    create: {
      email: DEV_USER_EMAIL,
      name: DEV_USER_NAME,
      passwordHash,
      emailVerified: true,
      provider: AuthProvider.EMAIL,
    },
  });
  const dev = await prisma.user.findUnique({
    where: { email: DEV_USER_EMAIL },
    select: { id: true, referralCode: true },
  });
  if (dev && !dev.referralCode) {
    let code = '';
    for (let i = 0; i < 12; i += 1) {
      code = randomBytes(4).toString('hex').toUpperCase();
      const taken = await prisma.user.findUnique({ where: { referralCode: code } });
      if (!taken) break;
    }
    await prisma.user.update({
      where: { id: dev.id },
      data: { referralCode: code },
    });
  }
  console.log(`DEV USER: ${DEV_USER_EMAIL} (login local; sobrescreva com DEV_SEED_* se quiser).`);
}

async function seedAdmin(): Promise<void> {
  // Permanent comp/admin account: always premium, never charged. Password stored hashed.
  const passwordHash = await bcrypt.hash(ADMIN_USER_PASSWORD, BCRYPT_ROUNDS);
  await prisma.user.upsert({
    where: { email: ADMIN_USER_EMAIL },
    update: {
      passwordHash,
      compedAccess: true,
      isAdmin: true,
    },
    create: {
      email: ADMIN_USER_EMAIL,
      name: ADMIN_USER_NAME,
      passwordHash,
      emailVerified: true,
      onboardingCompleted: true,
      provider: AuthProvider.EMAIL,
      compedAccess: true,
      isAdmin: true,
    },
  });
  console.log(`ADMIN USER: ${ADMIN_USER_EMAIL} (comp premium; sobrescreva com ADMIN_SEED_*).`);
}

async function seedTaco() {
  const existing = await prisma.foodItem.count({ where: { source: 'TACO' } });

  if (existing > 0) {
    console.log(`TACO: ${existing} alimentos já existem, pulando seed.`);
    return;
  }

  const data = TACO_FOODS.map((food) => ({
    name: food.name,
    nameNormalized: normalize(food.name),
    category: food.category,
    caloriesPer100g: food.caloriesPer100g,
    proteinPer100g: food.proteinPer100g,
    carbsPer100g: food.carbsPer100g,
    fatPer100g: food.fatPer100g,
    defaultPortionG: food.defaultPortionG,
    defaultPortionLabel: food.defaultPortionLabel,
    source: 'TACO' as const,
    isVerified: true,
    imageHashes: [],
  }));

  const result = await prisma.foodItem.createMany({ data, skipDuplicates: true });
  console.log(`TACO: ${result.count} alimentos inseridos.`);
}

async function seedDietCatalog(): Promise<void> {
  let inserted = 0;
  let updated = 0;

  for (const recipe of DIET_RECIPE_CATALOG) {
    const data = {
      userId: null,
      name: recipe.name,
      mealType: recipe.mealType,
      calories: recipe.calories,
      proteinG: recipe.protein,
      carbsG: recipe.carbs,
      fatG: recipe.fat,
      prepTimeMin: recipe.prepTimeMin,
      ingredientsJson: recipe.ingredients as never,
      stepsJson: recipe.steps as never,
      dietTypesJson: recipe.dietTypes as never,
      aiGenerated: false,
    };

    const existing = await prisma.recipe.findFirst({
      where: {
        userId: null,
        aiGenerated: false,
        name: recipe.name,
        mealType: recipe.mealType,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.recipe.update({
        where: { id: existing.id },
        data,
      });
      updated += 1;
      continue;
    }

    await prisma.recipe.create({
      data,
    });
    inserted += 1;
  }

  console.log(`Diet catalog: ${inserted} receitas inseridas, ${updated} atualizadas.`);
}

async function seedWorkoutCatalog(): Promise<void> {
  let inserted = 0;
  let updated = 0;

  for (const template of WORKOUT_TEMPLATE_CATALOG) {
    const existing = await prisma.workoutTemplate.findUnique({
      where: { slug: template.slug },
      select: { id: true },
    });

    await prisma.workoutTemplate.upsert({
      where: { slug: template.slug },
      create: {
        slug: template.slug,
        name: template.name,
        splitType: template.splitType,
        experience: template.experience,
        daysPerWeek: template.daysPerWeek,
        equipment: template.equipment,
        minutesPerSession: template.minutesPerSession,
        focusAreasJson: template.focusAreas as never,
        daysJson: template.days as never,
        active: true,
      },
      update: {
        name: template.name,
        splitType: template.splitType,
        experience: template.experience,
        daysPerWeek: template.daysPerWeek,
        equipment: template.equipment,
        minutesPerSession: template.minutesPerSession,
        focusAreasJson: template.focusAreas as never,
        daysJson: template.days as never,
        active: true,
      },
    });

    if (existing) {
      updated += 1;
    } else {
      inserted += 1;
    }
  }

  console.log(`Workout catalog: ${inserted} templates inseridos, ${updated} atualizados.`);
}

async function main() {
  console.log('Iniciando seed...');
  await seedTaco();
  await seedDietCatalog();
  await seedWorkoutCatalog();
  await seedAchievements();
  await seedBadges();
  if (SHOULD_SEED_DEV_USER) {
    await seedDevUser();
  } else {
    console.log('DEV USER: pulando em production (ative SEED_DEV_USER=true se necessario).');
  }
  if (SHOULD_SEED_ADMIN_USER) {
    await seedAdmin();
  } else {
    console.log('ADMIN USER: pulando em production (ative SEED_ADMIN_USER=true se necessario).');
  }
  console.log('Seed finalizado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
