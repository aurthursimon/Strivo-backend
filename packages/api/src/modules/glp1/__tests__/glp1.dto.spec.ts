import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetupGlp1Dto } from '../dto';

describe('SetupGlp1Dto', () => {
  it('rejeita setup sem consentimento e tratamento', async () => {
    const errors = await validate(plainToInstance(SetupGlp1Dto, {}));
    expect(errors.map((error) => error.property).sort()).toEqual(['consent', 'treatment']);
  });
});
