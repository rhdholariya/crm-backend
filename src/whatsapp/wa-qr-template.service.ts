import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WaQrTemplate,
  QrTemplateStatus,
  QrHeaderFormat,
  QrButtonType,
  QrTemplateComponents,
} from './entities/wa-qr-template.entity';
import {
  CreateQrTemplateDto,
  UpdateQrTemplateDto,
  SendQrTemplateDto,
} from './dto/qr-template.dto';
import { findSession } from './whatsapp.session';
import { ContactsService } from '../contacts/contacts.service';
import { MessageMedia } from 'whatsapp-web.js';

const PROFILE_ID = 'default';

@Injectable()
export class WaQrTemplateService {
  private readonly logger = new Logger(WaQrTemplateService.name);

  constructor(
    @InjectRepository(WaQrTemplate)
    private readonly repo: Repository<WaQrTemplate>,
    private readonly contactsService: ContactsService,
  ) {}

  // ── Helpers ───────────────────────────────────────────────────────────────

  private extractParams(text: string): string[] {
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return matches.map((m) => m.replace(/\{\{|\}\}/g, ''));
  }

  private collectAllParams(components: QrTemplateComponents): string[] {
    const all: string[] = [];
    if (components.header?.text)
      all.push(...this.extractParams(components.header.text));
    all.push(...this.extractParams(components.body));
    if (components.footer) all.push(...this.extractParams(components.footer));
    if (components.buttons) {
      for (const btn of components.buttons) {
        if (btn.url) all.push(...this.extractParams(btn.url));
      }
    }
    return [...new Set(all)];
  }

