import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ChatCustomizationService } from './chat-customization.service';
import { UpsertChatCustomizationDto } from './dto/upsert-chat-customization.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

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
  async upsert(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertChatCustomizationDto,
  ) {
    const data = await this.service.upsert(user.id, dto);
    return successResponse('Chat customization saved', data);
  }

  @Delete()
  async delete(@CurrentUser() user: AuthUser) {
    await this.service.delete(user.id);
    return successResponse('Chat customization deleted');
  }
}
