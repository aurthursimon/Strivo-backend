import { DIET_RECIPE_CATALOG } from '../../../../prisma/seeds/diet-catalog';
import {
  dietCatalogLocalizationCoverage,
  localizeMealPlan,
  localizeRecipe,
} from '../diet.localization';

describe('diet catalog localization', () => {
  const ingredientNames = new Set(
    DIET_RECIPE_CATALOG.flatMap((recipe) =>
      recipe.ingredients.flatMap((ingredient) => [
        ingredient.name,
        ...ingredient.substitutions.map((substitution) => substitution.name),
      ]),
    ),
  );

  it('has an explicit translation for every recipe and ingredient in the complete catalog', () => {
    expect(DIET_RECIPE_CATALOG).toHaveLength(340);
    expect(
      DIET_RECIPE_CATALOG.filter(
        (recipe) => !dietCatalogLocalizationCoverage.recipeNames.has(recipe.name),
      ),
    ).toEqual([]);
    expect(
      [...ingredientNames].filter(
        (ingredient) => !dietCatalogLocalizationCoverage.ingredientNames.has(ingredient),
      ),
    ).toEqual([]);
  });

  it('adds ten Brazilian and São Paulo-friendly options to every meal slot', () => {
    const brazilianNames = [
      'Pao na chapa integral com queijo minas',
      'Bolo assado de banana aveia e ovos',
      'Virado a paulista leve com lombo ovos e couve',
      'Bauru integral de peru queijo e tomate',
      'Yakisoba paulistano leve de frango e legumes',
      'Caldo de feijao com couve',
    ];
    const previousMealCounts: Record<string, number> = {
      BREAKFAST: 39,
      MORNING_SNACK: 34,
      LUNCH: 47,
      AFTERNOON_SNACK: 36,
      DINNER: 46,
      SUPPER: 30,
    };

    for (const name of brazilianNames) {
      expect(DIET_RECIPE_CATALOG.some((recipe) => recipe.name === name)).toBe(true);
    }
    for (const [mealType, previousCount] of Object.entries(previousMealCounts)) {
      expect(
        DIET_RECIPE_CATALOG.filter((recipe) => recipe.mealType === mealType).length,
      ).toBeGreaterThanOrEqual(previousCount + 10);
    }
  });

  it('covers representative dishes from five major Brazilian markets', () => {
    const regionalRecipes = {
      saoPaulo: [
        'Virado a paulista leve com lombo ovos e couve',
        'Cuscuz paulista de ovos e legumes',
        'Bauru integral de peru queijo e tomate',
        'Frango a parmegiana assado com arroz e brocolis',
        'Galinhada paulista integral com cenoura e couve',
        'Lanche de pernil magro com tomate',
        'Coxinha assada de frango e mandioca',
        'Beirute integral de patinho e tomate',
      ],
      rioJaneiro: [
        'Feijoada carioca leve com couve e arroz',
        'File a Oswaldo Aranha leve',
        'Picadinho carioca com arroz e feijao preto',
        'Peixada a brasileira com mandioca',
        'Sopa a Leao Veloso leve',
        'Caldinho carioca de feijao preto',
        'Bolinho assado de bacalhau e batata',
        'Peixe ensopado da Costa Verde com banana-da-terra',
      ],
      minasGerais: [
        'Pao de queijo mineiro com cottage',
        'Frango com quiabo e arroz integral',
        'Tutu de feijao mineiro com lombo e couve',
        'Vaca atolada mineira leve',
        'Canjiquinha mineira com frango e couve',
        'Romeu e Julieta leve',
        'Angu mineiro com patinho e couve',
        'Broa mineira de milho com queijo canastra',
      ],
      rioGrandeSul: [
        'Arroz carreteiro gaucho leve',
        'Galeto gaucho assado com polenta',
        'Charque gaucho com abobora e couve',
        'Polenta com patinho ao molho',
        'Cuca gaucha de banana e aveia',
        'Sagu gaucho de chia e uva',
        'Xixo gaucho de carne frango e legumes',
        'Tortei gaucho de abobora e ricota',
      ],
      santaCatarina: [
        'Tainha catarinense assada com pirao e couve',
        'Peixada catarinense com mandioca e tomate',
        'Marreco catarinense com repolho roxo',
        'Pirao catarinense de peixe com arroz',
        'Arroz de berbigao com tomate e couve',
        'Ostras catarinenses assadas com legumes',
        'Sopa agnolini catarinense de frango e legumes',
        'Entrevero catarinense leve de carnes e legumes',
      ],
    };
    const catalogNames = new Set(DIET_RECIPE_CATALOG.map((recipe) => recipe.name));

    for (const recipes of Object.values(regionalRecipes)) {
      expect(recipes).toHaveLength(8);
      expect(recipes.filter((recipe) => !catalogNames.has(recipe))).toEqual([]);
    }
  });

  it('covers eight simplified Filipino dishes across breakfast, lunch, dinner, snack, and supper', () => {
    const philippinesRecipes = [
      'Tapa filipino de patinho com arroz integral e ovo',
      'Tinola filipino de frango com abobrinha e espinafre',
      'Adobo filipino de frango leve com arroz integral',
      'Sinigang filipino de peixe com berinjela e tomate',
      'Pinakbet filipino de camarao com abobrinha e pimentao',
      'Ginisang filipino de lentilha com couve',
      'Lanche filipino de banana com aveia e castanhas',
      'Caldo filipino de peixe com arroz integral e gengibre',
    ];
    const catalogByName = new Map(DIET_RECIPE_CATALOG.map((recipe) => [recipe.name, recipe]));

    expect(philippinesRecipes).toHaveLength(8);
    for (const name of philippinesRecipes) {
      expect(catalogByName.has(name)).toBe(true);
    }
    const mealTypes = new Set(
      philippinesRecipes.map((name) => catalogByName.get(name)!.mealType),
    );
    expect(mealTypes.size).toBeGreaterThanOrEqual(5);
  });

  it('offers at least 50 compatible recipes for every onboarding diet type', () => {
    const compatibility: Record<string, string[]> = {
      VEGAN: ['VEGAN'],
      VEGETARIAN: ['VEGETARIAN', 'VEGAN'],
      PESCATARIAN: ['PESCATARIAN', 'VEGETARIAN', 'VEGAN'],
      KETO: ['KETO'],
      CARNIVORE: ['CARNIVORE'],
      OMNIVORE: ['OMNIVORE', 'PESCATARIAN', 'VEGETARIAN', 'VEGAN', 'KETO', 'OTHER'],
      OTHER: ['OMNIVORE', 'PESCATARIAN', 'VEGETARIAN', 'VEGAN', 'KETO', 'OTHER'],
    };
    const mealTypes = [
      'BREAKFAST',
      'MORNING_SNACK',
      'LUNCH',
      'AFTERNOON_SNACK',
      'DINNER',
      'SUPPER',
    ];

    for (const compatibleTypes of Object.values(compatibility)) {
      const available = DIET_RECIPE_CATALOG.filter((recipe) =>
        recipe.dietTypes.some((recipeType) => compatibleTypes.includes(recipeType)),
      );
      expect(available.length).toBeGreaterThanOrEqual(50);
      for (const mealType of mealTypes) {
        const count = available.filter((recipe) => recipe.mealType === mealType).length;
        expect(count).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('contains 56 animal-only carnivore recipes with broad coverage of every meal slot', () => {
    const carnivoreRecipes = DIET_RECIPE_CATALOG.filter((recipe) =>
      recipe.dietTypes.includes('CARNIVORE'),
    );
    const animalIngredients = new Set([
      'Peito de frango',
      'Ovos',
      'Patinho moido',
      'Peito de peru',
      'Frango desfiado',
      'Carne de panela magra',
      'Lombo suino magro',
      'Iogurte grego natural',
      'Queijo cottage',
      'Ricota',
      'Kefir natural',
      'Queijo minas',
      'Iogurte natural',
      'Whey protein',
      'Atum',
      'Tilapia',
      'Sardinha',
      'Camarao',
      'Salmao',
      'Pescada branca',
      'Linguado',
      'Patinho em bife',
      'Queijo parmesao',
    ]);
    const mealTypes = [
      'BREAKFAST',
      'MORNING_SNACK',
      'LUNCH',
      'AFTERNOON_SNACK',
      'DINNER',
      'SUPPER',
    ];

    expect(carnivoreRecipes).toHaveLength(56);
    for (const mealType of mealTypes) {
      expect(
        carnivoreRecipes.filter((recipe) => recipe.mealType === mealType).length,
      ).toBeGreaterThanOrEqual(8);
    }
    for (const recipe of carnivoreRecipes) {
      for (const ingredient of recipe.ingredients) {
        expect(animalIngredients.has(ingredient.name)).toBe(true);
        expect(
          ingredient.substitutions.every((substitution) =>
            animalIngredients.has(substitution.name),
          ),
        ).toBe(true);
      }
    }
  });

  it('keeps ingredient substitutions compatible with vegan, vegetarian, and pescatarian diets', () => {
    const terrestrialMeat = new Set([
      'Peito de frango',
      'Patinho moido',
      'Peito de peru',
      'Frango desfiado',
      'Frango moido',
      'Carne de panela magra',
      'Lombo suino magro',
      'Patinho em bife',
    ]);
    const fish = new Set([
      'Atum',
      'Tilapia',
      'Sardinha',
      'Camarao',
      'Salmao',
      'Salmao defumado',
      'Pescada branca',
      'Linguado',
    ]);
    const animalProducts = new Set([
      ...terrestrialMeat,
      ...fish,
      'Ovos',
      'Iogurte grego natural',
      'Queijo cottage',
      'Ricota',
      'Kefir natural',
      'Queijo minas',
      'Queijo branco',
      'Queijo feta',
      'Queijo parmesao',
      'Queijo prato',
      'Mucarela de bufala',
      'Iogurte natural',
      'Whey protein',
    ]);

    for (const recipe of DIET_RECIPE_CATALOG) {
      const visibleIngredients = recipe.ingredients.flatMap((ingredient) => [
        ingredient.name,
        ...ingredient.substitutions.map((substitution) => substitution.name),
      ]);
      if (recipe.dietTypes.includes('VEGAN')) {
        expect(visibleIngredients.filter((name) => animalProducts.has(name))).toEqual([]);
      }
      if (recipe.dietTypes.includes('VEGETARIAN')) {
        expect(
          visibleIngredients.filter((name) => terrestrialMeat.has(name) || fish.has(name)),
        ).toEqual([]);
      }
      if (recipe.dietTypes.includes('PESCATARIAN')) {
        expect(visibleIngredients.filter((name) => terrestrialMeat.has(name))).toEqual([]);
      }
    }
  });

  it('provides five real alternatives without repeating the original ingredient', () => {
    for (const recipe of DIET_RECIPE_CATALOG) {
      for (const ingredient of recipe.ingredients) {
        expect(ingredient.substitutions).toHaveLength(5);
        expect(
          ingredient.substitutions.some(
            (substitution) =>
              substitution.name.toLocaleLowerCase('pt-BR') ===
              ingredient.name.toLocaleLowerCase('pt-BR'),
          ),
        ).toBe(false);
      }
    }
  });

  it.each(['en', 'pt', 'es'] as const)(
    'localizes every name, ingredient, amount, substitution, and preparation step in %s',
    (locale) => {
      for (const source of DIET_RECIPE_CATALOG) {
        const localized = localizeRecipe(
          {
            ...source,
            ingredients: source.ingredients,
            steps: source.steps,
          },
          locale,
        );

        expect(localized.name.trim()).not.toBe('');
        expect(localized.ingredients).toHaveLength(source.ingredients.length);
        expect(localized.steps).toHaveLength(5);
        expect(localized.steps.every((step) => step.trim().length > 20)).toBe(true);

        for (const ingredient of localized.ingredients ?? []) {
          expect(ingredient.name.trim()).not.toBe('');
          expect(ingredient.amount.trim()).not.toBe('');
          expect(ingredient.substitutions).toHaveLength(5);
          expect(
            ingredient.substitutions?.every(
              (substitution) =>
                substitution.name.trim().length > 0 && substitution.amount.trim().length > 0,
            ),
          ).toBe(true);
        }
      }
    },
  );

  it('translates every Portuguese amount unit shown in English', () => {
    const portugueseUnit =
      /\b(?:colher|colheres|unidade|unidades|fatia|fatias|folha|folhas|xicara|xícaras|porcao|porção|cozido|cozida)\b/i;

    for (const source of DIET_RECIPE_CATALOG) {
      const localized = localizeRecipe(
        { ...source, ingredients: source.ingredients, steps: source.steps },
        'en',
      );
      for (const ingredient of localized.ingredients) {
        expect(ingredient.amount).not.toMatch(portugueseUnit);
        for (const substitution of ingredient.substitutions ?? []) {
          expect(substitution.amount).not.toMatch(portugueseUnit);
        }
      }
    }
  });

  it.each(['en', 'pt', 'es'] as const)(
    'adds localized food-safety guidance to animal-protein recipes in %s',
    (locale) => {
      const source = DIET_RECIPE_CATALOG.find(
        (recipe) => recipe.name === 'Frango assado com ovos',
      )!;
      const localized = localizeRecipe(
        {
          ...source,
          ingredients: source.ingredients,
          steps: source.steps,
        },
        locale,
      );

      expect(localized.steps.at(-1)).toMatch(/74 °C|165 °F/);
    },
  );

  it('localizes recipes nested in a previously saved plan without mutating canonical data', () => {
    const recipe = DIET_RECIPE_CATALOG[0]!;
    const canonicalPlan = {
      days: [
        {
          meals: [
            {
              recipe: { ...recipe },
              alternatives: [{ ...DIET_RECIPE_CATALOG[1]! }],
            },
          ],
        },
      ],
    };

    const english = localizeMealPlan(canonicalPlan, 'en-US');
    const spanish = localizeMealPlan(canonicalPlan, 'es-419');
    const portuguese = localizeMealPlan(canonicalPlan, 'pt-BR');

    expect(english.days[0]!.meals[0]!.recipe.name).toBe('Oatmeal with banana and chia');
    expect(spanish.days[0]!.meals[0]!.recipe.name).toBe('Avena cocida con banana y chía');
    expect(portuguese.days[0]!.meals[0]!.recipe.name).toBe('Mingau de aveia com banana e chia');
    expect(canonicalPlan.days[0]!.meals[0]!.recipe.name).toBe('Mingau de aveia com banana e chia');
  });
});
