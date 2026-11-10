import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, RateLimit } from '../../common';
import type { JwtPayload } from '../../common';
import { SuggestionsService } from './suggestions.service';
import { CreateSuggestionDto } from './dto';

@ApiTags('Suggestions')
@Controller('suggestions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SuggestionsController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  @Post()
  @RateLimit({ name: 'suggestions.create', limit: 10, windowSeconds: 3600, subject: 'ip-user' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Enviar uma sugestao' })
  @ApiResponse({ status: 204, description: 'Sugestao recebida' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateSuggestionDto) {
    await this.suggestionsService.create(user.sub, dto);
  }
}
