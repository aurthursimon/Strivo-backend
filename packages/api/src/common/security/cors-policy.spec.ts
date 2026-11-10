import { createCorsPolicy } from './cors-policy';

describe('createCorsPolicy', () => {
  it('autoriza apenas correspondencia exata em producao', () => {
    const policy = createCorsPolicy(
      'https://app.calordiet.com,https://admin.calordiet.com',
      'production',
    );

    expect(policy.isOriginAllowed('https://app.calordiet.com')).toBe(true);
    expect(policy.isOriginAllowed('https://evil.example')).toBe(false);
    expect(policy.isOriginAllowed('https://app.calordiet.com.evil.example')).toBe(false);
    expect(policy.isOriginAllowed('null')).toBe(false);
  });

  it('falha cedo quando wildcard e configurado em producao', () => {
    expect(() => createCorsPolicy('*', 'production')).toThrow(
      'CORS_ORIGINS nao pode conter * em producao.',
    );
  });

  it('aceita localhost e rede privada somente fora de producao', () => {
    const development = createCorsPolicy('', 'development');
    const production = createCorsPolicy('', 'production');

    expect(development.isOriginAllowed('http://localhost:8081')).toBe(true);
    expect(development.isOriginAllowed('http://192.168.1.20:8081')).toBe(true);
    expect(production.isOriginAllowed('http://localhost:8081')).toBe(false);
    expect(production.isOriginAllowed('http://192.168.1.20:8081')).toBe(false);
  });

  it('aceita chamadas sem Origin sem emitir permissao para origens desconhecidas', () => {
    const policy = createCorsPolicy('https://app.calordiet.com', 'production');

    expect(policy.isOriginAllowed(undefined)).toBe(true);
    expect(policy.isOriginAllowed('https://unknown.example')).toBe(false);
  });

  it('rejeita entradas que nao sejam origens exatas', () => {
    expect(() => createCorsPolicy('https://app.calordiet.com/callback', 'production')).toThrow(
      'origens HTTP(S) exatas',
    );
  });
});
