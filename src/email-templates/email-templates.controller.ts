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
import { EmailTemplatesService } from './email-templates.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

@UseGuards(JwtAuthGuard)
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly service: EmailTemplatesService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEmailTemplateDto,
  ) {
    const template = await this.service.create(user.id, dto);
    return successResponse('Email template created successfully', template);
  }

  @Get()
  async findAll(@CurrentUser() user: AuthUser) {
    const templates = await this.service.findAll(user.id);
    return successResponse('Email templates fetched successfully', templates);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const template = await this.service.findOne(user.id, id);
    return successResponse('Email template fetched successfully', template);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    const template = await this.service.update(user.id, id, dto);
    return successResponse('Email template updated successfully', template);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.service.remove(user.id, id);
    return successResponse(result.message);
  }

  @Post(':id/render')
  async render(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() values: Record<string, string>,
  ) {
    const rendered = await this.service.render(user.id, id, values);
    return successResponse('Template rendered successfully', rendered);
  }
}
