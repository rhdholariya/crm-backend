import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import * as path from 'path';
import { ChatCustomizationService } from './chat-customization.service';
import { UpsertChatCustomizationDto } from './dto/upsert-chat-customization.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

const bgImageStorage = multer.diskStorage({
  destination: './uploads/chat-bg',
  filename: (_req, file, cb) =>
    cb(null, `bg-${Date.now()}${path.extname(file.originalname)}`),
});

const fileInterceptor = FileInterceptor('backgroundImage', { storage: bgImageStorage });

@UseGuards(JwtAuthGuard)
@Controller('chat-customization')
export class ChatCustomizationController {
  constructor(private readonly service: ChatCustomizationService) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const data = await this.service.get(user.id);
    return successResponse('Chat customization fetched', data);
  }

  @Post()
  @UseInterceptors(fileInterceptor)
  async upsert(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertChatCustomizationDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const data = await this.service.upsert(user.id, dto, file);
    return successResponse('Chat customization saved', data);
  }

  @Delete()
  async delete(@CurrentUser() user: AuthUser) {
    await this.service.delete(user.id);
    return successResponse('Chat customization deleted');
  }
}
