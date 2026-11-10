import { WORKOUT_TEMPLATE_CATALOG } from '../../../../prisma/seeds/workout-catalog';
import { localizeWorkoutPlan, workoutCatalogLocalizationCoverage } from '../workout.localization';

describe('static workout catalog localization', () => {
  const exercises = WORKOUT_TEMPLATE_CATALOG.flatMap((template) =>
    template.days.flatMap((day) => day.exercises),
  );

  it('covers every exercise and alternative in all 28 templates', () => {
    expect(WORKOUT_TEMPLATE_CATALOG).toHaveLength(28);
    expect(
      WORKOUT_TEMPLATE_CATALOG.map((template) => template.name).filter(
        (name) => !workoutCatalogLocalizationCoverage.planNames.has(name),
      ),
    ).toEqual([]);
    expect(exercises).toHaveLength(514);
    expect(
      [...new Set(exercises.map((exercise) => exercise.name))].filter(
        (name) => !workoutCatalogLocalizationCoverage.exerciseNames.has(name),
      ),
    ).toEqual([]);
    expect(
      [...new Set(exercises.flatMap((exercise) => exercise.alternatives))].filter(
        (name) =>
          !workoutCatalogLocalizationCoverage.alternativeNames.has(name.toLowerCase()) &&
          !workoutCatalogLocalizationCoverage.exerciseNames.has(name),
      ),
    ).toEqual([]);
  });

  it('does not repeat the same exercise inside a workout day', () => {
    for (const template of WORKOUT_TEMPLATE_CATALOG) {
      for (const day of template.days) {
        const exerciseKeys = day.exercises.map((exercise) => exercise.key);
        expect(new Set(exerciseKeys).size).toBe(exerciseKeys.length);
      }
    }
  });

  it.each(['en', 'pt', 'es'] as const)('localizes every visible workout field in %s', (locale) => {
    for (const template of WORKOUT_TEMPLATE_CATALOG) {
      const localized = localizeWorkoutPlan({ name: template.name, days: template.days }, locale);

      expect(localized.name.trim()).not.toBe('');
      for (const day of localized.days) {
        expect(day.name.trim()).not.toBe('');
        expect(day.focusArea.trim()).not.toBe('');
        for (const exercise of day.exercises) {
          expect(exercise.name.trim()).not.toBe('');
          expect(exercise.instructions.trim().length).toBeGreaterThan(30);
          expect(exercise.setup.trim().length).toBeGreaterThan(30);
          expect(exercise.execution.trim().length).toBeGreaterThan(30);
          expect(exercise.breathing.trim().length).toBeGreaterThan(20);
          expect(exercise.commonMistakes).toHaveLength(3);
          expect(String(exercise.progression).trim().length).toBeGreaterThan(30);
          expect(exercise.safetyNotes?.length).toBeGreaterThanOrEqual(1);
          expect(exercise.safetyNotes?.length).toBeLessThanOrEqual(3);
          expect(
            exercise.alternatives.every((alternative) => String(alternative).trim().length > 0),
          ).toBe(true);
        }
      }
    }
  });

  it('switches locale for a previously saved static plan without mutating it', () => {
    const source = {
      name: WORKOUT_TEMPLATE_CATALOG[0]!.name,
      days: WORKOUT_TEMPLATE_CATALOG[0]!.days,
    };
    const english = localizeWorkoutPlan(source, 'en-US');
    const spanish = localizeWorkoutPlan(source, 'es-419');

    expect(english.name.toLowerCase()).toContain('adaptation');
    expect(spanish.name.toLowerCase()).toContain('adaptación');
    expect(english.days[0]!.name).not.toBe('Day 1');
    expect(spanish.days[0]!.name).not.toBe('Día 1');
    expect(source.name).toBe(WORKOUT_TEMPLATE_CATALOG[0]!.name);
  });

  it('preserves exercise-specific coaching instead of replacing every exercise with one text', () => {
    const source = WORKOUT_TEMPLATE_CATALOG.find((template) =>
      template.days.some((day) =>
        day.exercises.some((exercise) => exercise.name === 'Supino maquina'),
      ),
    )!;
    const portuguese = localizeWorkoutPlan({ name: source.name, days: source.days }, 'pt');
    const english = localizeWorkoutPlan({ name: source.name, days: source.days }, 'en');
    const ptPress = portuguese.days
      .flatMap((day) => day.exercises)
      .find((exercise) => exercise.name === 'Supino na máquina')!;
    const enPress = english.days
      .flatMap((day) => day.exercises)
      .find((exercise) => exercise.name === 'Machine chest press')!;

    expect(ptPress.instructions).toContain('alças para frente');
    expect(ptPress.setup).toContain('linha do meio do peito');
    expect(ptPress.execution).toContain('sem travar os cotovelos');
    expect(enPress.instructions).toContain('Machine chest press');
    expect(enPress.setup).toContain('machine');
  });

  it.each(['pt', 'en', 'es'] as const)(
    'localizes the resistance-band catalog path in %s',
    (locale) => {
      const source = WORKOUT_TEMPLATE_CATALOG.find(
        (template) => template.slug === 'fullbody-casa-elasticos-3d',
      )!;
      const localized = localizeWorkoutPlan({ name: source.name, days: source.days }, locale);
      const exercises = localized.days.flatMap((day) => day.exercises);

      expect(localized.name.trim()).not.toBe(source.name);
      expect(exercises).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: expect.stringMatching(/band|elástico|banda/i) }),
        ]),
      );
      expect(exercises.every((exercise) => exercise.safetyNotes?.length)).toBe(true);
    },
  );
});
