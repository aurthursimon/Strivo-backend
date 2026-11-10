import { SuggestionsService } from '../suggestions.service';
import { PrismaService } from '../../../prisma';
import { EmailService } from '../../auth';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  suggestion: {
    create: jest.fn().mockResolvedValue(undefined),
  },
};

const mockEmailService = {
  send: jest.fn().mockResolvedValue(undefined),
};

describe('SuggestionsService', () => {
  let service: SuggestionsService;
  let env: { SUPPORT_EMAIL?: string };

  beforeEach(() => {
    jest.clearAllMocks();
    env = { SUPPORT_EMAIL: 'suporte@mypeptides.app' };
    service = new SuggestionsService(
      mockPrisma as unknown as PrismaService,
      mockEmailService as unknown as EmailService,
      env as never,
    );
  });

  it('salva a sugestao mesmo quando SUPPORT_EMAIL nao esta configurado', async () => {
    env.SUPPORT_EMAIL = undefined;
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'a@b.com', name: 'A' });

    await service.create('user-1', { message: 'Seria bom reordenar os suplementos' });

    expect(mockPrisma.suggestion.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', message: 'Seria bom reordenar os suplementos' },
    });
    expect(mockEmailService.send).not.toHaveBeenCalled();
  });

  it('persiste primeiro e so entao notifica por e-mail, com reply-to do usuario', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'usuario@email.com',
      name: 'Matheus',
    });

    await service.create('user-1', { message: 'Adicionar grafico semanal de peso' });

    expect(mockPrisma.suggestion.create).toHaveBeenCalled();
    expect(mockEmailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'suporte@mypeptides.app',
        subject: '[My Peptides] Nova sugestao',
        replyTo: 'usuario@email.com',
      }),
    );
    const html = mockEmailService.send.mock.calls[0][0].html as string;
    expect(html).toContain('Matheus');
    expect(html).toContain('Adicionar grafico semanal de peso');
  });

  it('escapa HTML na mensagem do usuario antes de enviar', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ email: 'a@b.com', name: 'A' });

    await service.create('user-1', {
      message: '<script>alert(1)</script> essa parte do app poderia melhorar',
    });

    const html = mockEmailService.send.mock.calls[0][0].html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
