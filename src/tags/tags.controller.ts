import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

@UseGuards(JwtAuthGuard)
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTagDto) {
    const tag = await this.tagsService.create(user.id, dto);
    return successResponse('Tag created successfully', tag);
  }

  @Get()
  async findAll(@CurrentUser() user: AuthUser) {
    const tags = await this.tagsService.findAll(user.id);
    return successResponse('Tags fetched successfully', tags);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const tag = await this.tagsService.findOne(user.id, id);
    return successResponse('Tag fetched successfully', tag);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTagDto,
  ) {
    const tag = await this.tagsService.update(user.id, id, dto);
    return successResponse('Tag updated successfully', tag);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.tagsService.remove(user.id, id);
    return successResponse(result.message);
  }
}
