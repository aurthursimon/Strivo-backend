import path from 'path';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { DIET_RECIPE_CATALOG } from './diet-catalog';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();
const carnivoreRecipes = DIET_RECIPE_CATALOG.filter((recipe) =>
  recipe.dietTypes.includes('CARNIVORE'),
);

async function main(): Promise<void> {
  let inserted = 0;
  let updated = 0;

  for (const recipe of carnivoreRecipes) {
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
      await prisma.recipe.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.recipe.create({ data });
      inserted += 1;
    }
  }

  console.log(`Carnivore catalog: ${inserted} inserted, ${updated} updated.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