  private resolveText(text: string, params: Record<string, string>): string {
    return text.replace(
      /\{\{(\w+)\}\}/g,
      (_, key) => params[key] ?? `{{${key}}}`,
    );
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(
    userId: number,
    dto: CreateQrTemplateDto,
  ): Promise<WaQrTemplate> {
    const existing = await this.repo.findOne({
      where: { userId, name: dto.name },
    });
    if (existing)
      throw new ConflictException(`Template "${dto.name}" already exists`);

    const template = this.repo.create({
      userId,
      name: dto.name,
      language: dto.language || 'en',
      category: dto.category,
      components: dto.components,
      parameters: this.collectAllParams(dto.components),
      status: QrTemplateStatus.ACTIVE,
    });

    return this.repo.save(template);
  }

  async findAll(
    userId: number,
    status?: QrTemplateStatus,
    page = 1,
    limit = 10,
    search?: string,
  ): Promise<{ data: WaQrTemplate[]; total: number; page: number; limit: number; totalPages: number }> {
    const qb = this.repo.createQueryBuilder('t')
      .where('t.userId = :userId', { userId });

    if (status) qb.andWhere('t.status = :status', { status });

    if (search) {
      qb.andWhere('t.name ILIKE :search', { search: `%${search}%` });
    }

    const [data, total] = await qb
      .orderBy('t.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(userId: number, id: number): Promise<WaQrTemplate> {
    const t = await this.repo.findOne({ where: { id, userId } });
    if (!t) throw new NotFoundException(`Template #${id} not found`);
    return t;
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateQrTemplateDto,
  ): Promise<WaQrTemplate> {
    const template = await this.findOne(userId, id);

    if (dto.name && dto.name !== template.name) {
      const conflict = await this.repo.findOne({
        where: { userId, name: dto.name },
      });
      if (conflict)
        throw new ConflictException(`Template "${dto.name}" already exists`);
    }

    if (dto.components) {
      template.parameters = this.collectAllParams(dto.components);
      template.components = dto.components;
    }

    if (dto.name) template.name = dto.name;
    if (dto.language) template.language = dto.language;
    if (dto.category) template.category = dto.category;
    if (dto.status) template.status = dto.status;

    return this.repo.save(template);
  }

  async remove(userId: number, id: number): Promise<void> {
    const template = await this.findOne(userId, id);
    await this.repo.remove(template);
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  preview(
    template: WaQrTemplate,
    params: Record<string, string> = {},
  ): QrTemplateComponents {
    const c = template.components;
    const resolved: QrTemplateComponents = {
      body: this.resolveText(c.body, params),
    };

    if (c.header) {
      resolved.header = { ...c.header };
      if (c.header.text)
        resolved.header.text = this.resolveText(c.header.text, params);
    }

    if (c.footer) resolved.footer = this.resolveText(c.footer, params);

    if (c.buttons) {
      resolved.buttons = c.buttons.map((btn) => ({
        ...btn,
        url: btn.url ? this.resolveText(btn.url, params) : undefined,
      }));
    }

    return resolved;
  }

  // ── Send via QR session ───────────────────────────────────────────────────

  async send(
    userId: number,
    templateId: number,
    dto: SendQrTemplateDto,
  ): Promise<{ success: boolean; messageIds: string[] }> {
    const template = await this.findOne(userId, templateId);

    if (template.status !== QrTemplateStatus.ACTIVE) {
      throw new BadRequestException(
        `Template "${template.name}" is not active`,
      );
    }

    const session = findSession(userId, PROFILE_ID);
    if (!session?.client) {
      throw new BadRequestException(
        'WhatsApp QR session is not connected. Please scan the QR code first.',
      );
    }

    const digits = dto.to.replace(/[^0-9]/g, '');
    const numberId = await session.client.getNumberId(digits);
    if (!numberId) {
      throw new BadRequestException(
        `Number ${digits} is not registered on WhatsApp`,
      );
    }
    const to = numberId._serialized;

    // Auto-fill contact fields if contactId provided
    let finalParams: Record<string, string> = { ...(dto.params || {}) };
    if (dto.contactId) {
      try {
        const contact = await this.contactsService.findOne(userId, dto.contactId);
        finalParams = {
          name: contact.name ?? '',
          email: contact.email ?? '',
          phoneNumber: contact.phoneNumber ?? '',
          phone: contact.phoneNumber ?? '',
          note: contact.note ?? '',
          date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          ...finalParams, // caller params override contact fields
        };
      } catch (_) {}
    }

    const resolved = this.preview(template, finalParams);
    const messageIds: string[] = [];

    // ── Build full message text ───────────────────────────────────────────────
    let bodyText = '';

    if (
      resolved.header?.format === QrHeaderFormat.TEXT &&
      resolved.header.text
    ) {
      bodyText += `*${resolved.header.text}*\n\n`;
    }

    bodyText += resolved.body;

    if (resolved.footer) {
      bodyText += `\n\n_${resolved.footer}_`;
    }

    // Buttons as plain text lines
    if (resolved.buttons?.length) {
      bodyText += '\n';
      for (const btn of resolved.buttons) {
        bodyText += '\n─────────────────────\n';
        if (btn.type === QrButtonType.URL && btn.url) {
          // Clickable: URL hidden behind button name
          bodyText += `🔗 ${btn.text}: ${btn.url}`;
        } else if (btn.type === QrButtonType.PHONE_NUMBER && btn.phoneNumber) {
          // Clickable: phone number auto-detected
          bodyText += `📞 ${btn.text}: ${btn.phoneNumber}`;
        } else if (btn.type === QrButtonType.QUICK_REPLY) {
          // Receiver taps and replies with this text
          bodyText += `↩️ ${btn.text}`;
        }
      }
    }

    // ── Send ──────────────────────────────────────────────────────────────────
    if (
      resolved.header &&
      resolved.header.format !== QrHeaderFormat.NONE &&
      resolved.header.format !== QrHeaderFormat.TEXT &&
      resolved.header.mediaUrl
    ) {
      // Media with caption
      const media = await MessageMedia.fromUrl(resolved.header.mediaUrl, {
        unsafeMime: true,
      });
      if (resolved.header.filename) media.filename = resolved.header.filename;

      const opts: any = { caption: bodyText.trim() };
      if (resolved.header.format === QrHeaderFormat.DOCUMENT)
        opts.sendMediaAsDocument = true;

      const sent = await session.client.sendMessage(to, media, opts);
      messageIds.push(sent.id._serialized);
    } else {
      // Plain text
      const sent = await session.client.sendMessage(to, bodyText.trim());
      messageIds.push(sent.id._serialized);
    }

    this.logger.log(`[QR-TEMPLATE] Sent "${template.name}" to ${to}`);
    return { success: true, messageIds };
  }

  // ── Send to contact ───────────────────────────────────────────────────────

  async sendToContact(
    userId: number,
    templateId: number,
    contactId: number,
    params: Record<string, string> = {},
  ): Promise<{
    success: boolean;
    to: string;
    contactName: string;
    messageIds: string[];
  }> {
    const contact = await this.contactsService.findOne(userId, contactId);

    if (!contact.phoneNumber) {
      throw new BadRequestException(
        `Contact "${contact.name}" has no phone number saved`,
      );
    }

    const digits = contact.phoneNumber.replace(/[^0-9]/g, '');
    if (!digits) {
      throw new BadRequestException(
        `Contact "${contact.name}" has an invalid phone number`,
      );
    }

    const session = findSession(userId, PROFILE_ID);
    if (!session?.client) {
      throw new BadRequestException(
        'WhatsApp QR session is not connected. Please scan the QR code first.',
      );
    }

    const numberId = await session.client.getNumberId(digits);
    if (!numberId) {
      throw new BadRequestException(
        `${contact.name}'s number (${contact.phoneNumber}) is not registered on WhatsApp`,
      );
    }

    // Auto-fill all contact fields — caller params override if same key
    const mergedParams: Record<string, string> = {
      name: contact.name ?? '',
      email: contact.email ?? '',
      phoneNumber: contact.phoneNumber ?? '',
      phone: contact.phoneNumber ?? '',
      note: contact.note ?? '',
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      ...params,
    };

    const result = await this.send(userId, templateId, {
      to: digits,
      params: mergedParams,
    });

    this.logger.log(
      `[QR-TEMPLATE] Sent to contact "${contact.name}" (${digits})`,
    );

    return {
      success: true,
      to: digits,
      contactName: contact.name,
      messageIds: result.messageIds,
    };
  }
}
