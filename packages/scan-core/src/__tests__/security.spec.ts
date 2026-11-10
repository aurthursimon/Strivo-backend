import { operationalErrorFingerprint, redactOperationalText } from '../security';

describe('redactOperationalText', () => {
  it('never leaves image data URLs or long opaque base64 in provider errors', () => {
    const imageData = `data:image/jpeg;base64,${'A'.repeat(200)}`;
    const opaqueData = 'B'.repeat(180);

    const redacted = redactOperationalText(`request=${imageData} response=${opaqueData}`);

    expect(redacted).toContain('[ImageDataRedacted]');
    expect(redacted).toContain('[OpaqueDataRedacted]');
    expect(redacted).not.toContain('A'.repeat(32));
    expect(redacted).not.toContain('B'.repeat(32));
  });

  it('creates a stable fingerprint without exposing the sanitized error text', () => {
    const secret = `Bearer ${'s'.repeat(80)}`;
    const first = operationalErrorFingerprint(new Error(`provider failed ${secret}`));
    const second = operationalErrorFingerprint(new Error(`provider failed ${secret}`));

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{16}$/);
    expect(first).not.toContain('provider');
    expect(first).not.toContain('Bearer');
  });
});
