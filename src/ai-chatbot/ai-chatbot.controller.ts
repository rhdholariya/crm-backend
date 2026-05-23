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
    // Mask API key in response for security
    const masked = { ...result, apiKey: result.apiKey ? 'sk-***' + result.apiKey.slice(-4) : null };
    return successResponse('Chatbot fetched successfully', masked);
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
    // Mask API key in response for security
    const masked = { ...result, apiKey: result.apiKey ? 'sk-***' + result.apiKey.slice(-4) : null };
    return successResponse('Active chatbot settings fetched successfully', masked);
  }

  // GET /api/ai-chatbot/chatbots/:id/raw - Get raw chatbot (with API key visible)
  @Get('chatbots/:id/raw')
  async getChatbotRaw(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) chatbotId: number,
  ) {
    const result = await this.aiChatbotService.getChatbot(user.id, chatbotId);
    return successResponse('Chatbot raw data', result);
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

  // POST /api/ai-chatbot/test-ai-node - Test AI node with specific chatbot
  @Post('test-ai-node')
  async testAiNode(
    @CurrentUser() user: AuthUser,
    @Body() dto: { chatbotId: number; message: string; contactId?: string },
  ) {
    const { chatbotId, message, contactId = 'test-contact' } = dto;
    
    // Get the specific chatbot
    const settings = await this.aiChatbotService.getChatbot(user.id, chatbotId);
    
    // Validate API key format first
    if (!settings.apiKey || settings.apiKey.trim() === '') {
      return { 
        success: false, 
        message: 'AI chatbot has no API key configured',
        data: { 
          chatbotId: settings.id,
          chatbotName: settings.name,
          apiKeySet: false,
          autoReplyEnabled: settings.autoReplyEnabled 
        } 
      };
    }
    
    // Check if API key looks valid (not a placeholder)
    const apiKey = settings.apiKey.trim();
    const invalidPatterns = ['your-', 'your_', 'placeholder', 'password', 'sk-test', 'sk-xxx', 'sk-123', 'sk-abc', 'sk-xxx'];
    const hasInvalidPattern = invalidPatterns.some(p => apiKey.toLowerCase().includes(p));
    
    // Also check if it's just "password" or similar
    const isPlaceholder = ['password', 'secret', 'api-key', 'apikey', 'test', 'example', 'your-api-key'].includes(apiKey.toLowerCase());
    
    if (hasInvalidPattern || isPlaceholder) {
      return { 
        success: false, 
        message: 'AI chatbot API key appears to be a placeholder. Please update with a valid API key.',
        data: { 
          chatbotId: settings.id,
          chatbotName: settings.name,
          apiKeySet: true,
          apiKeyValid: false,
          autoReplyEnabled: settings.autoReplyEnabled,
          note: 'API key contains placeholder text. Get a valid key from your AI provider.'
        } 
      };
    }
    
    if (!settings.autoReplyEnabled) {
      return { 
        success: false, 
        message: 'AI chatbot auto-reply is disabled',
        data: { 
          chatbotId: settings.id,
          chatbotName: settings.name,
          apiKeySet: true,
          apiKeyValid: true,
          autoReplyEnabled: false 
        } 
      };
    }
    
    try {
      const { reply } = await this.aiChatbotService.autoReply(user.id, {
        message,
        contactId,
        chatbotId,
      });
      return successResponse('AI node test successful', {
        chatbotId,
        chatbotName: settings.name,
        message,
        reply,
      });
    } catch (err: any) {
      return { 
        success: false, 
        message: 'AI node test failed - API error',
        data: { 
          chatbotId: settings.id,
          chatbotName: settings.name,
          apiKeySet: true,
          apiKeyValid: true,
          autoReplyEnabled: settings.autoReplyEnabled,
          error: err.message 
        } 
      };
    }
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

  // POST /api/ai-chatbot/session/reset - Reset AI session for a contact
  @Post('session/reset')
  async resetSession(
    @CurrentUser() user: AuthUser,
    @Body() dto: { contactId: string },
  ) {
    await this.aiChatbotService.deactivateAiForContact(user.id, dto.contactId);
    return successResponse('AI session reset successfully', { contactId: dto.contactId });
  }

  // GET /api/ai-chatbot/session/:contactId - Check AI session status
  @Get('session/:contactId')
  async getSession(
    @CurrentUser() user: AuthUser,
    @Param('contactId') contactId: string,
  ) {
    const session = await this.aiChatbotService.getActiveAiSession(user.id, decodeURIComponent(contactId));
    return successResponse('Session status', {
      contactId: decodeURIComponent(contactId),
      active: session?.active ?? false,
      chatbotId: session?.chatbotId ?? null,
    });
  }
}
