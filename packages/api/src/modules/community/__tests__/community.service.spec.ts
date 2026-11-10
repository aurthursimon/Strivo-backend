import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommunityService } from '../community.service';
import { PrismaService } from '../../../prisma';
import { ReportReason, ReportTargetType } from '../dto';

const AUTHOR = { id: 'author-1', name: 'Matheus', avatarUrl: 'preset:flame' };

const mockPrisma = {
  communityPost: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  communityComment: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  communityLike: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  communityReport: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

describe('CommunityService', () => {
  let service: CommunityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CommunityService(mockPrisma as unknown as PrismaService);
  });

  describe('listFeed', () => {
    it('marca likedByMe e os contadores a partir do post retornado', async () => {
      mockPrisma.communityPost.findMany.mockResolvedValue([
        {
          id: 'post-1',
          text: 'Ola comunidade',
          createdAt: new Date('2026-09-01'),
          user: AUTHOR,
          likes: [{ id: 'like-1' }],
          _count: { comments: 3, likes: 7 },
        },
      ]);

      const result = await service.listFeed('viewer-1', undefined, 20);

      expect(result.posts).toEqual([
        {
          id: 'post-1',
          text: 'Ola comunidade',
          imageUrl: null,
          videoUrl: null,
          videoThumbnailUrl: null,
          audience: 'PUBLIC',
          location: null,
          workoutMeta: null,
          createdAt: new Date('2026-09-01'),
          author: AUTHOR,
          likeCount: 7,
          commentCount: 3,
          likedByMe: true,
        },
      ]);
      expect(result.nextCursor).toBeNull();
      expect(mockPrisma.communityPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
      );
    });

    it('pagina via cursor e so informa proxima pagina quando ha mais itens', async () => {
      const rows = Array.from({ length: 3 }, (_, index) => ({
        id: `post-${index}`,
        text: 'x',
        createdAt: new Date(),
        user: AUTHOR,
        likes: [],
        _count: { comments: 0, likes: 0 },
      }));
      mockPrisma.communityPost.findMany.mockResolvedValue(rows);

      const result = await service.listFeed('viewer-1', 'cursor-x', 2);

      expect(result.posts).toHaveLength(2);
      expect(result.nextCursor).toBe('post-1');
      expect(mockPrisma.communityPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'cursor-x' }, skip: 1, take: 3 }),
      );
    });
  });

  describe('createPost', () => {
    it('cria a publicacao com contadores zerados', async () => {
      mockPrisma.communityPost.create.mockResolvedValue({
        id: 'post-1',
        text: 'Minha primeira semana foi otima',
        createdAt: new Date('2026-09-01'),
        user: AUTHOR,
      });

      const result = await service.createPost('author-1', {
        text: 'Minha primeira semana foi otima',
      });

      expect(result).toEqual({
        id: 'post-1',
        text: 'Minha primeira semana foi otima',
        createdAt: new Date('2026-09-01'),
        author: AUTHOR,
        likeCount: 0,
        commentCount: 0,
        likedByMe: false,
      });
    });
  });

  describe('deletePost', () => {
    it('permite que o autor exclua a propria publicacao', async () => {
      mockPrisma.communityPost.findFirst.mockResolvedValue({ userId: 'author-1' });
      mockPrisma.communityPost.update.mockResolvedValue({});

      await service.deletePost('author-1', 'post-1');

      expect(mockPrisma.communityPost.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('permite que um admin exclua a publicacao de outra pessoa', async () => {
      mockPrisma.communityPost.findFirst.mockResolvedValue({ userId: 'author-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: true });
      mockPrisma.communityPost.update.mockResolvedValue({});

      await service.deletePost('admin-1', 'post-1');

      expect(mockPrisma.communityPost.update).toHaveBeenCalled();
    });

    it('rejeita quando quem pede nao e autor nem admin', async () => {
      mockPrisma.communityPost.findFirst.mockResolvedValue({ userId: 'author-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: false });

      await expect(service.deletePost('stranger-1', 'post-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.communityPost.update).not.toHaveBeenCalled();
    });

    it('rejeita com 404 quando a publicacao nao existe ou ja foi excluida', async () => {
      mockPrisma.communityPost.findFirst.mockResolvedValue(null);

      await expect(service.deletePost('author-1', 'post-missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getPost', () => {
    it('retorna a publicacao com contadores e likedByMe', async () => {
      mockPrisma.communityPost.findFirst.mockResolvedValue({
        id: 'post-1',
        text: 'Ola comunidade',
        createdAt: new Date('2026-09-01'),
        user: AUTHOR,
        likes: [],
        _count: { comments: 0, likes: 2 },
      });

      const result = await service.getPost('viewer-1', 'post-1');

      expect(result).toEqual({
        id: 'post-1',
        text: 'Ola comunidade',
        imageUrl: null,
        videoUrl: null,
        videoThumbnailUrl: null,
        audience: 'PUBLIC',
        location: null,
        workoutMeta: null,
        createdAt: new Date('2026-09-01'),
        author: AUTHOR,
        likeCount: 2,
        commentCount: 0,
        likedByMe: false,
      });
    });

    it('rejeita com 404 quando a publicacao nao existe ou ja foi excluida', async () => {
      mockPrisma.communityPost.findFirst.mockResolvedValue(null);

      await expect(service.getPost('viewer-1', 'post-missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('comments', () => {
    it('rejeita listar comentarios de uma publicacao inexistente', async () => {
      mockPrisma.communityPost.findFirst.mockResolvedValue(null);

      await expect(service.listComments('post-missing', undefined, 20)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('agrupa as respostas sob o comentario de primeiro nivel correspondente', async () => {
      mockPrisma.communityPost.findFirst.mockResolvedValue({ id: 'post-1' });
      mockPrisma.communityComment.findMany
        .mockResolvedValueOnce([
          {
            id: 'comment-1',
            text: 'Primeiro comentario',
            createdAt: new Date('2026-09-02T10:00:00Z'),
            user: AUTHOR,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'reply-1',
            text: 'Uma resposta',
            createdAt: new Date('2026-09-02T11:00:00Z'),
            user: AUTHOR,
            parentCommentId: 'comment-1',
          },
        ]);

      const result = await service.listComments('post-1', undefined, 20);

      expect(result.comments).toEqual([
        {
          id: 'comment-1',
          text: 'Primeiro comentario',
          createdAt: new Date('2026-09-02T10:00:00Z'),
          author: AUTHOR,
          parentCommentId: null,
          replies: [
            {
              id: 'reply-1',
              text: 'Uma resposta',
              createdAt: new Date('2026-09-02T11:00:00Z'),
              author: AUTHOR,
              parentCommentId: 'comment-1',
              replies: [],
            },
          ],
        },
      ]);
      // Top-level is cursor-paginated; replies are fetched by parent id and
      // are not paginated themselves.
      expect(mockPrisma.communityComment.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { postId: 'post-1', parentCommentId: null, deletedAt: null } }),
      );
      expect(mockPrisma.communityComment.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { parentCommentId: { in: ['comment-1'] }, deletedAt: null },
        }),
      );
    });

    it('cria um comentario de primeiro nivel quando a publicacao existe', async () => {
      mockPrisma.communityPost.findFirst.mockResolvedValue({ id: 'post-1' });
      mockPrisma.communityComment.create.mockResolvedValue({
        id: 'comment-1',
        text: 'Boa!',
        createdAt: new Date('2026-09-02'),
        user: AUTHOR,
        parentCommentId: null,
      });

      const result = await service.createComment('author-1', 'post-1', { text: 'Boa!' });

      expect(result.id).toBe('comment-1');
      expect(result.replies).toEqual([]);
      expect(mockPrisma.communityComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { postId: 'post-1', userId: 'author-1', text: 'Boa!', parentCommentId: null },
        }),
      );
    });

    it('cria uma resposta a um comentario de primeiro nivel existente', async () => {
      mockPrisma.communityPost.findFirst.mockResolvedValue({ id: 'post-1' });
      mockPrisma.communityComment.findFirst.mockResolvedValue({ parentCommentId: null });
      mockPrisma.communityComment.create.mockResolvedValue({
        id: 'reply-1',
        text: 'Concordo!',
        createdAt: new Date('2026-09-02'),
        user: AUTHOR,
        parentCommentId: 'comment-1',
      });

      const result = await service.createComment('author-1', 'post-1', {
        text: 'Concordo!',
        parentCommentId: 'comment-1',
      });

      expect(result.parentCommentId).toBe('comment-1');
      expect(mockPrisma.communityComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { postId: 'post-1', userId: 'author-1', text: 'Concordo!', parentCommentId: 'comment-1' },
        }),
      );
    });

    it('rejeita responder a um comentario que ja e uma resposta', async () => {
      mockPrisma.communityPost.findFirst.mockResolvedValue({ id: 'post-1' });
      mockPrisma.communityComment.findFirst.mockResolvedValue({ parentCommentId: 'comment-0' });

      await expect(
        service.createComment('author-1', 'post-1', {
          text: 'Nao deveria funcionar',
          parentCommentId: 'reply-1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.communityComment.create).not.toHaveBeenCalled();
    });

    it('rejeita responder a um comentario inexistente', async () => {
      mockPrisma.communityPost.findFirst.mockResolvedValue({ id: 'post-1' });
      mockPrisma.communityComment.findFirst.mockResolvedValue(null);

      await expect(
        service.createComment('author-1', 'post-1', {
          text: 'x',
          parentCommentId: 'comment-missing',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('permite que o autor do comentario o exclua e tambem exclui suas respostas', async () => {
      mockPrisma.communityComment.findFirst.mockResolvedValue({ userId: 'author-1' });
      mockPrisma.communityComment.update.mockResolvedValue({});
      mockPrisma.communityComment.updateMany.mockResolvedValue({ count: 2 });

      await service.deleteComment('author-1', 'comment-1');

      expect(mockPrisma.communityComment.update).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockPrisma.communityComment.updateMany).toHaveBeenCalledWith({
        where: { parentCommentId: 'comment-1', deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('rejeita excluir o comentario de outra pessoa sem ser admin', async () => {
      mockPrisma.communityComment.findFirst.mockResolvedValue({ userId: 'author-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: false });

      await expect(service.deleteComment('stranger-1', 'comment-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.communityComment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('like/unlike', () => {
    it('curte via upsert, idempotente por postId+userId', async () => {
      mockPrisma.communityPost.findFirst.mockResolvedValue({ id: 'post-1' });
      mockPrisma.communityLike.upsert.mockResolvedValue({});

      await service.like('viewer-1', 'post-1');

      expect(mockPrisma.communityLike.upsert).toHaveBeenCalledWith({
        where: { postId_userId: { postId: 'post-1', userId: 'viewer-1' } },
        create: { postId: 'post-1', userId: 'viewer-1' },
        update: {},
      });
    });

    it('rejeita curtir uma publicacao inexistente ou excluida', async () => {
      mockPrisma.communityPost.findFirst.mockResolvedValue(null);

      await expect(service.like('viewer-1', 'post-missing')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.communityLike.upsert).not.toHaveBeenCalled();
    });

    it('remove a curtida sem erro mesmo que ela nao exista', async () => {
      mockPrisma.communityLike.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.unlike('viewer-1', 'post-1')).resolves.toBeUndefined();
      expect(mockPrisma.communityLike.deleteMany).toHaveBeenCalledWith({
        where: { postId: 'post-1', userId: 'viewer-1' },
      });
    });
  });

  describe('report', () => {
    it('cria a denuncia quando o alvo existe e ainda nao foi denunciado por este usuario', async () => {
      mockPrisma.communityPost.findUnique.mockResolvedValue({ id: 'post-1' });
      mockPrisma.communityReport.findUnique.mockResolvedValue(null);
      mockPrisma.communityReport.create.mockResolvedValue({});

      await service.report('reporter-1', {
        targetType: ReportTargetType.POST,
        targetId: 'post-1',
        reason: ReportReason.SPAM,
      });

      expect(mockPrisma.communityReport.create).toHaveBeenCalledWith({
        data: {
          reporterId: 'reporter-1',
          targetType: ReportTargetType.POST,
          targetId: 'post-1',
          reason: ReportReason.SPAM,
        },
      });
    });

    it('rejeita denunciar um alvo que nao existe', async () => {
      mockPrisma.communityComment.findUnique.mockResolvedValue(null);

      await expect(
        service.report('reporter-1', {
          targetType: ReportTargetType.COMMENT,
          targetId: 'comment-missing',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.communityReport.create).not.toHaveBeenCalled();
    });

    it('rejeita uma segunda denuncia do mesmo usuario para o mesmo alvo', async () => {
      mockPrisma.communityPost.findUnique.mockResolvedValue({ id: 'post-1' });
      mockPrisma.communityReport.findUnique.mockResolvedValue({ id: 'report-1' });

      await expect(
        service.report('reporter-1', {
          targetType: ReportTargetType.POST,
          targetId: 'post-1',
          reason: ReportReason.SPAM,
        }),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.communityReport.create).not.toHaveBeenCalled();
    });

    it('verifica existencia de usuario ao denunciar um perfil', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'bad-actor' });
      mockPrisma.communityReport.findUnique.mockResolvedValue(null);
      mockPrisma.communityReport.create.mockResolvedValue({});

      await service.report('reporter-1', {
        targetType: ReportTargetType.USER,
        targetId: 'bad-actor',
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'bad-actor' } });
      expect(mockPrisma.communityReport.create).toHaveBeenCalled();
    });
  });
});
