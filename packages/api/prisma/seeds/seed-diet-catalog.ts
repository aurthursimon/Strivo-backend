import { PrismaClient } from '@prisma/client';
import { DIET_RECIPE_CATALOG } from './diet-catalog';

const prisma = new PrismaClient();

function recipeKey(name: string, mealType: string): string {
  return `${mealType}\u0000${name}`;
}

async function seedDietCatalog(): Promise<void> {
  const existingRecipes = await prisma.recipe.findMany({
    where: { userId: null, aiGenerated: false },
    select: { id: true, name: true, mealType: true },
  });
  const existingByKey = new Map(
    existingRecipes.map((recipe) => [recipeKey(recipe.name, recipe.mealType), recipe.id]),
  );
  let inserted = 0;
  let updated = 0;

  const operations = DIET_RECIPE_CATALOG.map((recipe) => {
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
    const existingId = existingByKey.get(recipeKey(recipe.name, recipe.mealType));

    if (existingId) {
      updated += 1;
      return prisma.recipe.update({ where: { id: existingId }, data });
    }

    inserted += 1;
    return prisma.recipe.create({ data });
  });

  await prisma.$transaction(operations);
  console.log(
    `Diet catalog: ${inserted} receitas inseridas, ${updated} atualizadas, ${DIET_RECIPE_CATALOG.length} no catalogo.`,
  );
}

seedDietCatalog()
  .catch((error) => {
    console.error('Falha ao executar a seed exclusiva do catalogo de dieta.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
