import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaQrCampaign, WaCampaignStatus, WaRecipientType } from './entities/wa-qr-campaign.entity';
import { WaQrCampaignRecipient, WaRecipientStatus } from './entities/wa-qr-campaign-recipient.entity';
import { WaQrTemplate } from './entities/wa-qr-template.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { CreateWaCampaignDto, UpdateWaCampaignDto } from './dto/wa-qr-campaign.dto';
import { WaQrTemplateService } from './wa-qr-template.service';
import { findSession } from './whatsapp.session';

const PROFILE_ID = 'default';

@Injectable()
export class WaQrCampaignService {
  private readonly logger = new Logger(WaQrCampaignService.name);

  constructor(
    @InjectRepository(WaQrCampaign)
    private readonly campaignRepo: Repository<WaQrCampaign>,
    @InjectRepository(WaQrCampaignRecipient)
    private readonly recipientRepo: Repository<WaQrCampaignRecipient>,
    @InjectRepository(WaQrTemplate)
    private readonly templateRepo: Repository<WaQrTemplate>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    private readonly templateService: WaQrTemplateService,
  ) {}

  // ── Resolve contacts ────────────────────────────────────────────────────────

  private async resolveContacts(
    userId: number,
    recipientType: WaRecipientType,
    selectedContactIds?: number[],
    selectedTagIds?: number[],
  ): Promise<Contact[]> {
    const qb = this.contactRepo
      .createQueryBuilder('contact')
      .leftJoinAndSelect('contact.tags', 'tag')
      .where('contact.userId = :userId', { userId })
      .andWhere('contact.phoneNumber IS NOT NULL')
      .andWhere("contact.phoneNumber != ''");

    if (recipientType === WaRecipientType.SELECTED) {
      if (!selectedContactIds?.length)
        throw new BadRequestException('selectedContactIds required for SELECTED type');
      qb.andWhere('contact.id IN (:...ids)', { ids: selectedContactIds });
    } else if (recipientType === WaRecipientType.BY_TAGS) {
      if (!selectedTagIds?.length)
        throw new BadRequestException('selectedTagIds required for BY_TAGS type');
      qb.leftJoin('contact.tags', 'filterTag').andWhere(
        'filterTag.id IN (:...tagIds)', { tagIds: selectedTagIds },
      );
    }

    return qb.distinct(true).getMany();
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async create(userId: number, dto: CreateWaCampaignDto): Promise<WaQrCampaign> {
    const template = await this.templateRepo.findOne({ where: { id: dto.templateId, userId } });
    if (!template) throw new NotFoundException('WA QR template not found');

    const isScheduled = !!dto.scheduledAt;

    const campaign = await this.campaignRepo.save(
      this.campaignRepo.create({
        userId,
        name: dto.name,
        templateId: dto.templateId,
        recipientType: dto.recipientType,
        selectedContactIds: dto.selectedContactIds ?? [],
        selectedTagIds: dto.selectedTagIds ?? [],
        params: dto.params ?? null,
        scheduledAt: isScheduled ? new Date(dto.scheduledAt!) : null,
        status: isScheduled ? WaCampaignStatus.SCHEDULED : WaCampaignStatus.DRAFT,
      }),
    );

    // Send immediately if not scheduled
    if (!isScheduled) {
      await this.dispatch(campaign.id, userId);
    }

    return this.campaignRepo.findOne({ where: { id: campaign.id } }) as Promise<WaQrCampaign>;
  }

  findAll(userId: number): Promise<WaQrCampaign[]> {
    return this.campaignRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: number, id: number): Promise<WaQrCampaign> {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException(`Campaign #${id} not found`);
    if (campaign.userId !== userId) throw new ForbiddenException();
    return campaign;
  }

  async update(userId: number, id: number, dto: UpdateWaCampaignDto): Promise<WaQrCampaign> {
    const campaign = await this.findOne(userId, id);
    if (
      campaign.status !== WaCampaignStatus.DRAFT &&
      campaign.status !== WaCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException('Only draft or scheduled campaigns can be updated');
    }
    Object.assign(campaign, {
      ...dto,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : campaign.scheduledAt,
      status: dto.scheduledAt ? WaCampaignStatus.SCHEDULED : campaign.status,
    });
    return this.campaignRepo.save(campaign);
  }

  async remove(userId: number, id: number): Promise<{ message: string }> {
    const campaign = await this.findOne(userId, id);
    await this.recipientRepo.delete({ campaignId: id });
    await this.campaignRepo.remove(campaign);
    return { message: 'Campaign deleted successfully' };
  }

  async getRecipients(userId: number, campaignId: number): Promise<WaQrCampaignRecipient[]> {
    await this.findOne(userId, campaignId);
    return this.recipientRepo.find({
      where: { campaignId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Dispatch ────────────────────────────────────────────────────────────────

  async dispatch(campaignId: number, userId: number): Promise<void> {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
      relations: ['template'],
    });
    if (!campaign) return;

    // Must have active QR session
    const session = findSession(userId, PROFILE_ID);
    if (!session?.client) {
      await this.campaignRepo.update(campaignId, { status: WaCampaignStatus.FAILED });
      throw new BadRequestException('WhatsApp QR session is not connected. Please scan the QR code first.');
    }

    const contacts = await this.resolveContacts(
      userId,
      campaign.recipientType,
      campaign.selectedContactIds?.filter(Boolean).map(Number),
      campaign.selectedTagIds?.filter(Boolean).map(Number),
    );

    if (!contacts.length) {
      await this.campaignRepo.update(campaignId, {
        status: WaCampaignStatus.COMPLETED,
        totalRecipients: 0,
        completedAt: new Date(),
      });
      return;
    }

    // Create recipient rows
    const recipients = contacts.map(c =>
      this.recipientRepo.create({
        campaignId: campaign.id,
        contactId: c.id,
        phone: c.phoneNumber!,
        name: c.name,
        status: WaRecipientStatus.PENDING,
      }),
    );
    await this.recipientRepo.save(recipients);

    await this.campaignRepo.update(campaignId, {
      status: WaCampaignStatus.SENDING,
      totalRecipients: contacts.length,
      startedAt: new Date(),
    });

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        const digits = recipient.phone.replace(/[^0-9]/g, '');

        // Verify number is on WhatsApp
        const numberId = await session.client.getNumberId(digits);
        if (!numberId) {
          await this.recipientRepo.update(recipient.id, {
            status: WaRecipientStatus.SKIPPED,
            errorMessage: 'Not registered on WhatsApp',
          });
          failed++;
          continue;
        }

        // Merge contact fields + campaign-level params
        // Contact fields: {{name}}, {{phone}}, {{email}}, {{note}}
        // Campaign params override contact fields if same key
        const mergedParams: Record<string, string> = {
          name: recipient.name ?? '',
          phone: recipient.phone ?? '',
          email: contacts.find(c => c.id === recipient.contactId)?.email ?? '',
          note: contacts.find(c => c.id === recipient.contactId)?.note ?? '',
          ...(campaign.params ?? {}),
        };

        await this.templateService.send(userId, campaign.templateId, {
          to: digits,
          params: mergedParams,
        });

        await this.recipientRepo.update(recipient.id, {
          status: WaRecipientStatus.SENT,
          sentAt: new Date(),
        });
        sent++;

        // Small delay between messages to avoid WA spam detection
        await new Promise(r => setTimeout(r, 1500));

      } catch (err: any) {
        this.logger.warn(`[WA-CAMPAIGN] Failed for ${recipient.phone}: ${err.message}`);
        await this.recipientRepo.update(recipient.id, {
          status: WaRecipientStatus.FAILED,
          errorMessage: err.message ?? 'Unknown error',
        });
        failed++;
      }
    }

    await this.campaignRepo.update(campaignId, {
      status: WaCampaignStatus.COMPLETED,
      sentCount: sent,
      failedCount: failed,
      completedAt: new Date(),
    });

    this.logger.log(`[WA-CAMPAIGN] #${campaignId} done — sent=${sent} failed=${failed}`);
  }

  // ── Called by scheduler ─────────────────────────────────────────────────────

  async dispatchScheduled(): Promise<void> {
    const now = new Date();
    const due = await this.campaignRepo.find({ where: { status: WaCampaignStatus.SCHEDULED } });
    for (const c of due) {
      if (c.scheduledAt && c.scheduledAt <= now) {
        await this.dispatch(c.id, c.userId).catch(err =>
          this.logger.error(`[WA-CAMPAIGN] Scheduled dispatch failed for #${c.id}: ${err.message}`),
        );
      }
    }
  }
}
