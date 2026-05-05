import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EcommerceIntegration, IntegrationStatus } from '../entities/ecommerce-integration.entity';
import { CreateEcommerceIntegrationDto } from '../dto/create-ecommerce-integration.dto';

@Injectable()
export class EcommerceIntegrationService {
  constructor(
    @InjectRepository(EcommerceIntegration)
    private integrationRepository: Repository<EcommerceIntegration>,
  ) {}

  async create(
    userId: number,
    createIntegrationDto: CreateEcommerceIntegrationDto,
  ): Promise<EcommerceIntegration> {
    // Check if integration already exists
    const existing = await this.integrationRepository.findOne({
      where: {
        userId,
        platform: createIntegrationDto.platform,
        storeName: createIntegrationDto.storeName,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Integration already exists for this store',
      );
    }

    const integration = this.integrationRepository.create({
      ...createIntegrationDto,
      userId,
      status: IntegrationStatus.ACTIVE,
    });

    return this.integrationRepository.save(integration);
  }

  async findAll(userId: number): Promise<EcommerceIntegration[]> {
    return this.integrationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(
    userId: number,
    integrationId: number,
  ): Promise<EcommerceIntegration> {
    const integration = await this.integrationRepository.findOne({
      where: { id: integrationId, userId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    return integration;
  }

  async update(
    userId: number,
    integrationId: number,
    updateData: Partial<CreateEcommerceIntegrationDto>,
  ): Promise<EcommerceIntegration> {
    const integration = await this.findById(userId, integrationId);

    Object.assign(integration, updateData);

    return this.integrationRepository.save(integration);
  }

  async updateStatus(
    userId: number,
    integrationId: number,
    status: IntegrationStatus,
  ): Promise<EcommerceIntegration> {
    const integration = await this.findById(userId, integrationId);
    integration.status = status;
    return this.integrationRepository.save(integration);
  }

  async recordError(
    userId: number,
    integrationId: number,
    error: string,
  ): Promise<EcommerceIntegration> {
    const integration = await this.findById(userId, integrationId);
    integration.lastError = error;
    integration.status = IntegrationStatus.ERROR;
    return this.integrationRepository.save(integration);
  }

  async updateSyncDate(
    userId: number,
    integrationId: number,
  ): Promise<EcommerceIntegration> {
    const integration = await this.findById(userId, integrationId);
    integration.lastSyncDate = new Date();
    return this.integrationRepository.save(integration);
  }

  async delete(userId: number, integrationId: number): Promise<void> {
    const integration = await this.findById(userId, integrationId);
    await this.integrationRepository.remove(integration);
  }

  async getByPlatform(userId: number, platform: string) {
    return this.integrationRepository.find({
      where: { userId, platform: platform as any },
    });
  }
}
