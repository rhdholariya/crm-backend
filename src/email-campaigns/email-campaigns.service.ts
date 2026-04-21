import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EmailCampaign,
  CampaignStatus,
  RecipientType,
} from './entities/email-campaign.entity';
import {
  CampaignRecipient,
  RecipientStatus,
} from './entities/campaign-recipient.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { Contact } from '../contacts/entities/contact.entity';
import { EmailTemplate } from '../email-templates/entities/email-template.entity';
import { User } from '../users/entities/user.entity';
import { MailService } from '../common/services/mail.service';

@Injectable()
export class EmailCampaignsService {
  constructor(
    @InjectRepository(EmailCampaign)
    private readonly campaignRepo: Repository<EmailCampaign>,
    @InjectRepository(CampaignRecipient)
    private readonly recipientRepo: Repository<CampaignRecipient>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(EmailTemplate)
    private readonly templateRepo: Repository<EmailTemplate>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly mailService: MailService,
  ) {}

  // ─── Resolve contacts based on recipient type ───────────────────────────────

  private async resolveContacts(
    userId: number,
    recipientType: RecipientType,
    selectedContactIds?: number[],
    selectedTagIds?: number[],
  ): Promise<Contact[]> {
    const qb = this.contactRepo
      .createQueryBuilder('contact')
      .leftJoinAndSelect('contact.tags', 'tag')
      .where('contact.userId = :userId', { userId })
      .andWhere('contact.email IS NOT NULL')
      .andWhere("contact.email != ''");

    if (recipientType === RecipientType.SELECTED) {
      if (!selectedContactIds?.length)
        throw new BadRequestException('selectedContactIds required');
      qb.andWhere('contact.id IN (:...ids)', { ids: selectedContactIds });
    } else if (recipientType === RecipientType.BY_TAGS) {
      if (!selectedTagIds?.length)
        throw new BadRequestException('selectedTagIds required');
      qb.leftJoin('contact.tags', 'filterTag').andWhere(
        'filterTag.id IN (:...tagIds)',
        { tagIds: selectedTagIds },
      );
    }

    return qb.distinct(true).getMany();
  }

  // ─── Render template with contact data ──────────────────────────────────────

  private renderTemplate(
    template: EmailTemplate,
    contact: Contact,
  ): { subject: string; body: string } {
    const values: Record<string, string> = {
      name: contact.name ?? '',
      email: contact.email ?? '',
      phoneNumber: contact.phoneNumber ?? '',
      phone: contact.phoneNumber ?? '',
      note: contact.note ?? '',
    };

    const replace = (text: string) =>
      text.replace(/\[(\w+)\]/g, (_, key) => values[key] ?? `[${key}]`);

    return { subject: replace(template.subject), body: replace(template.body) };
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async create(userId: number, dto: CreateCampaignDto): Promise<EmailCampaign> {
    const template = await this.templateRepo.findOne({
      where: { id: dto.templateId },
    });
    if (!template) throw new NotFoundException('Email template not found');
    if (template.userId !== userId) throw new ForbiddenException();

    const isScheduled = !!dto.scheduledAt;
    const scheduledAt = isScheduled ? new Date(dto.scheduledAt!) : null;

    const campaign = await this.campaignRepo.save(
      this.campaignRepo.create({
        userId,
        name: dto.name,
        templateId: dto.templateId,
        recipientType: dto.recipientType,
        selectedContactIds: dto.selectedContactIds ?? [],
        selectedTagIds: dto.selectedTagIds ?? [],
        scheduledAt,
        status: isScheduled ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
      }),
    );

    // Immediate send
    if (!isScheduled) {
      await this.dispatch(campaign.id, userId);
    }

    return this.campaignRepo.findOne({ where: { id: campaign.id } }) as Promise<EmailCampaign>;
  }

  findAll(userId: number) {
    return this.campaignRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: number, id: number): Promise<EmailCampaign> {
    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException(`Campaign #${id} not found`);
    if (campaign.userId !== userId) throw new ForbiddenException();
    return campaign;
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateCampaignDto,
  ): Promise<EmailCampaign> {
    const campaign = await this.findOne(userId, id);
    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.SCHEDULED) {
      throw new BadRequestException('Only draft or scheduled campaigns can be updated');
    }
    Object.assign(campaign, {
      ...dto,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : campaign.scheduledAt,
      status: dto.scheduledAt ? CampaignStatus.SCHEDULED : campaign.status,
    });
    return this.campaignRepo.save(campaign);
  }

  async remove(userId: number, id: number) {
    const campaign = await this.findOne(userId, id);
    await this.recipientRepo.delete({ campaignId: id });
    await this.campaignRepo.remove(campaign);
    return { message: 'Campaign deleted successfully' };
  }

  async getRecipients(userId: number, campaignId: number) {
    await this.findOne(userId, campaignId);
    return this.recipientRepo.find({
      where: { campaignId },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Core dispatch logic ─────────────────────────────────────────────────────

  async dispatch(campaignId: number, userId: number): Promise<void> {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
      relations: ['template'],
    });
    if (!campaign) return;

    // Fetch sender's email from users table
    const sender = await this.userRepo.findOne({ where: { id: userId } });
    const fromEmail = sender?.email ?? process.env.MAIL_FROM ?? process.env.MAIL_USER;

    const template = campaign.template;
    const contacts = await this.resolveContacts(
      userId,
      campaign.recipientType,
      campaign.selectedContactIds?.filter(Boolean).map(Number),
      campaign.selectedTagIds?.filter(Boolean).map(Number),
    );

    // Build recipient rows
    const recipients = contacts.map((c) =>
      this.recipientRepo.create({
        campaignId: campaign.id,
        contactId: c.id,
        email: c.email,
        name: c.name,
        status: RecipientStatus.PENDING,
      }),
    );

    await this.recipientRepo.save(recipients);

    await this.campaignRepo.update(campaign.id, {
      status: CampaignStatus.SENDING,
      totalRecipients: contacts.length,
      startedAt: new Date(),
    });

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const contact = contacts.find((c) => c.id === recipient.contactId)!;
      const { subject, body } = this.renderTemplate(template, contact);

      try {
        await this.mailService.sendCampaignMail(recipient.email, subject, body, fromEmail);
        await this.recipientRepo.update(recipient.id, {
          status: RecipientStatus.SENT,
          sentAt: new Date(),
        });
        sent++;
      } catch (err) {
        await this.recipientRepo.update(recipient.id, {
          status: RecipientStatus.FAILED,
          errorMessage: err?.message ?? 'Unknown error',
        });
        failed++;
      }
    }

    await this.campaignRepo.update(campaign.id, {
      status: CampaignStatus.COMPLETED,
      sentCount: sent,
      failedCount: failed,
      completedAt: new Date(),
    });
  }

  // ─── Called by cron job ──────────────────────────────────────────────────────

  async dispatchScheduledCampaigns(): Promise<void> {
    const now = new Date();
    const due = await this.campaignRepo.find({
      where: { status: CampaignStatus.SCHEDULED },
    });

    for (const campaign of due) {
      if (campaign.scheduledAt && campaign.scheduledAt <= now) {
        await this.dispatch(campaign.id, campaign.userId);
      }
    }
  }
}
