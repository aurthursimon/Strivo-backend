import { ServiceUnavailableException } from '@nestjs/common';
import { SupportService } from '../support.service';
import { PrismaService } from '../../../prisma';
import { EmailService } from '../../auth';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

const mockEmailService = {
  isConfigured: jest.fn(),
  send: jest.fn().mockResolvedValue(undefined),
};

describe('SupportService', () => {
  let service: SupportService;
  let env: { SUPPORT_EMAIL?: string };

  beforeEach(() => {
    jest.clearAllMocks();
    env = { SUPPORT_EMAIL: 'suporte@mypeptides.app' };
    mockEmailService.isConfigured.mockReturnValue(true);
    service = new SupportService(
      mockPrisma as unknown as PrismaService,
      mockEmailService as unknown as EmailService,
      env as never,
    );
  });

  it('rejeita com 503 quando SUPPORT_EMAIL nao esta configurado', async () => {
    env.SUPPORT_EMAIL = undefined;

    await expect(
      service.contact('user-1', { message: 'Preciso de ajuda com o app, por favor' }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(mockEmailService.send).not.toHaveBeenCalled();
  });

  it('rejeita com 503 quando o EmailService (Resend) nao esta configurado', async () => {
    mockEmailService.isConfigured.mockReturnValue(false);

    await expect(
      service.contact('user-1', { message: 'Preciso de ajuda com o app, por favor' }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('envia a mensagem para SUPPORT_EMAIL com reply-to do usuario', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'usuario@email.com',
      name: 'Matheus',
    });

    await service.contact('user-1', {
      subject: 'Duvida sobre dose',
      message: 'Nao consigo registrar minha dose de hoje.',
    });

    expect(mockEmailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'suporte@mypeptides.app',
        subject: '[My Peptides] Duvida sobre dose',
        replyTo: 'usuario@email.com',
      }),
    );
    const html = mockEmailService.send.mock.calls[0][0].html as string;
    expect(html).toContain('Matheus');
    expect(html).toContain('Nao consigo registrar minha dose de hoje.');
  });

  it('escapa HTML na mensagem do usuario antes de enviar', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'a@b.com', name: 'A' });

    await service.contact('user-1', {
      message: '<script>alert(1)</script> isso quebrou o app pra mim',
    });

    const html = mockEmailService.send.mock.calls[0][0].html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('usa um assunto padrao quando nenhum e informado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'a@b.com', name: 'A' });

    await service.contact('user-1', { message: 'Mensagem sem assunto definido' });

    expect(mockEmailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('Nova mensagem de suporte') }),
    );
  });
});
