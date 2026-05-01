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
import { AiChatbotService } from './ai-chatbot.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { ChatRequestDto, SuggestReplyDto } from './dto/chat-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

@UseGuards(JwtAuthGuard)
@Controller('ai-chatbot')
export class AiChatbotController {
  constructor(private readonly aiChatbotService: AiChatbotService) {}

  // ── Settings ──────────────────────────────────────────────────────────────

  // GET /api/ai-chatbot/settings
  @Get('settings')
  async getSettings(@CurrentUser() user: AuthUser) {
    const result = await this.aiChatbotService.getSettings(user.id);
    return successResponse('AI settings fetched successfully', result);
  }

  // PATCH /api/ai-chatbot/settings
  @Patch('settings')
  async updateSettings(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateAiSettingsDto,
  ) {
    const result = await this.aiChatbotService.updateSettings(user.id, dto);
    return successResponse('AI settings updated successfully', result);
  }

  // POST /api/ai-chatbot/settings/test
  @Post('settings/test')
  async testConnection(@CurrentUser() user: AuthUser) {
    const result = await this.aiChatbotService.testConnection(user.id);
    return successResponse('Connection successful', result);
  }

  // ── Core AI Features ──────────────────────────────────────────────────────

  // POST /api/ai-chatbot/auto-reply
  @Post('auto-reply')
  async autoReply(@CurrentUser() user: AuthUser, @Body() dto: ChatRequestDto) {
    const result = await this.aiChatbotService.autoReply(user.id, dto);
    return successResponse('Reply generated successfully', result);
  }

  // POST /api/ai-chatbot/understand
  @Post('understand')
  async understandMessage(
    @CurrentUser() user: AuthUser,
    @Body('message') message: string,
  ) {
    const result = await this.aiChatbotService.understandMessage(user.id, message);
    return successResponse('Message analyzed successfully', result);
  }

  // POST /api/ai-chatbot/suggest-replies
  @Post('suggest-replies')
  async suggestReplies(
    @CurrentUser() user: AuthUser,
    @Body() dto: SuggestReplyDto,
  ) {
    const result = await this.aiChatbotService.suggestReplies(user.id, dto);
    return successResponse('Reply suggestions generated', result);
  }

  // ── Conversations ─────────────────────────────────────────────────────────

  // GET /api/ai-chatbot/conversations
  @Get('conversations')
  async getConversations(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const result = await this.aiChatbotService.getConversations(user.id, page, limit);
    return successResponse('Conversations fetched successfully', result);
  }

  // GET /api/ai-chatbot/conversations/:id/messages
  @Get('conversations/:id/messages')
  async getConversationMessages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.aiChatbotService.getConversationMessages(user.id, id);
    return successResponse('Messages fetched successfully', result);
  }

  // DELETE /api/ai-chatbot/conversations/:id
  @Delete('conversations/:id')
  async clearConversation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.aiChatbotService.clearConversation(user.id, id);
    return successResponse(result.message);
  }
}
