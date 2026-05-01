import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailCampaign } from '../email-campaigns/entities/email-campaign.entity';
import { WaQrCampaign } from '../whatsapp/entities/wa-qr-campaign.entity';
import { WaQrCampaignRecipient } from '../whatsapp/entities/wa-qr-campaign-recipient.entity';
import { CampaignRecipient } from '../email-campaigns/entities/campaign-recipient.entity';
import { EmailCampaignsService } from '../email-campaigns/email-campaigns.service';
import { WaQrCampaignService } from '../whatsapp/wa-qr-campaign.service';
import {
  CreateUnifiedCampaignDto,
  UpdateUnifiedCampaignDto,
  CampaignType,
} from './dto/unified-campaign.dto';
import { CreateCampaignDto } from '../email-campaigns/dto/create-campaign.dto';
import { UpdateCampaignDto } from '../email-campaigns/dto/update-campaign.dto';
import { CreateWaCampaignDto, UpdateWaCampaignDto } from '../whatsapp/dto/wa-qr-campaign.dto';

export interface UnifiedCampaign {
  id: number;
  type: 'email' | 'whatsapp';
  name: string;
  status: string;
  recipientType: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  templateId: number;
}

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(EmailCampaign)
    private readonly emailRepo: Repository<EmailCampaign>,
    @InjectRepository(WaQrCampaign)
    private readonly waRepo: Repository<WaQrCampaign>,
    @InjectRepository(WaQrCampaignRecipient)
    private readonly waRecipientRepo: Repository<WaQrCampaignRecipient>,
    @InjectRepository(CampaignRecipient)
    private readonly emailRecipientRepo: Repository<CampaignRecipient>,
    private readonly emailService: EmailCampaignsService,
    private readonly waService: WaQrCampaignService,
  ) {}

  // ── Create ──────────────────────────────────────────────────────────────────

  async create(userId: number, dto: CreateUnifiedCampaignDto) {
    if (dto.type === CampaignType.EMAIL) {
      const emailDto: CreateCampaignDto = {
        name: dto.name,
        templateId: dto.templateId,
        recipientType: dto.recipientType as any,
        selectedContactIds: dto.selectedContactIds,
        selectedTagIds: dto.selectedTagIds,
        excludeTagIds: dto.excludeTagIds,
        params: dto.params,
        scheduledAt: dto.scheduledAt,
      };
      const campaign = await this.emailService.create(userId, emailDto);
      return { type: 'email', campaign };
    }

    const waDto: CreateWaCampaignDto = {
      name: dto.name,
      templateId: dto.templateId,
      recipientType: dto.recipientType as any,
      selectedContactIds: dto.selectedContactIds,
      selectedTagIds: dto.selectedTagIds,
      excludeTagIds: dto.excludeTagIds,
      params: dto.params,
      scheduledAt: dto.scheduledAt,
    };
    const campaign = await this.waService.create(userId, waDto);
    return { type: 'whatsapp', campaign };
  }

  // ── List ────────────────────────────────────────────────────────────────────

  async findAll(
    userId: number,
    page = 1,
    limit = 10,
    type?: 'email' | 'whatsapp',
    search?: string,
  ): Promise<{
    data: UnifiedCampaign[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const emailCampaigns: UnifiedCampaign[] = [];
    const waCampaigns: UnifiedCampaign[] = [];

    if (!type || type === 'email') {
      const qb = this.emailRepo
        .createQueryBuilder('c')
        .where('c.userId = :userId', { userId });
      if (search) qb.andWhere('c.name ILIKE :search', { search: `%${search}%` });
      const rows = await qb.getMany();
      rows.forEach(c =>
        emailCampaigns.push({ ...this.mapEmail(c) }),
      );
    }

    if (!type || type === 'whatsapp') {
      const qb = this.waRepo
        .createQueryBuilder('c')
        .where('c.userId = :userId', { userId });
      if (search) qb.andWhere('c.name ILIKE :search', { search: `%${search}%` });
      const rows = await qb.getMany();
      rows.forEach(c =>
        waCampaigns.push({ ...this.mapWa(c) }),
      );
    }

    const all = [...emailCampaigns, ...waCampaigns].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = all.length;
    const totalPages = Math.ceil(total / limit);
    const data = all.slice((page - 1) * limit, page * limit);

    return { data, total, page, limit, totalPages };
  }

  // ── Find one ────────────────────────────────────────────────────────────────

  async findOne(userId: number, type: 'email' | 'whatsapp', id: number) {
    if (type === 'email') {
      const c = await this.emailRepo.findOne({ where: { id }, relations: ['template'] });
      if (!c || c.userId !== userId) throw new NotFoundException(`Email campaign #${id} not found`);
      const recipients = await this.emailRecipientRepo.find({
        where: { campaignId: id },
        order: { createdAt: 'DESC' },
      });
      return { type: 'email', campaign: c, recipients };
    }

    const c = await this.waRepo.findOne({ where: { id }, relations: ['template'] });
    if (!c || c.userId !== userId) throw new NotFoundException(`WhatsApp campaign #${id} not found`);
    const recipients = await this.waRecipientRepo.find({
      where: { campaignId: id },
      order: { createdAt: 'DESC' },
    });
    return { type: 'whatsapp', campaign: c, recipients };
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  async update(userId: number, type: 'email' | 'whatsapp', id: number, dto: UpdateUnifiedCampaignDto) {
    if (type === 'email') {
      const updateDto: UpdateCampaignDto = {
        name: dto.name,
        templateId: dto.templateId,
        recipientType: dto.recipientType as any,
        selectedContactIds: dto.selectedContactIds,
        selectedTagIds: dto.selectedTagIds,
        excludeTagIds: dto.excludeTagIds,
        params: dto.params,
        scheduledAt: dto.scheduledAt,
      };
      const campaign = await this.emailService.update(userId, id, updateDto);
      return { type: 'email', campaign };
    }

    const updateDto: UpdateWaCampaignDto = {
      name: dto.name,
      templateId: dto.templateId,
      recipientType: dto.recipientType as any,
      selectedContactIds: dto.selectedContactIds,
      selectedTagIds: dto.selectedTagIds,
      excludeTagIds: dto.excludeTagIds,
      params: dto.params,
      scheduledAt: dto.scheduledAt,
    };
    const campaign = await this.waService.update(userId, id, updateDto);
    return { type: 'whatsapp', campaign };
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async remove(userId: number, type: 'email' | 'whatsapp', id: number) {
    if (type === 'email') {
      return this.emailService.remove(userId, id);
    }
    return this.waService.remove(userId, id);
  }

  // ── Recipients ──────────────────────────────────────────────────────────────

  async getRecipients(userId: number, type: 'email' | 'whatsapp', id: number) {
    if (type === 'email') {
      return this.emailService.getRecipients(userId, id);
    }
    return this.waService.getRecipients(userId, id);
  }

  // ── Send / dispatch ─────────────────────────────────────────────────────────

  async send(userId: number, type: 'email' | 'whatsapp', id: number) {
    if (type === 'email') {
      await this.emailService.findOne(userId, id); // ownership check
      await this.emailService.dispatch(id, userId);
      return;
    }
    await this.waService.findOne(userId, id); // ownership check
    await this.waService.dispatch(id, userId);
  }

  // ── Mappers ─────────────────────────────────────────────────────────────────

  private mapEmail(c: EmailCampaign): UnifiedCampaign {
    return {
      id: c.id,
      type: 'email',
      name: c.name,
      status: c.status,
      recipientType: c.recipientType,
      totalRecipients: c.totalRecipients,
      sentCount: c.sentCount,
      failedCount: c.failedCount,
      scheduledAt: c.scheduledAt,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      templateId: c.templateId,
    };
  }

  private mapWa(c: WaQrCampaign): UnifiedCampaign {
    return {
      id: c.id,
      type: 'whatsapp',
      name: c.name,
      status: c.status,
      recipientType: c.recipientType,
      totalRecipients: c.totalRecipients,
      sentCount: c.sentCount,
      failedCount: c.failedCount,
      scheduledAt: c.scheduledAt,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      templateId: c.templateId,
    };
  }
}
