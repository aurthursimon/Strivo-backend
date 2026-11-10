import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CalculateTdeeDto } from '../dto/calculate-tdee.dto';

const validate = (payload: Record<string, unknown>) => {
  const dto = plainToInstance(CalculateTdeeDto, payload);
  return { dto, errors: validateSync(dto) };
};

describe('CalculateTdeeDto', () => {
  it('normaliza enums comuns em lowercase e GoalType curto', () => {
    const { dto, errors } = validate({
      gender: 'male',
      weightKg: 72,
      heightCm: 175,
      ageYears: 30,
      activityLevel: 'moderate',
      goalType: 'lose',
    });

    expect(errors).toHaveLength(0);
    expect(dto.gender).toBe('MALE');
    expect(dto.activityLevel).toBe('MODERATE');
    expect(dto.goalType).toBe('LOSE_WEIGHT');
  });

  it('rejeita calculo nutricional para menores de 18 anos', () => {
    const { errors } = validate({
      gender: 'female',
      weightKg: 60,
      heightCm: 165,
      ageYears: 17,
      activityLevel: 'light',
      goalType: 'maintain',
    });

    expect(errors.some((error) => error.property === 'ageYears')).toBe(true);
  });
});
