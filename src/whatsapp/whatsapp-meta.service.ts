import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppConfig } from './entities/whatsapp-config.entity';
import {
  WhatsAppTemplate,
  TemplateType,
  TemplateStatus,
  TemplateCategory,
} from './entities/whatsapp-template.entity';
import {
  WhatsAppMessage,
  MessageDirection,
  MessageChannel,
} from './entities/whatsapp-message.entity';
import { UpsertConfigDto } from './dto/upsert-config.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

const META_API_VERSION = 'v19.0';
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

@Injectable()
export class WhatsAppMetaService {
  private readonly logger = new Logger(WhatsAppMetaService.name);

  constructor(
    @InjectRepository(WhatsAppConfig)
    private readonly configRepo: Repository<WhatsAppConfig>,
    @InjectRepository(WhatsAppTemplate)
    private readonly templateRepo: Repository<WhatsAppTemplate>,
    @InjectRepository(WhatsAppMessage)
    private readonly messageRepo: Repository<WhatsAppMessage>,
  ) {}

  // ── Config ──────────────────────────────────────────────────────────────────

  async upsertConfig(userId: number, dto: UpsertConfigDto): Promise<WhatsAppConfig> {
    let config = await this.configRepo.findOne({ where: { userId } });
    if (!config) {
      config = this.configRepo.create({ userId });
    }
    Object.assign(config, dto);
    return this.configRepo.save(config);
  }

  async getConfig(userId: number): Promise<WhatsAppConfig | null> {
    return this.configRepo.findOne({ where: { userId } });
  }

