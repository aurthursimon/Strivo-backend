import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LinkPasswordDto } from '../dto/link-password.dto';

const validate = (payload: Record<string, unknown>) =>
  validateSync(plainToInstance(LinkPasswordDto, payload));

describe('LinkPasswordDto', () => {
  it('accepts a well-formed payload', () => {
    expect(
      validate({ email: 'guest@example.com', name: 'Matheus', password: 'senhasegura123' }),
    ).toHaveLength(0);
  });

  it('rejects an invalid email', () => {
    expect(
      validate({ email: 'not-an-email', name: 'Matheus', password: 'senhasegura123' }),
    ).not.toHaveLength(0);
  });

  it('rejects a name shorter than 2 characters', () => {
    expect(
      validate({ email: 'guest@example.com', name: 'M', password: 'senhasegura123' }),
    ).not.toHaveLength(0);
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(
      validate({ email: 'guest@example.com', name: 'Matheus', password: 'short1' }),
    ).not.toHaveLength(0);
  });

  it('lowercases and trims the email', () => {
    const instance = plainToInstance(LinkPasswordDto, {
      email: '  Guest@Example.com  ',
      name: '  Matheus  ',
      password: 'senhasegura123',
    });
    expect(instance.email).toBe('guest@example.com');
    expect(instance.name).toBe('Matheus');
  });
});
