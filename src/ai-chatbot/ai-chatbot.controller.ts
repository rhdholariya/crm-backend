import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
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
import { TestConnectionDto } from './dto/test-connection.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

@UseGuards(JwtAuthGuard)
@Controller('ai-chatbot')
export class AiChatbotController {
  constructor(private readonly aiChatbotService: AiChatbotService) {}

  // ── Chatbot Management ────────────────────────────────────────────────────

  // GET /api/ai-chatbot/chatbots - Get all chatbots
  @Get('chatbots')
  async getAllChatbots(@CurrentUser() user: AuthUser) {
    const result = await this.aiChatbotService.getAllChatbots(user.id);
    return successResponse('All chatbots fetched successfully', result);
  }

  // GET /api/ai-chatbot/chatbots/:id - Get single chatbot
  @Get('chatbots/:id')
  async getChatbot(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) chatbotId: number,
  ) {
    const result = await this.aiChatbotService.getChatbot(user.id, chatbotId);
    return successResponse('Chatbot fetched successfully', result);
  }

  // POST /api/ai-chatbot/chatbots - Create new chatbot
  @Post('chatbots')
  async createChatbot(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateAiSettingsDto,
  ) {
    const result = await this.aiChatbotService.createChatbot(user.id, dto);
    return successResponse('Chatbot created successfully', result);
  }

  // GET /api/ai-chatbot/settings - Get active chatbot settings
  @Get('settings')
  async getSettings(@CurrentUser() user: AuthUser) {
    const result = await this.aiChatbotService.getSettings(user.id);
    return successResponse('Active chatbot settings fetched successfully', result);
  }

  // PATCH /api/ai-chatbot/chatbots/:id - Update chatbot
  @Patch('chatbots/:id')
  async updateSettings(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) chatbotId: number,
    @Body() dto: UpdateAiSettingsDto,
  ) {
    const result = await this.aiChatbotService.updateSettings(user.id, chatbotId, dto);
    return successResponse('Chatbot updated successfully', result);
  }

  // PUT /api/ai-chatbot/chatbots/:id/activate - Set as active chatbot
  @Put('chatbots/:id/activate')
  async setActiveChatbot(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) chatbotId: number,
  ) {
    const result = await this.aiChatbotService.setActiveChatbot(user.id, chatbotId);
    return successResponse('Chatbot activated successfully', result);
  }

  // DELETE /api/ai-chatbot/chatbots/:id - Delete chatbot
  @Delete('chatbots/:id')
  async deleteChatbot(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) chatbotId: number,
  ) {
    await this.aiChatbotService.deleteChatbot(user.id, chatbotId);
    return successResponse('Chatbot deleted successfully');
  }

  // POST /api/ai-chatbot/settings/test - Test connection
  @Post('settings/test')
  async testConnection(
    @CurrentUser() user: AuthUser,
    @Body() dto: TestConnectionDto,
  ) {
    const result = await this.aiChatbotService.testConnection(user.id, dto);
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
