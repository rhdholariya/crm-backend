import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
  Query,
  Logger,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import * as path from 'path';
import type { Response } from 'express';
import { WhatsAppService } from './whatsapp.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

interface UploadedFileType {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

const PROFILE_ID = 'default';

const mediaStorage = multer.diskStorage({
  destination: './uploads',
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${path.extname(file.originalname)}`),
});

@UseGuards(JwtAuthGuard)
@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private readonly waService: WhatsAppService) {}

  // ── Session ─────────────────────────────────────────────────────────────────

  @Post('start')
  start(@CurrentUser() user: AuthUser) {
    this.logger.log(`[API] POST /start → userId=${user.id}`);
    return successResponse('Session starting', this.waService.start(user.id, PROFILE_ID));
  }

  @Post('stop')
  async stop(@CurrentUser() user: AuthUser) {
    this.logger.log(`[API] POST /stop → userId=${user.id}`);
    await this.waService.stop(user.id, PROFILE_ID);
    return successResponse('Session stopped');
  }

  @Post('logout')
  async logout(@CurrentUser() user: AuthUser) {
    this.logger.log(`[API] POST /logout → userId=${user.id}`);
    await this.waService.logout(user.id, PROFILE_ID);
    return successResponse('Logged out');
  }

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    const result = this.waService.getStatus(user.id, PROFILE_ID);
    this.logger.log(`[API] GET /status → userId=${user.id} status=${result.status}`);
    return successResponse('Status', result);
  }

  @Get('qr')
  qr(@CurrentUser() user: AuthUser) {
    this.logger.log(`[API] GET /qr → userId=${user.id}`);
    const qr = this.waService.getQR(user.id, PROFILE_ID);
    if (!qr) throw new NotFoundException('No QR available — call /start first');
    return successResponse('QR code', { qr });
  }

  // ── Chats ───────────────────────────────────────────────────────────────────

  @Get('chats')
  chats(@CurrentUser() user: AuthUser) {
    const chats = this.waService.getChats(user.id, PROFILE_ID);
    this.logger.log(`[API] GET /chats → userId=${user.id} count=${chats.length}`);
    return successResponse('Chats', chats);
  }

  @Get('chats/:chatId/messages')
  async messages(
    @CurrentUser() user: AuthUser,
    @Param('chatId') chatId: string,
    @Query('limit') limit = 50,
  ) {
    const decoded = decodeURIComponent(chatId);
    const limitNum = Math.min(Number(limit) || 50, 1000); // cap at 1000
    this.logger.log(`[API] GET /chats/${decoded}/messages → userId=${user.id} limit=${limitNum}`);
    const messages = await this.waService.getMessages(user.id, PROFILE_ID, decoded, limitNum);
    this.logger.log(`[API] Returning ${messages.length} messages for chatId=${decoded}`);
    return successResponse('Messages', messages);
  }

  @Post('chats/:chatId/read')
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('chatId') chatId: string,
  ) {
    const decoded = decodeURIComponent(chatId);
    this.logger.log(`[API] POST /chats/${decoded}/read → userId=${user.id}`);
    await this.waService.markRead(user.id, PROFILE_ID, decoded);
    return successResponse('Marked as read');
  }

  // ── Send (unified: text + single/multiple media) ─────────────────────────────

  @Post('send')
  @UseInterceptors(FilesInterceptor('files', 10, { storage: mediaStorage }))
  async send(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: UploadedFileType[],
    @Body() body: { to: string; type?: string; message?: string; caption?: string },
  ) {
    if (!body.to) throw new BadRequestException('to is required');
    const type = body.type || 'text';
    this.logger.log(`[API] POST /send → userId=${user.id} to=${body.to} type=${type} files=${files?.length ?? 0}`);

    if (type === 'text') {
      if (!body.message) throw new BadRequestException('message is required for type=text');
      await this.waService.sendText(user.id, PROFILE_ID, body.to, body.message);
      this.logger.log(`[API] Text sent to=${body.to} body="${body.message.slice(0, 60)}"`);
    } else {
      if (!files?.length) throw new BadRequestException('at least one file is required for media types');
      for (const file of files) {
        this.logger.log(`[API] Sending ${type} to=${body.to} file=${file.originalname}`);
        await this.waService.sendMedia(user.id, PROFILE_ID, body.to, file.path, type, body.caption);
      }
    }

    return successResponse('Message sent');
  }

  // ── Contacts ────────────────────────────────────────────────────────────────

  @Get('contacts/search')
  async searchContacts(
    @CurrentUser() user: AuthUser,
    @Query('q') q = '',
  ) {
    this.logger.log(`[API] GET /contacts/search → userId=${user.id} q="${q}"`);
    const contacts = await this.waService.searchContacts(user.id, PROFILE_ID, q);
    this.logger.log(`[API] Found ${contacts.length} contacts for q="${q}"`);
    return successResponse('Contacts', contacts);
  }

  // ── Media on demand ──────────────────────────────────────────────────────────

  @Get('media/:msgId')
  async getMedia(
    @CurrentUser() user: AuthUser,
    @Param('msgId') msgId: string,
    @Res() res: Response,
  ) {
    const decoded = decodeURIComponent(msgId);
    this.logger.log(`[API] GET /media/${decoded} → userId=${user.id}`);
    const media = await this.waService.getMessageMedia(user.id, PROFILE_ID, decoded);
    if (!media) return res.status(404).json({ success: false, message: 'Media not found' });

    const buf = Buffer.from(media.data, 'base64');
    res.set('Content-Type', media.mimetype);
    res.set('Content-Length', String(buf.length));
    if (media.filename) res.set('Content-Disposition', `inline; filename="${media.filename}"`);
    res.set('Cache-Control', 'public, max-age=3600');
    return res.send(buf);
  }

  @Get('avatar/:chatId')
  async avatar(
    @CurrentUser() user: AuthUser,
    @Param('chatId') chatId: string,
    @Res() res: Response,
  ) {
    const decoded = decodeURIComponent(chatId);
    this.logger.log(`[API] GET /avatar/${decoded} → userId=${user.id}`);
    let filePath = this.waService.getAvatarPath(user.id, PROFILE_ID, decoded);

    if (!filePath) {
      this.logger.log(`[API] Avatar not cached — fetching from WhatsApp`);
      await this.waService.fetchAndCacheAvatar(user.id, PROFILE_ID, decoded);
      filePath = this.waService.getAvatarPath(user.id, PROFILE_ID, decoded);
    }

    if (!filePath) {
      this.logger.warn(`[API] No avatar found for chatId=${decoded}`);
      return res.status(404).send('No avatar');
    }
    res.set('Cache-Control', 'public, max-age=86400');
    return res.sendFile(path.resolve(filePath));
  }
}
