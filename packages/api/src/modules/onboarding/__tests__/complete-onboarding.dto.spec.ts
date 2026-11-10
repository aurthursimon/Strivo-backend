import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CompleteOnboardingDto } from '../dto';

describe('CompleteOnboardingDto planProvisioning', () => {
  it('aceita metas e dieta, deixando o treino para personalizacao posterior', async () => {
    const dto = plainToInstance(CompleteOnboardingDto, {
      planProvisioning: {
        calculateNutritionTargets: true,
        generateDietPlan: true,
        generateWorkoutPlan: false,
        source: 'ONBOARDING',
      },
    });

    const errors = await validate(dto, { skipMissingProperties: true });
    expect(errors).toEqual([]);
  });

  it('rejeita provisionamento parcial ou desabilitado', async () => {
    const dto = plainToInstance(CompleteOnboardingDto, {
      planProvisioning: {
        calculateNutritionTargets: true,
        generateDietPlan: false,
        generateWorkoutPlan: false,
        source: 'ONBOARDING',
      },
    });

    const errors = await validate(dto, { skipMissingProperties: true });
    expect(errors).not.toEqual([]);
  });

  it('aceita regiao, unidade e as quatro opcoes de sexo do onboarding', async () => {
    for (const gender of ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']) {
      const dto = plainToInstance(CompleteOnboardingDto, {
        gender,
        countryCode: 'BR',
        measurementSystem: 'METRIC',
        regionDetectionSource: 'DEVICE_REGION',
        weeklyGoalKg: 0.65,
        glp1: {
          medication: 'ozempic',
          medicationMarket: 'BRAZIL',
          medicationCountryCode: 'BR',
          doseMg: 0.5,
          intervalDays: 7,
          cravingPeakDay: 5,
        },
      });

      await expect(validate(dto, { skipMissingProperties: true })).resolves.toEqual([]);
    }
  });
});
