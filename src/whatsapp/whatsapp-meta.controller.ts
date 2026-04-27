import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { WhatsAppMetaService } from './whatsapp-meta.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';
import { UpsertConfigDto } from './dto/upsert-config.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { SendMetaMessageDto } from './dto/send-meta-message.dto';
import { TemplateType } from './entities/whatsapp-template.entity';

@Controller('whatsapp/meta')
export class WhatsAppMetaController {
  private readonly logger = new Logger(WhatsAppMetaController.name);

  constructor(private readonly metaService: WhatsAppMetaService) {}

  // ── Config ──────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('config')
  async upsertConfig(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpsertConfigDto,
  ) {
    const config = await this.metaService.upsertConfig(user.id, dto);
    return successResponse('Meta config saved', config);
  }

  @UseGuards(JwtAuthGuard)
  @Get('config')
  async getConfig(@CurrentUser() user: AuthUser) {
    const config = await this.metaService.getConfig(user.id);
    return successResponse('Meta config', config);
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('templates')
  async listTemplates(
    @CurrentUser() user: AuthUser,
    @Query('type') type?: TemplateType,
  ) {
    const templates = await this.metaService.listTemplates(user.id, type);
    return successResponse('Templates', templates);
  }

  @UseGuards(JwtAuthGuard)
  @Get('templates/:id')
  async getTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const template = await this.metaService.getTemplate(user.id, id);
    return successResponse('Template', template);
  }

  @UseGuards(JwtAuthGuard)
  @Post('templates/regular')
  async createRegularTemplate(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTemplateDto,
  ) {
    const template = await this.metaService.createRegularTemplate(user.id, dto);
    return successResponse('Regular template created', template);
  }

  @UseGuards(JwtAuthGuard)
  @Post('templates/meta')
  async createMetaTemplate(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTemplateDto,
  ) {
    const template = await this.metaService.createMetaTemplate(user.id, dto);
    return successResponse('Meta template submitted for approval', template);
  }

  @UseGuards(JwtAuthGuard)
  @Post('templates/:id/sync-status')
  async syncTemplateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const template = await this.metaService.syncMetaTemplateStatus(user.id, id);
    return successResponse('Template status synced', template);
  }

  @UseGuards(JwtAuthGuard)
  @Put('templates/:id')
  async updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTemplateDto,
  ) {
    const template = await this.metaService.updateTemplate(user.id, id, dto);
    return successResponse('Template updated', template);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('templates/:id')
  async deleteTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.metaService.deleteTemplate(user.id, id);
    return successResponse('Template deleted');
  }

  // ── Send Messages ───────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('send')
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Body() dto: SendMetaMessageDto,
  ) {
    this.logger.log(`[API] POST /meta/send → userId=${user.id} to=${dto.to}`);
    const result = await this.metaService.sendTextMessage(
      user.id,
      dto.to,
      dto.message,
    );
    return successResponse('Message sent via Meta API', result);
  }

  @UseGuards(JwtAuthGuard)
  @Post('send/template/:templateId')
  async sendTemplateMessage(
    @CurrentUser() user: AuthUser,
    @Param('templateId', ParseIntPipe) templateId: number,
    @Body() body: { to: string; params?: Record<string, string> },
  ) {
    this.logger.log(
      `[API] POST /meta/send/template/${templateId} → userId=${user.id} to=${body.to}`,
    );
    const result = await this.metaService.sendTemplateMessage(
      user.id,
      body.to,
      templateId,
      body.params || {},
    );
    return successResponse('Template message sent', result);
  }

  // ── Messages History ────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('messages')
  async getConversations(@CurrentUser() user: AuthUser) {
    const convos = await this.metaService.getAllConversations(user.id);
    return successResponse('Conversations', convos);
  }

  @UseGuards(JwtAuthGuard)
  @Get('messages/:chatId')
  async getMessages(
    @CurrentUser() user: AuthUser,
    @Param('chatId') chatId: string,
    @Query('limit') limit = 50,
  ) {
    const decoded = decodeURIComponent(chatId);
    const messages = await this.metaService.getMessages(
      user.id,
      decoded,
      Number(limit),
    );
    return successResponse('Messages', messages);
  }

  // ── Webhook (public — no JWT) ────────────────────────────────────────────────

  @Get('webhook')
  @HttpCode(HttpStatus.OK)
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    // Meta sends a GET to verify the webhook endpoint
    if (mode === 'subscribe' && challenge) {
      this.logger.log(`[WEBHOOK] Verification request received`);
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Query('userId') userId: string,
    @Body() body: any,
  ) {
    // userId passed as query param so we know which account to attribute messages to
    if (userId) {
      await this.metaService.handleWebhook(Number(userId), body);
    }
    return 'EVENT_RECEIVED';
  }
}
