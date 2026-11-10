import { redactOperationalText } from './redaction';

describe('redactOperationalText', () => {
  it('remove credenciais, bearer e query sensivel sem perder o contexto seguro', () => {
    const redacted = redactOperationalText(
      'POST https://provider.example/callback?code=secret-code&token=secret-token ' +
        'Bearer jwt-secret sk-project-secret AIzaGoogleSecret',
    );

    expect(redacted).toContain('https://provider.example/callback');
    expect(redacted).toContain('Bearer [Redacted]');
    expect(redacted).toContain('[CredentialRedacted]');
    expect(redacted).not.toContain('secret-code');
    expect(redacted).not.toContain('secret-token');
    expect(redacted).not.toContain('jwt-secret');
    expect(redacted).not.toContain('sk-project-secret');
    expect(redacted).not.toContain('AIzaGoogleSecret');
  });
});
