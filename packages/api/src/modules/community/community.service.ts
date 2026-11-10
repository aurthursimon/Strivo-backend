import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma';
import type { CreateCommentDto, CreatePostDto, CreateReportDto, CreateStoryDto } from './dto';
import { ReportTargetType } from './dto';

const DEFAULT_LIMIT = 20;

export interface Author {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface PostResponse {
  id: string;
  text: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  videoThumbnailUrl?: string | null;
  audience: string;
  location?: string | null;
  workoutMeta?: any;
  createdAt: Date;
  author: Author;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

export interface CommentResponse {
  id: string;
  text: string;
  createdAt: Date;
  author: Author;
  // null for a top-level comment, the parent's id for a reply.
  parentCommentId: string | null;
  // Always [] on a reply - replies are exactly one level deep by product
  // rule (see createComment), never nested further.
  replies: CommentResponse[];
}

export interface StoryItem {
  id: string;
  mediaUrl: string;
  mediaType: string;
  caption?: string | null;
  duration: number;
  createdAt: Date;
  expiresAt: Date;
  viewsCount: number;
  likesCount: number;
  isLiked: boolean;
  isViewed: boolean;
}

export interface StoryGroup {
  userId: string;
  name: string;
  avatarUrl: string | null;
  handle?: string | null;
  isTrainer: boolean;
  verified: boolean;
  hasUnseen: boolean;
  stories: StoryItem[];
}

const AUTHOR_SELECT = { id: true, name: true, avatarUrl: true } as const;

@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService) {}

