import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AppleMobileDto } from '../dto/apple-mobile.dto';

const validate = (payload: Record<string, unknown>) =>
  validateSync(plainToInstance(AppleMobileDto, payload));

describe('AppleMobileDto', () => {
  it('requires the nonce sent in the Apple authentication request', () => {
    expect(
      validate({
        identityToken: 'identity-token',
        nonce: 'request-nonce-1234',
        authorizationCode: 'authorization-code',
      }),
    ).toHaveLength(0);
    expect(validate({ identityToken: 'identity-token' })).toHaveLength(1);
    expect(validate({ identityToken: 'identity-token', nonce: 'short' })).toHaveLength(1);
  });
});
