import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, RateLimit } from '../../common';
import type { JwtPayload } from '../../common';
import { CommunityService } from './community.service';
import type { Author } from './community.service';
import {
  CreateCommentDto,
  CreatePostDto,
  CreateReportDto,
  CreateStoryDto,
  ListFeedDto,
} from './dto';

@ApiTags('Community')
@Controller('community')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get('stories')
  @ApiOperation({
    summary: 'Listar stories ativos da comunidade agrupados por criador/usuario',
  })
  listStories(@CurrentUser() user: JwtPayload) {
    return this.communityService.listStories(user.sub);
  }

  @Post('stories')
  @RateLimit({
    name: 'community.story.create',
    limit: 20,
    windowSeconds: 3600,
    subject: 'ip-user',
  })
  @ApiOperation({ summary: 'Publicar um story (foto ou video)' })
  createStory(@CurrentUser() user: JwtPayload, @Body() dto: CreateStoryDto) {
    return this.communityService.createStory(user.sub, dto);
  }

  @Post('stories/:id/like')
  @RateLimit({
    name: 'community.story.like',
    limit: 120,
    windowSeconds: 3600,
    subject: 'ip-user',
  })
  @ApiOperation({ summary: 'Curtir ou descurtir um story' })
  likeStory(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.communityService.likeStory(user.sub, id);
  }

  @Post('stories/:id/view')
  @ApiOperation({ summary: 'Marcar um story como visualizado' })
  viewStory(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.communityService.viewStory(user.sub, id);
  }

  @Delete('stories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir story' })
  async deleteStory(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.communityService.deleteStory(user.sub, id);
  }

  @Get('posts')
  @ApiOperation({ summary: 'Feed de publicacoes da comunidade' })
  listFeed(@CurrentUser() user: JwtPayload, @Query() query: ListFeedDto) {
    return this.communityService.listFeed(user.sub, query.cursor, query.limit, query.feed);
  }

  @Get('friends')
  @ApiOperation({ summary: 'Listar amigos do usuario' })
  listFriends(@CurrentUser() user: JwtPayload) {
    return this.communityService.listFriends(user.sub);
  }

  @Get('friends/suggestions')
  @ApiOperation({ summary: 'Sugestoes de amigos e membros da comunidade' })
  listSuggestions(@CurrentUser() user: JwtPayload) {
    return this.communityService.listFriendSuggestions(user.sub);
  }

  @Post('friends/:friendId')
  @ApiOperation({ summary: 'Adicionar ou seguir um amigo' })
  addFriend(@CurrentUser() user: JwtPayload, @Param('friendId') friendId: string) {
    return this.communityService.addFriend(user.sub, friendId);
  }

  @Delete('friends/:friendId')
  @ApiOperation({ summary: 'Remover amigo' })
  removeFriend(@CurrentUser() user: JwtPayload, @Param('friendId') friendId: string) {
    return this.communityService.removeFriend(user.sub, friendId);
  }

  @Get('posts/:id')
  @ApiOperation({ summary: 'Detalhe de uma publicacao' })
  getPost(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.communityService.getPost(user.sub, id);
  }

  @Post('posts')
  @RateLimit({ name: 'community.post.create', limit: 10, windowSeconds: 3600, subject: 'ip-user' })
  @ApiOperation({ summary: 'Criar uma publicacao de texto' })
  createPost(@CurrentUser() user: JwtPayload, @Body() dto: CreatePostDto) {
    return this.communityService.createPost(user.sub, dto);
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir a propria publicacao (ou, se admin, moderar qualquer uma)' })
  async deletePost(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.communityService.deletePost(user.sub, id);
  }

  @Get('posts/:id/comments')
  @ApiOperation({ summary: 'Comentarios de uma publicacao' })
  listComments(@Param('id') id: string, @Query() query: ListFeedDto) {
    return this.communityService.listComments(id, query.cursor, query.limit);
  }

  @Post('posts/:id/comments')
  @RateLimit({
    name: 'community.comment.create',
    limit: 30,
    windowSeconds: 3600,
    subject: 'ip-user',
  })
  @ApiOperation({ summary: 'Comentar em uma publicacao' })
  createComment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.communityService.createComment(user.sub, id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Excluir o proprio comentario (ou, se admin, moderar qualquer um)' })
  async deleteComment(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.communityService.deleteComment(user.sub, id);
  }

  @Post('posts/:id/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ name: 'community.like', limit: 60, windowSeconds: 3600, subject: 'ip-user' })
  @ApiOperation({ summary: 'Curtir uma publicacao' })
  async like(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.communityService.like(user.sub, id);
  }

  @Delete('posts/:id/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover a curtida de uma publicacao' })
  async unlike(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.communityService.unlike(user.sub, id);
  }

  @Post('reports')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ name: 'community.report', limit: 10, windowSeconds: 3600, subject: 'ip-user' })
  @ApiOperation({ summary: 'Denunciar uma publicacao, comentario ou usuario' })
  async report(@CurrentUser() user: JwtPayload, @Body() dto: CreateReportDto) {
    await this.communityService.report(user.sub, dto);
  }
}
