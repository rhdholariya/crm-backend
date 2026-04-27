import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { LanguageService } from './language.service';
import { CreateLanguageDto } from './dto/create-language.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

@UseGuards(JwtAuthGuard)
@Controller('languages')
export class LanguageController {
  constructor(private readonly languageService: LanguageService) {}

  // POST /api/languages — admin only
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateLanguageDto) {
    const language = await this.languageService.create(user.roleId, dto);
    return successResponse('Language created successfully', language);
  }

  // GET /api/languages?page=1&limit=10 — all users
  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const result = await this.languageService.findAll(user.roleId, page, limit);
    return successResponse('Languages fetched successfully', result);
  }

  // GET /api/languages/:id — all users
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const language = await this.languageService.findOne(id);
    return successResponse('Language fetched successfully', language);
  }

  // PATCH /api/languages/:id — admin only
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLanguageDto,
  ) {
    const language = await this.languageService.update(user.roleId, id, dto);
    return successResponse('Language updated successfully', language);
  }

  // DELETE /api/languages/:id — admin only
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.languageService.remove(user.roleId, id);
    return successResponse(result.message);
  }
}