  private async isAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    return Boolean(user?.isAdmin);
  }

  private toPostResponse(post: {
    id: string;
    text: string;
    imageUrl?: string | null;
    videoUrl?: string | null;
    videoThumbnailUrl?: string | null;
    audience: string;
    location?: string | null;
    workoutMeta?: any;
    createdAt: Date;
    user: Author;
    likes: { id: string }[];
    _count: { comments: number; likes: number };
  }): PostResponse {
    return {
      id: post.id,
      text: post.text,
      imageUrl: post.imageUrl ?? null,
      videoUrl: post.videoUrl ?? null,
      videoThumbnailUrl: post.videoThumbnailUrl ?? null,
      audience: post.audience ?? 'PUBLIC',
      location: post.location ?? null,
      workoutMeta: post.workoutMeta ?? null,
      createdAt: post.createdAt,
      author: post.user,
      likeCount: post._count.likes,
      commentCount: post._count.comments,
      likedByMe: post.likes.length > 0,
    };
  }

  async listFeed(
    userId: string,
    cursor: string | undefined,
    limit = DEFAULT_LIMIT,
    feed: 'public' | 'friends' = 'public',
  ): Promise<{ posts: PostResponse[]; nextCursor: string | null }> {
    let whereCondition: any = { deletedAt: null };

    if (feed === 'friends') {
      const friendships = await this.prisma.communityFriendship.findMany({
        where: { userId },
        select: { friendId: true },
      });
      const friendIds = friendships.map((f) => f.friendId);
      // If user has no friends yet, show empty friend feed (as seen in screenshot 2)
      whereCondition = {
        deletedAt: null,
        userId: { in: friendIds.length > 0 ? [userId, ...friendIds] : [userId] },
      };
    } else {
      whereCondition = {
        deletedAt: null,
        audience: 'PUBLIC',
      };
    }

    const posts = await this.prisma.communityPost.findMany({
      where: whereCondition,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: AUTHOR_SELECT },
        likes: { where: { userId }, select: { id: true } },
        _count: { select: { comments: true, likes: true } },
      },
    });

    const hasMore = posts.length > limit;
    const page = hasMore ? posts.slice(0, limit) : posts;

    return {
      posts: page.map((post) => this.toPostResponse(post)),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  // Dedicated single-post lookup - the feed list above is paginated, so a
  // post the client already knows the id of (e.g. opened from a push
  // notification or an older page it has since scrolled past) cannot
  // always be found by scanning an already-fetched feed page.
  async getPost(userId: string, postId: string): Promise<PostResponse> {
    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, deletedAt: null },
      include: {
        user: { select: AUTHOR_SELECT },
        likes: { where: { userId }, select: { id: true } },
        _count: { select: { comments: true, likes: true } },
      },
    });
    if (!post) throw new NotFoundException('Publicacao nao encontrada.');

    return this.toPostResponse(post);
  }

  async createPost(userId: string, dto: CreatePostDto): Promise<PostResponse> {
    const text = (dto.text ?? '').trim();
    if (!text && !dto.imageUrl && !dto.videoUrl && !dto.workoutMeta) {
      throw new BadRequestException('A publicacao deve conter texto, imagem, video ou treino.');
    }

    const post = await this.prisma.communityPost.create({
      data: {
        userId,
        text,
        imageUrl: dto.imageUrl ?? null,
        videoUrl: dto.videoUrl ?? null,
        videoThumbnailUrl: dto.videoThumbnailUrl ?? null,
        audience: dto.audience ?? 'PUBLIC',
        location: dto.location ?? null,
        workoutMeta: dto.workoutMeta ?? undefined,
      },
      include: { user: { select: AUTHOR_SELECT } },
    });

    return {
      id: post.id,
      text: post.text,
      imageUrl: post.imageUrl,
      videoUrl: post.videoUrl,
      videoThumbnailUrl: post.videoThumbnailUrl,
      audience: post.audience,
      location: post.location,
      workoutMeta: post.workoutMeta,
      createdAt: post.createdAt,
      author: post.user,
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
    };
  }

  async listFriends(userId: string): Promise<Author[]> {
    const friendships = await this.prisma.communityFriendship.findMany({
      where: { userId },
      include: { friend: { select: AUTHOR_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
    return friendships.map((f) => f.friend);
  }

  async addFriend(userId: string, friendId: string): Promise<{ success: boolean; isFriend: boolean }> {
    if (userId === friendId) {
      throw new BadRequestException('Voce nao pode adicionar a si mesmo.');
    }
    const target = await this.prisma.user.findUnique({ where: { id: friendId } });
    if (!target) throw new NotFoundException('Usuario nao encontrado.');

    await this.prisma.communityFriendship.upsert({
      where: { userId_friendId: { userId, friendId } },
      create: { userId, friendId },
      update: {},
    });
    await this.prisma.communityFriendship.upsert({
      where: { userId_friendId: { userId: friendId, friendId: userId } },
      create: { userId: friendId, friendId: userId },
      update: {},
    });
    return { success: true, isFriend: true };
  }

  async removeFriend(userId: string, friendId: string): Promise<{ success: boolean; isFriend: boolean }> {
    await this.prisma.communityFriendship.deleteMany({
      where: {
        OR: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      },
    });
    return { success: true, isFriend: false };
  }

  async listFriendSuggestions(userId: string): Promise<{
    users: (Author & { isFriend: boolean })[];
  }> {
    const users = await this.prisma.user.findMany({
      where: { id: { not: userId }, deletedAt: null },
      select: AUTHOR_SELECT,
      take: 30,
      orderBy: { createdAt: 'desc' },
    });

    const myFriendships = await this.prisma.communityFriendship.findMany({
      where: { userId },
      select: { friendId: true },
    });
    const friendSet = new Set(myFriendships.map((f) => f.friendId));

    return {
      users: users.map((u) => ({
        ...u,
        isFriend: friendSet.has(u.id),
      })),
    };
  }

  async deletePost(userId: string, postId: string): Promise<void> {
    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, deletedAt: null },
      select: { userId: true },
    });
    if (!post) throw new NotFoundException('Publicacao nao encontrada.');
    if (post.userId !== userId && !(await this.isAdmin(userId))) {
      throw new ForbiddenException({
        code: 'NOT_POST_OWNER',
        message: 'Voce so pode excluir suas proprias publicacoes.',
      });
    }

    await this.prisma.communityPost.update({
      where: { id: postId },
      data: { deletedAt: new Date() },
    });
  }

  // Only the top-level comments are paginated (by cursor/limit); every reply
  // to a top-level comment on the returned page is fetched in one extra
  // query and attached to it. Replies themselves have no further pagination
  // - fine for one level of discussion at MVP volumes, and simpler than a
  // cursor per comment thread.
  async listComments(
    postId: string,
    cursor: string | undefined,
    limit = DEFAULT_LIMIT,
  ): Promise<{ comments: CommentResponse[]; nextCursor: string | null }> {
    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Publicacao nao encontrada.');

    const topLevel = await this.prisma.communityComment.findMany({
      where: { postId, parentCommentId: null, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { user: { select: AUTHOR_SELECT } },
    });

    const hasMore = topLevel.length > limit;
    const page = hasMore ? topLevel.slice(0, limit) : topLevel;

    const replies = page.length
      ? await this.prisma.communityComment.findMany({
          where: { parentCommentId: { in: page.map((comment) => comment.id) }, deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: { user: { select: AUTHOR_SELECT } },
        })
      : [];

    const repliesByParent = new Map<string, CommentResponse[]>();
    for (const reply of replies) {
      const parentId = reply.parentCommentId as string;
      const bucket = repliesByParent.get(parentId) ?? [];
      bucket.push({
        id: reply.id,
        text: reply.text,
        createdAt: reply.createdAt,
        author: reply.user,
        parentCommentId: parentId,
        replies: [],
      });
      repliesByParent.set(parentId, bucket);
    }

    return {
      comments: page.map((comment) => ({
        id: comment.id,
        text: comment.text,
        createdAt: comment.createdAt,
        author: comment.user,
        parentCommentId: null,
        replies: repliesByParent.get(comment.id) ?? [],
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async createComment(
    userId: string,
    postId: string,
    dto: CreateCommentDto,
  ): Promise<CommentResponse> {
    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Publicacao nao encontrada.');

    if (dto.parentCommentId) {
      const parent = await this.prisma.communityComment.findFirst({
        where: { id: dto.parentCommentId, postId, deletedAt: null },
        select: { parentCommentId: true },
      });
      if (!parent) throw new NotFoundException('Comentario original nao encontrado.');
      if (parent.parentCommentId) {
        throw new BadRequestException({
          code: 'REPLY_DEPTH_EXCEEDED',
          message: 'So e possivel responder diretamente a um comentario de primeiro nivel.',
        });
      }
    }

    const comment = await this.prisma.communityComment.create({
      data: {
        postId,
        userId,
        text: dto.text,
        parentCommentId: dto.parentCommentId ?? null,
      },
      include: { user: { select: AUTHOR_SELECT } },
    });

    return {
      id: comment.id,
      text: comment.text,
      createdAt: comment.createdAt,
      author: comment.user,
      parentCommentId: comment.parentCommentId,
      replies: [],
    };
  }

  async deleteComment(userId: string, commentId: string): Promise<void> {
    const comment = await this.prisma.communityComment.findFirst({
      where: { id: commentId, deletedAt: null },
      select: { userId: true },
    });
    if (!comment) throw new NotFoundException('Comentario nao encontrado.');
    if (comment.userId !== userId && !(await this.isAdmin(userId))) {
      throw new ForbiddenException({
        code: 'NOT_COMMENT_OWNER',
        message: 'Voce so pode excluir seus proprios comentarios.',
      });
    }

    await this.prisma.communityComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
    // Replies are exactly one level deep, so this single updateMany covers
    // the whole thread under this comment - keeps other users' replies out
    // of the UI (deletedAt filters them out in listComments) without
    // hard-deleting their content.
    await this.prisma.communityComment.updateMany({
      where: { parentCommentId: commentId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async like(userId: string, postId: string): Promise<void> {
    const post = await this.prisma.communityPost.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Publicacao nao encontrada.');

    await this.prisma.communityLike.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId },
      update: {},
    });
  }

  async unlike(userId: string, postId: string): Promise<void> {
    await this.prisma.communityLike.deleteMany({ where: { postId, userId } });
  }

  async report(userId: string, dto: CreateReportDto): Promise<void> {
    const exists = await this.targetExists(dto.targetType, dto.targetId);
    if (!exists) throw new NotFoundException('Conteudo denunciado nao encontrado.');

    const alreadyReported = await this.prisma.communityReport.findUnique({
      where: {
        reporterId_targetType_targetId: {
          reporterId: userId,
          targetType: dto.targetType,
          targetId: dto.targetId,
        },
      },
      select: { id: true },
    });
    // The unique index is the hard backstop for a concurrent double-tap;
    // this pre-check just turns the common case into a clear 409 instead of
    // a raw constraint-violation error.
    if (alreadyReported) {
      throw new ConflictException({
        code: 'ALREADY_REPORTED',
        message: 'Voce ja denunciou este conteudo.',
      });
    }

    await this.prisma.communityReport.create({
      data: {
        reporterId: userId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
      },
    });
  }

  async listStories(userId: string): Promise<StoryGroup[]> {
    const now = new Date();

    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    // Expire legacy rows too, including the former seven-day demo stories.
    await this.prisma.communityStory.updateMany({
      where: { createdAt: { lte: cutoff }, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });

    const stories = await this.prisma.communityStory.findMany({
      where: {
        expiresAt: { gt: now },
        createdAt: { gt: cutoff },
        user: { deletedAt: null, email: { notIn: ['fola.trainer@mypeptides.dev', 'jason.b@mypeptides.dev', 'sarah.m@mypeptides.dev'] } },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            trainerProfile: {
              select: {
                handle: true,
                verified: true,
              },
            },
          },
        },
        views: {
          where: { userId },
          select: { id: true },
        },
        likes: {
          where: { userId },
          select: { id: true },
        },
        _count: {
          select: {
            views: true,
            likes: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const groupMap = new Map<string, StoryGroup>();

    for (const s of stories) {
      const u = s.user;
      let grp = groupMap.get(u.id);
      if (!grp) {
        grp = {
          userId: u.id,
          name: u.name || 'Athlete',
          avatarUrl: u.avatarUrl,
          handle: u.trainerProfile?.handle ?? null,
          isTrainer: Boolean(u.trainerProfile),
          verified: Boolean(u.trainerProfile?.verified),
          hasUnseen: false,
          stories: [],
        };
        groupMap.set(u.id, grp);
      }

      const isViewed = s.views.length > 0;
      if (!isViewed && u.id !== userId) {
        grp.hasUnseen = true;
      }

      grp.stories.push({
        id: s.id,
        mediaUrl: s.mediaUrl,
        mediaType: s.mediaType,
        caption: s.caption,
        duration: s.duration,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        viewsCount: s._count.views,
        likesCount: s._count.likes,
        isLiked: s.likes.length > 0,
        isViewed,
      });
    }

    const groups = Array.from(groupMap.values());
    groups.sort((a, b) => {
      if (a.userId === userId) return -1;
      if (b.userId === userId) return 1;
      if (a.hasUnseen && !b.hasUnseen) return -1;
      if (!a.hasUnseen && b.hasUnseen) return 1;
      return 0;
    });

    return groups;
  }

  async createStory(userId: string, dto: CreateStoryDto) {
    if (dto.workoutStatus && dto.mediaType !== 'VIDEO') throw new BadRequestException('A video is required for a workout status.');
    if (!dto.mediaUrl) {
      throw new BadRequestException('A midia do story e obrigatoria.');
    }

    if (dto.mediaType === 'TEXT' && !dto.caption?.trim()) {
      throw new BadRequestException('Story text is required.');
    }
    // Device file paths cannot be viewed by anyone else. Inline clips are
    // bounded below the existing 10 MB JSON request limit.
    if (dto.mediaType !== 'TEXT' && !/^(https:\/\/|data:(image|video)\/)/i.test(dto.mediaUrl)) {
      throw new BadRequestException('Upload a valid image or video.');
    }
    if (dto.mediaUrl.length > 8_000_000) throw new BadRequestException('Story media is too large.');

    const duration =
      dto.duration && dto.duration > 0
        ? dto.duration
        : dto.mediaType === 'VIDEO'
          ? 15
          : 5;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const data = {
      userId, mediaUrl: dto.mediaType === 'TEXT' ? 'text:workout' : dto.mediaUrl,
      mediaType: dto.mediaType || 'IMAGE', caption: dto.caption || null,
      duration, expiresAt, clientRequestId: dto.clientRequestId ?? null,
    };
    const include = {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            trainerProfile: {
              select: {
                handle: true,
                verified: true,
              },
            },
          },
        },
      };
    if (!dto.clientRequestId) return this.prisma.communityStory.create({ data, include });
    const where = { userId_clientRequestId: { userId, clientRequestId: dto.clientRequestId } };
    try {
      return await this.prisma.communityStory.upsert({ where, create: data, update: {}, include });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const existing = await this.prisma.communityStory.findUnique({ where, include });
      if (!existing) throw error;
      return existing;
    }
  }

  async likeStory(
    userId: string,
    storyId: string,
  ): Promise<{ isLiked: boolean; likesCount: number }> {
    const story = await this.prisma.communityStory.findFirst({
      where: { id: storyId, expiresAt: { gt: new Date() }, createdAt: { gt: new Date(Date.now() - 86400000) } },
      select: { id: true },
    });
    if (!story) throw new NotFoundException('Story nao encontrado.');

    const existing = await this.prisma.communityStoryLike.findUnique({
      where: { storyId_userId: { storyId, userId } },
    });

    if (existing) {
      await this.prisma.communityStoryLike.delete({
        where: { id: existing.id },
      });
    } else {
      await this.prisma.communityStoryLike.create({
        data: { storyId, userId },
      });
    }

    const likesCount = await this.prisma.communityStoryLike.count({
      where: { storyId },
    });

    return {
      isLiked: !existing,
      likesCount,
    };
  }

  async viewStory(userId: string, storyId: string): Promise<{ success: boolean }> {
    const story = await this.prisma.communityStory.findFirst({
      where: { id: storyId, expiresAt: { gt: new Date() }, createdAt: { gt: new Date(Date.now() - 86400000) } },
      select: { id: true },
    });
    if (!story) throw new NotFoundException('Story nao encontrado.');

    await this.prisma.communityStoryView.upsert({
      where: { storyId_userId: { storyId, userId } },
      create: { storyId, userId },
      update: { viewedAt: new Date() },
    });

    return { success: true };
  }

  async deleteStory(userId: string, storyId: string): Promise<void> {
    const story = await this.prisma.communityStory.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true },
    });
    if (!story) throw new NotFoundException('Story nao encontrado.');

    if (story.userId !== userId && !(await this.isAdmin(userId))) {
      throw new ForbiddenException('Voce so pode excluir seus proprios stories.');
    }

    await this.prisma.communityStory.delete({
      where: { id: storyId },
    });
  }

  private async targetExists(type: ReportTargetType, id: string): Promise<boolean> {
    if (type === ReportTargetType.POST) {
      return Boolean(await this.prisma.communityPost.findUnique({ where: { id } }));
    }
    if (type === ReportTargetType.COMMENT) {
      return Boolean(await this.prisma.communityComment.findUnique({ where: { id } }));
    }
    return Boolean(await this.prisma.user.findUnique({ where: { id } }));
  }
}
