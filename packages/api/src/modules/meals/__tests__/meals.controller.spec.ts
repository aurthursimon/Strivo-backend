import { BadRequestException } from '@nestjs/common';
import { MealsController } from '../meals.controller';
import type { MealsService } from '../meals.service';
import type { JwtPayload } from '../../../common';

const user: JwtPayload = {
  sub: 'user-1',
  email: 'user@example.com',
  locale: 'pt-BR',
};

describe('MealsController.scan', () => {
  const mealsService = {
    findByUser: jest.fn(),
  };
  let controller: MealsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new MealsController(mealsService as unknown as MealsService);
  });

  it('valida e encaminha um intervalo alimentar de ate 31 dias', async () => {
    mealsService.findByUser.mockResolvedValueOnce([]);

    await controller.findAll(
      user,
      undefined,
      undefined,
      '2026-08-06T03:00:00.000Z',
      '2026-08-13T03:00:00.000Z',
    );

    expect(mealsService.findByUser).toHaveBeenCalledWith(
      'user-1',
      undefined,
      undefined,
      new Date('2026-08-06T03:00:00.000Z'),
      new Date('2026-08-13T03:00:00.000Z'),
    );
  });

  it('rejeita intervalo alimentar invertido ou maior que 31 dias', () => {
    expect(() =>
      controller.findAll(
        user,
        undefined,
        undefined,
        '2026-08-13T03:00:00.000Z',
        '2026-08-06T03:00:00.000Z',
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.findAll(user, undefined, undefined, '2026-08-06T03:00:00.000Z', undefined),
    ).toThrow(BadRequestException);
  });
});