  private async requireConfig(userId: number): Promise<WhatsAppConfig> {
    const config = await this.getConfig(userId);
    if (!config?.accessToken || !config?.phoneNumberId) {
      throw new BadRequestException(
        'Meta WhatsApp API not configured. Please set up your credentials first.',
      );
    }
    return config;
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  /** Extract {{paramName}} placeholders from body */
  private extractParams(body: string): string[] {
    const matches = body.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '')))];
  }

  async createRegularTemplate(
    userId: number,
    dto: CreateTemplateDto,
  ): Promise<WhatsAppTemplate> {
    const params = this.extractParams(dto.body);
    const template = this.templateRepo.create({
      userId,
      name: dto.name,
      body: dto.body,
      language: dto.language || 'en',
      headerText: dto.headerText,
      footerText: dto.footerText,
      parameters: params,
      type: TemplateType.REGULAR,
      status: TemplateStatus.APPROVED, // regular templates are immediately usable
      category: dto.category,
    });
    return this.templateRepo.save(template);
  }

  async createMetaTemplate(
    userId: number,
    dto: CreateTemplateDto,
  ): Promise<WhatsAppTemplate> {
    const config = await this.requireConfig(userId);
    const params = this.extractParams(dto.body);

    // Build Meta API payload
    const components: any[] = [];

    if (dto.headerText) {
      components.push({ type: 'HEADER', format: 'TEXT', text: dto.headerText });
    }

    // Body with numbered placeholders {{1}}, {{2}} for Meta API
    // We store named params but Meta uses positional
    let metaBody = dto.body;
    const namedParams = this.extractParams(dto.body);
    namedParams.forEach((p, i) => {
      metaBody = metaBody.replace(new RegExp(`\\{\\{${p}\\}\\}`, 'g'), `{{${i + 1}}}`);
    });

    components.push({ type: 'BODY', text: metaBody });

    if (dto.footerText) {
      components.push({ type: 'FOOTER', text: dto.footerText });
    }

    const payload = {
      name: dto.name.toLowerCase().replace(/\s+/g, '_'),
      language: dto.language || 'en',
      category: dto.category || TemplateCategory.UTILITY,
      components,
    };

    this.logger.log(`[META] Creating template "${payload.name}" for userId=${userId}`);

    const response = await fetch(
      `${META_BASE}/${config.wabaId}/message_templates`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    const data: any = await response.json();

    if (!response.ok || data.error) {
      const errMsg = data.error?.message || 'Meta API error';
      this.logger.error(`[META] Template creation failed: ${errMsg}`);
      throw new BadRequestException(`Meta API error: ${errMsg}`);
    }

    this.logger.log(`[META] Template created, id=${data.id} status=${data.status}`);

    const template = this.templateRepo.create({
      userId,
      name: dto.name,
      body: dto.body,
      language: dto.language || 'en',
      headerText: dto.headerText,
      footerText: dto.footerText,
      parameters: params,
      type: TemplateType.META,
      status: this.mapMetaStatus(data.status),
      category: dto.category || TemplateCategory.UTILITY,
      metaTemplateId: String(data.id),
    });

    return this.templateRepo.save(template);
  }

  async syncMetaTemplateStatus(userId: number, templateId: number): Promise<WhatsAppTemplate> {
    const config = await this.requireConfig(userId);
    const template = await this.templateRepo.findOne({
      where: { id: templateId, userId },
    });
    if (!template) throw new NotFoundException('Template not found');
    if (!template.metaTemplateId) throw new BadRequestException('Not a Meta template');

    const response = await fetch(
      `${META_BASE}/${template.metaTemplateId}?fields=status,rejected_reason`,
      {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      },
    );

    const data: any = await response.json();
    if (!response.ok || data.error) {
      throw new BadRequestException(`Meta API error: ${data.error?.message}`);
    }

    template.status = this.mapMetaStatus(data.status);
    if (data.rejected_reason) template.rejectionReason = data.rejected_reason;

    return this.templateRepo.save(template);
  }

  async listTemplates(userId: number, type?: TemplateType): Promise<WhatsAppTemplate[]> {
    const where: any = { userId };
    if (type) where.type = type;
    return this.templateRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getTemplate(userId: number, id: number): Promise<WhatsAppTemplate> {
    const t = await this.templateRepo.findOne({ where: { id, userId } });
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  async updateTemplate(
    userId: number,
    id: number,
    dto: UpdateTemplateDto,
  ): Promise<WhatsAppTemplate> {
    const template = await this.getTemplate(userId, id);
    if (dto.body) {
      template.parameters = this.extractParams(dto.body);
    }
    Object.assign(template, dto);
    return this.templateRepo.save(template);
  }

  async deleteTemplate(userId: number, id: number): Promise<void> {
    const template = await this.getTemplate(userId, id);

    // If it's a Meta template, delete from Meta too
    if (template.type === TemplateType.META && template.metaTemplateId) {
      try {
        const config = await this.requireConfig(userId);
        await fetch(
          `${META_BASE}/${config.wabaId}/message_templates?hsm_id=${template.metaTemplateId}&name=${encodeURIComponent(template.name.toLowerCase().replace(/\s+/g, '_'))}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${config.accessToken}` },
          },
        );
      } catch (err: any) {
        this.logger.warn(`[META] Could not delete template from Meta: ${err.message}`);
      }
    }

    await this.templateRepo.remove(template);
  }

  // ── Send via Meta Cloud API ─────────────────────────────────────────────────

  async sendTextMessage(
    userId: number,
    to: string,
    message: string,
  ): Promise<any> {
    const config = await this.requireConfig(userId);

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.normalizePhone(to),
      type: 'text',
      text: { preview_url: false, body: message },
    };

    const result = await this.callSendApi(config, payload);

    await this.saveMessage(userId, to, message, 'text', result?.messages?.[0]?.id);
    return result;
  }

  async sendTemplateMessage(
    userId: number,
    to: string,
    templateId: number,
    params: Record<string, string> = {},
  ): Promise<any> {
    const config = await this.requireConfig(userId);
    const template = await this.getTemplate(userId, templateId);

    if (template.type === TemplateType.META && template.status !== TemplateStatus.APPROVED) {
      throw new BadRequestException(
        `Template "${template.name}" is not approved (status: ${template.status})`,
      );
    }

    // Resolve body with params for DB storage
    let resolvedBody = template.body;
    for (const [key, val] of Object.entries(params)) {
      resolvedBody = resolvedBody.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    }

    let payload: any;

    if (template.type === TemplateType.META) {
      // Build positional components for Meta API
      const components: any[] = [];
      const bodyParams = (template.parameters || []).map((p) => ({
        type: 'text',
        text: params[p] || `{{${p}}}`,
      }));
      if (bodyParams.length) {
        components.push({ type: 'body', parameters: bodyParams });
      }

      payload = {
        messaging_product: 'whatsapp',
        to: this.normalizePhone(to),
        type: 'template',
        template: {
          name: template.name.toLowerCase().replace(/\s+/g, '_'),
          language: { code: template.language || 'en' },
          components,
        },
      };
    } else {
      // Regular template — just send as plain text
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: this.normalizePhone(to),
        type: 'text',
        text: { preview_url: false, body: resolvedBody },
      };
    }

    const result = await this.callSendApi(config, payload);

    await this.saveMessage(
      userId,
      to,
      resolvedBody,
      template.type === TemplateType.META ? 'template' : 'text',
      result?.messages?.[0]?.id,
      templateId,
    );

    return result;
  }

  private async callSendApi(config: WhatsAppConfig, payload: any): Promise<any> {
    this.logger.log(`[META] Sending message to ${payload.to}`);

    const response = await fetch(
      `${META_BASE}/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    const data: any = await response.json();
    if (!response.ok || data.error) {
      const errMsg = data.error?.message || 'Meta send failed';
      this.logger.error(`[META] Send failed: ${errMsg}`);
      throw new BadRequestException(`Meta API error: ${errMsg}`);
    }

    return data;
  }

  // ── Messages DB ─────────────────────────────────────────────────────────────

  private async saveMessage(
    userId: number,
    to: string,
    body: string,
    messageType: string,
    externalId?: string,
    templateId?: number,
  ): Promise<WhatsAppMessage> {
    const msg = this.messageRepo.create({
      userId,
      chatId: to,
      body,
      messageType,
      direction: MessageDirection.OUTBOUND,
      channel: MessageChannel.META,
      externalMessageId: externalId,
      templateId,
      timestamp: Math.floor(Date.now() / 1000),
    });
    return this.messageRepo.save(msg);
  }

  async saveInboundMessage(
    userId: number,
    from: string,
    body: string,
    messageType: string,
    externalId: string,
    channel: MessageChannel = MessageChannel.META,
  ): Promise<WhatsAppMessage> {
    const msg = this.messageRepo.create({
      userId,
      chatId: from,
      body,
      messageType,
      direction: MessageDirection.INBOUND,
      channel,
      externalMessageId: externalId,
      timestamp: Math.floor(Date.now() / 1000),
    });
    return this.messageRepo.save(msg);
  }

  async getMessages(
    userId: number,
    chatId: string,
    limit = 50,
  ): Promise<WhatsAppMessage[]> {
    return this.messageRepo.find({
      where: { userId, chatId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getAllConversations(userId: number): Promise<any[]> {
    return this.messageRepo
      .createQueryBuilder('m')
      .select('m.chatId', 'chatId')
      .addSelect('MAX(m.createdAt)', 'lastMessageAt')
      .addSelect('COUNT(*)', 'total')
      .where('m.userId = :userId', { userId })
      .groupBy('m.chatId')
      .orderBy('lastMessageAt', 'DESC')
      .getRawMany();
  }

  // ── Webhook ─────────────────────────────────────────────────────────────────

  async handleWebhook(userId: number, body: any): Promise<void> {
    try {
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value?.messages?.length) return;

      for (const msg of value.messages) {
        const from = msg.from;
        const text = msg.text?.body || msg.template?.name || '';
        const type = msg.type || 'text';
        const externalId = msg.id;

        this.logger.log(`[WEBHOOK] Inbound from=${from} type=${type}`);
        await this.saveInboundMessage(userId, from, text, type, externalId);
      }
    } catch (err: any) {
      this.logger.error(`[WEBHOOK] Processing error: ${err.message}`);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private normalizePhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '');
  }

  private mapMetaStatus(metaStatus: string): TemplateStatus {
    switch (metaStatus?.toUpperCase()) {
      case 'APPROVED':
        return TemplateStatus.APPROVED;
      case 'REJECTED':
        return TemplateStatus.REJECTED;
      case 'PENDING':
      case 'IN_APPEAL':
      case 'PENDING_DELETION':
        return TemplateStatus.PENDING;
      default:
        return TemplateStatus.PENDING;
    }
  }
}
