import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LoginDto } from '../../modules/auth/dto/login.dto';
import { DietProfileDto } from '../../modules/diet/dto/diet.dto';
import { UpdateTreatmentDto } from '../../modules/glp1/dto/glp1.dto';
import { BodyDataDto } from '../../modules/users/dto/body-data.dto';

async function invalidProperties<T extends object>(type: new () => T, payload: object) {
  const errors = await validate(plainToInstance(type, payload));
  return errors.map((error) => error.property);
}

describe('user input contracts', () => {
  it('rejects auth values beyond their database-safe limits', async () => {
    await expect(
      invalidProperties(LoginDto, {
        email: `${'a'.repeat(250)}@example.com`,
        password: 'x'.repeat(129),
      }),
    ).resolves.toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('accepts only a strict 24-hour local time for treatment updates', async () => {
    await expect(
      invalidProperties(UpdateTreatmentDto, { usualLocalTime: '8:7' }),
    ).resolves.toContain('usualLocalTime');
    await expect(
      invalidProperties(UpdateTreatmentDto, { usualLocalTime: '08:07' }),
    ).resolves.toEqual([]);
  });

  it('bounds every user-provided item inside profile arrays', async () => {
    const oversized = 'x'.repeat(121);
    await expect(invalidProperties(BodyDataDto, { restrictions: [oversized] })).resolves.toContain(
      'restrictions',
    );
    await expect(
      invalidProperties(DietProfileDto, {
        goalType: 'LOSE',
        restrictions: [oversized],
        dislikedFoods: [],
        mealsPerDay: 4,
        targetCalories: 2000,
      }),
    ).resolves.toContain('restrictions');
  });

  it('keeps every string, number and array DTO field bounded', () => {
    const modulesDir = join(process.cwd(), 'src/modules');
    const dtoFiles = (readdirSync(modulesDir, { recursive: true }) as string[]).filter(
      (path) => path.includes('/dto/') && path.endsWith('.ts'),
    );
    const unbounded: string[] = [];

    for (const relativePath of dtoFiles) {
      const lines = readFileSync(join(modulesDir, relativePath), 'utf8').split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const decorator = lines[index] ?? '';
        if (!/@Is(String|Email|Number|Int|Array)/.test(decorator)) continue;

        let start = index;
        while (start > 0 && lines[start - 1]?.trim().startsWith('@')) start -= 1;
        let end = start;
        const decorators: string[] = [];
        while (lines[end]?.trim().startsWith('@')) {
          decorators.push(lines[end]?.trim() ?? '');
          end += 1;
        }
        const bounded = decorator.includes('@IsArray')
          ? decorators.some((item) => item.includes('@ArrayMaxSize'))
          : decorator.includes('@IsNumber') || decorator.includes('@IsInt')
            ? decorators.some((item) => /@(Min|Max)\(/.test(item))
            : decorators.some((item) => /@(MaxLength|Length|Matches|IsIn|IsEnum)/.test(item));
        if (!bounded) unbounded.push(`${relativePath}:${index + 1}`);
      }
    }

    expect(unbounded).toEqual([]);
  });
});
