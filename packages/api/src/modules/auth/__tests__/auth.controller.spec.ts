import { AuthController } from '../auth.controller';

describe('AuthController Google callback', () => {
  it('redireciona apenas com codigo descartavel e state, nunca com tokens', async () => {
    const authService = {
      createGoogleAuthorizationCode: jest.fn().mockResolvedValue({
        code: 'one-time-code',
        state: 'client-state-123456',
      }),
    };
    const controller = new AuthController(
      authService as never,
      {
        FRONTEND_URL: 'https://app.calordiet.example',
      } as never,
    );
    const response = { redirect: jest.fn() };

    await controller.googleCallback(
      {
        user: {
          email: 'user@example.com',
          name: 'User',
          googleId: 'google-1',
        },
        query: { state: 'signed-state' },
      } as never,
      response as never,
    );

    const redirect = String(response.redirect.mock.calls[0]?.[0]);
    expect(redirect).toBe(
      'https://app.calordiet.example/auth/callback?code=one-time-code&state=client-state-123456',
    );
    expect(redirect).not.toContain('accessToken');
    expect(redirect).not.toContain('refreshToken');
    expect(redirect).not.toContain('token=');
  });
});
