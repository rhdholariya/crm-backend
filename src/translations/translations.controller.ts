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
} from '@nestjs/common';
import { TranslationsService } from './translations.service';
import { CreateTranslationDto } from './dto/create-translation.dto';
import { UpdateTranslationDto } from './dto/update-translation.dto';
import { BulkCreateTranslationDto } from './dto/bulk-create-translation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

@Controller('translations')
export class TranslationsController {
  constructor(private readonly translationsService: TranslationsService) {}

  // POST /api/translations — create single entry (admin only)
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTranslationDto) {
    const result = await this.translationsService.create(user.roleId, dto);
    return successResponse('Translation created successfully', result);
  }

  // POST /api/translations/bulk — upsert many keywords for a language (admin only)
  @UseGuards(JwtAuthGuard)
  @Post('bulk')
  async bulkUpsert(@CurrentUser() user: AuthUser, @Body() dto: BulkCreateTranslationDto) {
    const result = await this.translationsService.bulkUpsert(user.roleId, dto);
    return successResponse('Translations upserted successfully', result);
  }

  // GET /api/translations/:languageCode?format=map — flat { keyword: value } map (default)
  // GET /api/translations/:languageCode?format=list — array of { id, keyword, value } for edit UI
  @Get(':languageCode')
  async findByLanguage(
    @Param('languageCode') languageCode: string,
    @Query('format') format?: string,
  ) {
    if (format === 'list') {
      const result = await this.translationsService.findListByLanguage(languageCode);
      return successResponse('Translations fetched successfully', result);
    }
    const result = await this.translationsService.findByLanguage(languageCode);
    return successResponse('Translations fetched successfully', result);
  }

  // GET /api/translations/:languageCode/:keyword — get single translation
  @Get(':languageCode/:keyword')
  async findOne(
    @Param('languageCode') languageCode: string,
    @Param('keyword') keyword: string,
  ) {
    const result = await this.translationsService.findOne(keyword, languageCode);
    return successResponse('Translation fetched successfully', result);
  }

  // PATCH /api/translations/:id — update value (admin only)
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTranslationDto,
  ) {
    const result = await this.translationsService.update(user.roleId, id, dto);
    return successResponse('Translation updated successfully', result);
  }

  // DELETE /api/translations/:id — delete (admin only)
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.translationsService.remove(user.roleId, id);
    return successResponse(result.message);
  }
}
