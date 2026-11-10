import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { FoodDatabaseService } from './food-database.service';
import { SearchFoodDto } from './dto';

@ApiTags('Food Database')
@Controller('foods')
export class FoodDatabaseController {
  constructor(private readonly foodDatabaseService: FoodDatabaseService) {}

  @Get('search')
  @ApiOperation({ summary: 'Buscar alimentos por nome' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'source', required: false, enum: ['TACO', 'USDA', 'AI_GENERATED'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Resultados da busca' })
  search(@Query() query: SearchFoodDto) {
    return this.foodDatabaseService.search({
      query: query.q ?? '',
      category: query.category,
      source: query.source,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('categories')
  @ApiOperation({ summary: 'Listar categorias de alimentos' })
  @ApiResponse({ status: 200, description: 'Lista de categorias' })
  getCategories() {
    return this.foodDatabaseService.getCategories();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar alimento por ID' })
  @ApiResponse({ status: 200, description: 'Alimento encontrado' })
  findById(@Param('id') id: string) {
    return this.foodDatabaseService.findById(id);
  }
}
