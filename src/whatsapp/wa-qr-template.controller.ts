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
  Logger,
} from '@nestjs/common';
import { WaQrTemplateService } from './wa-qr-template.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';
import {
  CreateQrTemplateDto,
  UpdateQrTemplateDto,
  SendQrTemplateDto,
} from './dto/qr-template.dto';
import { QrTemplateStatus } from './entities/wa-qr-template.entity';

@UseGuards(JwtAuthGuard)
@Controller('whatsapp/qr/templates')
export class WaQrTemplateController {
  private readonly logger = new Logger(WaQrTemplateController.name);

  constructor(private readonly service: WaQrTemplateService) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  /**
   * POST /whatsapp/qr/templates
   * Create a new QR template with Meta-like component structure.
   *
   * Body example:
   * {
   *   "name": "order_confirmation",
   *   "language": "en",
   *   "category": "UTILITY",
   *   "components": {
   *     "header": { "format": "TEXT", "text": "Order #{{orderId}}" },
   *     "body": "Hi {{name}}, your order has been confirmed!\nTotal: {{amount}}",
   *     "footer": "Thank you for shopping with us",
   *     "buttons": [
   *       { "type": "URL", "text": "Track Order", "url": "https://track.example.com/{{orderId}}" },
   *       { "type": "QUICK_REPLY", "text": "Cancel Order" }
   *     ]
   *   }
   * }
   */
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateQrTemplateDto) {
    this.logger.log(`[API] POST /qr/templates → userId=${user.id} name=${dto.name}`);
    const template = await this.service.create(user.id, dto);
    return successResponse('QR template created', template);
  }

  /**
   * GET /whatsapp/qr/templates
   * List all templates. Optional ?status=active|draft|archived
   */
  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: QrTemplateStatus,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
  ) {
    const result = await this.service.findAll(
      user.id,
      status,
      Number(page),
      Number(limit),
      search,
    );
    return successResponse('QR templates', result);
  }

  /**
   * GET /whatsapp/qr/templates/:id
   */
  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const template = await this.service.findOne(user.id, id);
    return successResponse('QR template', template);
  }

  /**
   * PUT /whatsapp/qr/templates/:id
   */
  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQrTemplateDto,
  ) {
    this.logger.log(`[API] PUT /qr/templates/${id} → userId=${user.id}`);
    const template = await this.service.update(user.id, id, dto);
    return successResponse('QR template updated', template);
  }

  /**
   * DELETE /whatsapp/qr/templates/:id
   */
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    this.logger.log(`[API] DELETE /qr/templates/${id} → userId=${user.id}`);
    await this.service.remove(user.id, id);
    return successResponse('QR template deleted');
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  /**
   * POST /whatsapp/qr/templates/:id/preview
   * Returns the resolved component tree with params substituted — no message sent.
   *
   * Body: { "params": { "name": "John", "orderId": "1234" } }
   */
  @Post(':id/preview')
  async preview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { params?: Record<string, string> },
  ) {
    const template = await this.service.findOne(user.id, id);
    const resolved = this.service.preview(template, body.params || {});
    return successResponse('Template preview', { template, resolved });
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  /**
   * POST /whatsapp/qr/templates/:id/send
   * Send this template via the active QR session.
   *
   * Body: { "to": "919876543210", "params": { "name": "John", "orderId": "1234" } }
   */
  @Post(':id/send')
  async send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendQrTemplateDto,
  ) {
    this.logger.log(`[API] POST /qr/templates/${id}/send → userId=${user.id} to=${dto.to}`);
    const result = await this.service.send(user.id, id, dto);
    return successResponse('Template sent via QR session', result);
  }
}
