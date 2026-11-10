import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_SCAN_RESULT_ITEMS } from '../../../shared/constants';
import { SaveMealDto } from '../dto/save-meal.dto';

const item = {
  name: 'Arroz branco',
  calories: 130,
  protein: 2.5,
  carbs: 28,
  fat: 0.3,
  fiber: 1.6,
  portion: 100,
  unit: '100 g',
};

describe('SaveMealDto scan item bound', () => {
  it('accepts the same complete enumeration size returned by the scan provider', async () => {
    const dto = plainToInstance(SaveMealDto, {
      type: 'LUNCH',
      items: Array.from({ length: MAX_SCAN_RESULT_ITEMS }, () => item),
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('still rejects an oversized untrusted save payload', async () => {
    const dto = plainToInstance(SaveMealDto, {
      type: 'LUNCH',
      items: Array.from({ length: MAX_SCAN_RESULT_ITEMS + 1 }, () => item),
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.constraints?.arrayMaxSize)).toBe(true);
  });
});
