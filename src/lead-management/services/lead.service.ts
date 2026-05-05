import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead, CustomerType } from '../entities/lead.entity';
import { LeadActivity, ActivityType } from '../entities/lead-activity.entity';
import { CreateLeadDto } from '../dto/create-lead.dto';
import { UpdateLeadDto } from '../dto/update-lead.dto';

@Injectable()
export class LeadService {
  constructor(
    @InjectRepository(Lead)
    private leadRepository: Repository<Lead>,
    @InjectRepository(LeadActivity)
    private activityRepository: Repository<LeadActivity>,
  ) {}

  async create(userId: number, createLeadDto: CreateLeadDto): Promise<Lead> {
    const lead = this.leadRepository.create({
      ...createLeadDto,
      userId,
    });
    return this.leadRepository.save(lead);
  }

  async findAll(userId: number, filters?: any): Promise<Lead[]> {
    const query = this.leadRepository
      .createQueryBuilder('lead')
      .where('lead.userId = :userId', { userId })
      .leftJoinAndSelect('lead.stage', 'stage')
      .leftJoinAndSelect('lead.tags', 'tags')
      .leftJoinAndSelect('lead.activities', 'activities');

    if (filters?.stageId) {
      query.andWhere('lead.stageId = :stageId', { stageId: filters.stageId });
    }

    if (filters?.customerType) {
      query.andWhere('lead.customerType = :customerType', {
        customerType: filters.customerType,
      });
    }

    if (filters?.isArchived !== undefined) {
      query.andWhere('lead.isArchived = :isArchived', {
        isArchived: filters.isArchived,
      });
    }

    if (filters?.search) {
      query.andWhere(
        '(lead.name ILIKE :search OR lead.email ILIKE :search OR lead.phoneNumber ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    return query.orderBy('lead.createdAt', 'DESC').getMany();
  }

  async findById(userId: number, leadId: number): Promise<Lead> {
    const lead = await this.leadRepository.findOne({
      where: { id: leadId, userId },
      relations: ['stage', 'tags', 'activities'],
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return lead;
  }

  async update(
    userId: number,
    leadId: number,
    updateLeadDto: UpdateLeadDto,
  ): Promise<Lead> {
    const lead = await this.findById(userId, leadId);

    Object.assign(lead, updateLeadDto);

    return this.leadRepository.save(lead);
  }

  async updateStage(
    userId: number,
    leadId: number,
    stageId: number,
  ): Promise<Lead> {
    const lead = await this.findById(userId, leadId);
    const oldStageId = lead.stageId;

    lead.stageId = stageId;
    const updatedLead = await this.leadRepository.save(lead);

    // Log activity
    await this.addActivity(leadId, ActivityType.STAGE_CHANGED, 'Stage changed', {
      oldStageId,
      newStageId: stageId,
    });

    return updatedLead;
  }

  async updateCustomerType(
    userId: number,
    leadId: number,
    customerType: CustomerType,
  ): Promise<Lead> {
    const lead = await this.findById(userId, leadId);
    lead.customerType = customerType;

    if (customerType === CustomerType.VIP) {
      await this.addActivity(leadId, ActivityType.TAG_ADDED, 'Tagged as VIP', {
        tag: 'VIP',
      });
    }

    return this.leadRepository.save(lead);
  }

  async addActivity(
    leadId: number,
    type: ActivityType,
    description: string,
    metadata?: Record<string, any>,
  ): Promise<LeadActivity> {
    const activity = this.activityRepository.create({
      leadId,
      type,
      description,
      metadata,
    });

    return this.activityRepository.save(activity);
  }

  async getActivities(userId: number, leadId: number): Promise<LeadActivity[]> {
    await this.findById(userId, leadId); // Verify lead exists

    return this.activityRepository.find({
      where: { leadId },
      order: { createdAt: 'DESC' },
    });
  }

  async archive(userId: number, leadId: number): Promise<Lead> {
    const lead = await this.findById(userId, leadId);
    lead.isArchived = true;
    return this.leadRepository.save(lead);
  }

  async unarchive(userId: number, leadId: number): Promise<Lead> {
    const lead = await this.findById(userId, leadId);
    lead.isArchived = false;
    return this.leadRepository.save(lead);
  }

  async delete(userId: number, leadId: number): Promise<void> {
    const lead = await this.findById(userId, leadId);
    await this.leadRepository.remove(lead);
  }

  async getLeadsByStage(userId: number, stageId: number): Promise<Lead[]> {
    return this.leadRepository.find({
      where: { userId, stageId, isArchived: false },
      relations: ['tags', 'activities'],
      order: { createdAt: 'DESC' },
    });
  }

  async getHighValueCustomers(
    userId: number,
    minOrderValue: number,
  ): Promise<Lead[]> {
    return this.leadRepository
      .createQueryBuilder('lead')
      .where('lead.userId = :userId', { userId })
      .andWhere('lead.totalOrderValue >= :minOrderValue', { minOrderValue })
      .andWhere('lead.isArchived = false')
      .orderBy('lead.totalOrderValue', 'DESC')
      .getMany();
  }

  async getInactiveLeads(userId: number, daysNoOrder: number): Promise<Lead[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNoOrder);

    return this.leadRepository
      .createQueryBuilder('lead')
      .where('lead.userId = :userId', { userId })
      .andWhere('lead.lastPurchaseDate < :cutoffDate', { cutoffDate })
      .andWhere('lead.isArchived = false')
      .orderBy('lead.lastPurchaseDate', 'ASC')
      .getMany();
  }

  async getKanbanBoard(userId: number): Promise<any[]> {
    const pipelines = await this.leadRepository.query(
      `
      SELECT 
        p.id as pipelineId,
        p.name as pipelineName,
        p.type as pipelineType,
        json_agg(
          json_build_object(
            'id', ps.id,
            'name', ps.name,
            'color', ps.color,
            'position', ps.position,
            'leads', (
              SELECT json_agg(
                json_build_object(
                  'id', l.id,
                  'name', l.name,
                  'email', l.email,
                  'phoneNumber', l.phoneNumber,
                  'customerType', l.customerType,
                  'totalOrderValue', l.totalOrderValue,
                  'orderCount', l.orderCount,
                  'lastOrderDate', l.lastOrderDate
                )
              )
              FROM leads l
              WHERE l.stageId = ps.id AND l.userId = $1 AND l.isArchived = false
            )
          ) ORDER BY ps.position ASC
        ) as stages
      FROM pipelines p
      LEFT JOIN pipeline_stages ps ON p.id = ps.pipelineId
      WHERE p.userId = $1 AND p.isActive = true
      GROUP BY p.id, p.name, p.type
      ORDER BY p.createdAt DESC
      `,
      [userId],
    );

    return pipelines;
  }

  async findByExternalId(userId: number, externalId: string): Promise<Lead> {
    const lead = await this.leadRepository.findOne({
      where: { userId, externalId },
      relations: ['stage', 'tags', 'activities'],
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return lead;
  }

  async updateFromWebhook(
    userId: number,
    externalId: string,
    data: Record<string, any>,
  ): Promise<Lead> {
    let lead = await this.leadRepository.findOne({
      where: { userId, externalId },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    // Update lead with webhook data
    if (data.name) lead.name = data.name;
    if (data.email) lead.email = data.email;
    if (data.phoneNumber) lead.phoneNumber = data.phoneNumber;
    if (data.totalOrderValue) lead.totalOrderValue = data.totalOrderValue;
    if (data.orderCount) lead.orderCount = data.orderCount;
    if (data.lastOrderDate) lead.lastOrderDate = data.lastOrderDate;

    lead.customFields = { ...lead.customFields, ...data.customFields };

    return this.leadRepository.save(lead);
  }
}
