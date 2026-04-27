import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailCampaign } from '../email-campaigns/entities/email-campaign.entity';
import { WaQrCampaign } from '../whatsapp/entities/wa-qr-campaign.entity';
import { WaQrCampaignRecipient } from '../whatsapp/entities/wa-qr-campaign-recipient.entity';
import { CampaignRecipient } from '../email-campaigns/entities/campaign-recipient.entity';

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
  /** templateId for reference */
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
  ) {}

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

    // ── Fetch email campaigns ─────────────────────────────────────────────────
    if (!type || type === 'email') {
      const qb = this.emailRepo
        .createQueryBuilder('c')
        .where('c.userId = :userId', { userId });

      if (search) qb.andWhere('c.name ILIKE :search', { search: `%${search}%` });

      const rows = await qb.getMany();
      rows.forEach(c =>
        emailCampaigns.push({
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
        }),
      );
    }

    // ── Fetch whatsapp QR campaigns ───────────────────────────────────────────
    if (!type || type === 'whatsapp') {
      const qb = this.waRepo
        .createQueryBuilder('c')
        .where('c.userId = :userId', { userId });

      if (search) qb.andWhere('c.name ILIKE :search', { search: `%${search}%` });

      const rows = await qb.getMany();
      rows.forEach(c =>
        waCampaigns.push({
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
        }),
      );
    }

    // ── Merge + sort by createdAt DESC ────────────────────────────────────────
    const all = [...emailCampaigns, ...waCampaigns].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = all.length;
    const totalPages = Math.ceil(total / limit);
    const data = all.slice((page - 1) * limit, page * limit);

    return { data, total, page, limit, totalPages };
  }

  async findOne(userId: number, type: 'email' | 'whatsapp', id: number) {
    if (type === 'email') {
      const c = await this.emailRepo.findOne({ where: { id }, relations: ['template'] });
      if (!c || c.userId !== userId) throw new NotFoundException(`Email campaign #${id} not found`);
      const recipients = await this.emailRecipientRepo.find({ where: { campaignId: id }, order: { createdAt: 'DESC' } });
      return { type: 'email', campaign: c, recipients };
    }

    const c = await this.waRepo.findOne({ where: { id }, relations: ['template'] });
    if (!c || c.userId !== userId) throw new NotFoundException(`WhatsApp campaign #${id} not found`);
    const recipients = await this.waRecipientRepo.find({ where: { campaignId: id }, order: { createdAt: 'DESC' } });
    return { type: 'whatsapp', campaign: c, recipients };
  }
}
