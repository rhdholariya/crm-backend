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
  TemplateComponents,
  HeaderFormat,
  ButtonType,
} from './entities/whatsapp-template.entity';
import {
  WhatsAppMessage,
  MessageDirection,
  MessageChannel,
} from './entities/whatsapp-message.entity';
import { UpsertConfigDto } from './dto/upsert-config.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import {
  CreateMetaTemplateDto,
  UpdateMetaTemplateDto,
} from './dto/meta-template.dto';

const META_API_VERSION = 'v23.0';
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

  async upsertConfig(
    userId: number,
    dto: UpsertConfigDto,
  ): Promise<WhatsAppConfig> {
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
    if (!config?.accessToken || !config?.phoneNumberId || !config?.wabaId) {
      throw new BadRequestException(
        'Meta WhatsApp API not configured. Please set up your credentials first.',
      );
    }
    return config;
  }

  // ── Templates ───────────────────────────────────────────────────────────────

  /** Extract {{paramName}} placeholders from text */
  private extractParams(text: string): string[] {
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '')))];
  }

  /** Collect all parameters from all component text fields */
  /** Build Meta API component payload from our component structure */
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
      parameters: params,
      type: TemplateType.REGULAR,
      status: TemplateStatus.APPROVED,
      category: dto.category,
      components: [
        {
          type: 'BODY',
          text: dto.body,
        },
      ] as any,
    });
    return this.templateRepo.save(template);
  }

  async createMetaTemplate(
    userId: number,
    dto: CreateMetaTemplateDto,
  ): Promise<WhatsAppTemplate> {
    const config = await this.requireConfig(userId);

    // Extract body text and parameters from components
    const bodyComponent = dto.components.find((c) => c.type === 'BODY');
    const bodyText = bodyComponent?.text || '';
    const params = this.extractParams(bodyText);

    // Build payload - components are already in correct format
    const payload = {
      name: dto.name.toLowerCase().replace(/\s+/g, '_'),
      language: dto.language || 'en',
      parameter_format: 'NAMED',
      category: dto.category || TemplateCategory.UTILITY,
      components: dto.components,
    };

    this.logger.log(
      `[META] Creating template "${JSON.stringify(payload)}" for userId=${userId}`,
    );

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
      throw new BadRequestException(data);
    }

    this.logger.log(
      `[META] Template created, id=${data.id} status=${data.status}`,
    );

    const template = this.templateRepo.create({
      userId,
      name: dto.name,
      body: bodyText,
      language: dto.language || 'en',
      parameters: params,
      type: TemplateType.META,
      status: this.mapMetaStatus(data.status),
      category: dto.category || TemplateCategory.UTILITY,
      components: dto.components as any,
      metaTemplateId: String(data.id),
    });

    return this.templateRepo.save(template);
  }

  async updateMetaTemplate(
    userId: number,
    id: number,
    dto: UpdateMetaTemplateDto,
  ): Promise<WhatsAppTemplate> {
    const template = await this.getTemplate(userId, id);

    if (template.type !== TemplateType.META) {
      throw new BadRequestException('Only Meta templates can be updated');
    }

    if (template.status !== TemplateStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft templates can be updated. Approved/Rejected templates must be deleted and recreated.',
      );
    }

    if (dto.category) {
      template.category = dto.category;
    }

    if (dto.components) {
      template.components = dto.components as any;
      const bodyComponent = dto.components.find((c) => c.type === 'BODY');
      if (bodyComponent?.text) {
        template.body = bodyComponent.text;
        template.parameters = this.extractParams(bodyComponent.text);
      }
    }

    return this.templateRepo.save(template);
  }

  async deleteMetaTemplate(userId: number, id: number): Promise<void> {
    const template = await this.getTemplate(userId, id);

    if (template.type !== TemplateType.META) {
      throw new BadRequestException(
        'Only Meta templates can be deleted via this endpoint',
      );
    }

    // If it's approved/pending, delete from Meta too
    if (
      template.metaTemplateId &&
      (template.status === TemplateStatus.APPROVED ||
        template.status === TemplateStatus.PENDING)
    ) {
      try {
        const config = await this.requireConfig(userId);
        await fetch(
          `${META_BASE}/${config.wabaId}/message_templates?hsm_id=${template.metaTemplateId}&name=${encodeURIComponent(
            template.name.toLowerCase().replace(/\s+/g, '_'),
          )}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${config.accessToken}` },
          },
        );
        this.logger.log(
          `[META] Deleted template from Meta: ${template.metaTemplateId}`,
        );
      } catch (err: any) {
        this.logger.warn(
          `[META] Could not delete template from Meta: ${err.message}`,
        );
      }
    }

    await this.templateRepo.remove(template);
  }

  async syncMetaTemplateStatus(
    userId: number,
    templateId: number,
  ): Promise<WhatsAppTemplate> {
    const config = await this.requireConfig(userId);
    const template = await this.getTemplate(userId, templateId);

    if (!template.metaTemplateId) {
      throw new BadRequestException('Not a Meta template');
    }

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
    if (data.rejected_reason) {
      template.rejectionReason = data.rejected_reason;
    }

    this.logger.log(
      `[META] Synced template status: ${template.name} → ${template.status}`,
    );

    return this.templateRepo.save(template);
  }

  async listTemplates(
    userId: number,
    type?: TemplateType,
    status?: TemplateStatus,
    category?: TemplateCategory,
    search?: string,
    page = 1,
    limit = 10,
  ): Promise<{
    data: WhatsAppTemplate[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const qb = this.templateRepo
      .createQueryBuilder('t')
      .where('t.userId = :userId', { userId });

    if (type) {
      qb.andWhere('t.type = :type', { type });
    }

    if (status) {
      qb.andWhere('t.status = :status', { status });
    }

    if (category) {
      qb.andWhere('t.category = :category', { category });
    }

    if (search) {
      qb.andWhere('t.name ILIKE :search', { search: `%${search}%` });
    }

    const [data, total] = await qb
      .orderBy('t.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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
          `${META_BASE}/${config.wabaId}/message_templates?hsm_id=${template.metaTemplateId}&name=${encodeURIComponent(
            template.name.toLowerCase().replace(/\s+/g, '_'),
          )}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${config.accessToken}` },
          },
        );
      } catch (err: any) {
        this.logger.warn(
          `[META] Could not delete template from Meta: ${err.message}`,
        );
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

    await this.saveMessage(
      userId,
      to,
      message,
      'text',
      result?.messages?.[0]?.id,
    );
    return result;
  }

  async sendTemplateMessage(
    userId: number,
    to: string,
    templateId: number,
    dynamicParameters?: Array<{ field: string; value: string }>,
  ): Promise<any> {
    const config = await this.requireConfig(userId);
    const template = await this.getTemplate(userId, templateId);

    if (template.type !== TemplateType.META) {
      throw new BadRequestException(
        'Only Meta templates can be sent via this endpoint',
      );
    }

    if (template.status !== TemplateStatus.APPROVED) {
      throw new BadRequestException(
        `Template "${template.name}" is not approved (status: ${template.status})`,
      );
    }

    // Convert dynamic parameters to key-value map
    const paramsMap: Record<string, string> = {};
    if (dynamicParameters && dynamicParameters.length > 0) {
      dynamicParameters.forEach((param) => {
        paramsMap[param.field] = param.value;
      });
    }

    // Resolve body with params for DB storage
    let resolvedBody = template.body;
    for (const [key, val] of Object.entries(paramsMap)) {
      resolvedBody = resolvedBody.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
        val,
      );
    }

    // Build named parameters for Meta API
    const components: any[] = [];
    const bodyParams = (template.parameters || []).map((p) => ({
      type: 'text',
      text: paramsMap[p] || `{{${p}}}`,
    }));

    if (bodyParams.length) {
      components.push({ type: 'body', parameters: bodyParams });
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: this.normalizePhone(to),
      type: 'template',
      template: {
        name: template.name.toLowerCase().replace(/\s+/g, '_'),
        language: { code: template.language || 'en' },
        components,
      },
    };

    const result = await this.callSendApi(config, payload);

    await this.saveMessage(
      userId,
      to,
      resolvedBody,
      'template',
      result?.messages?.[0]?.id,
      templateId,
    );

    return result;
  }

  private async callSendApi(
    config: WhatsAppConfig,
    payload: any,
  ): Promise<any> {
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
