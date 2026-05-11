import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PipelineStage } from '../entities/pipeline-stage.entity';
import { Pipeline } from '../entities/pipeline.entity';
import { CreatePipelineStageDto } from '../dto/create-pipeline-stage.dto';

@Injectable()
export class PipelineStageService {
  constructor(
    @InjectRepository(PipelineStage)
    private stageRepository: Repository<PipelineStage>,
    @InjectRepository(Pipeline)
    private pipelineRepository: Repository<Pipeline>,
  ) {}

  async create(
    userId: number,
    pipelineId: number,
    createStageDto: CreatePipelineStageDto,
  ): Promise<PipelineStage> {
    // Verify pipeline exists and belongs to user
    const pipeline = await this.pipelineRepository.findOne({
      where: { id: pipelineId, userId },
    });

    if (!pipeline) {
      throw new NotFoundException('Pipeline not found');
    }

    // Get max position for this pipeline
    const maxStage = await this.stageRepository
      .createQueryBuilder('stage')
      .where('stage.pipelineId = :pipelineId', { pipelineId })
      .orderBy('stage.position', 'DESC')
      .getOne();

    const position = maxStage ? maxStage.position + 1 : 0;

    const stage = this.stageRepository.create({
      ...createStageDto,
      pipelineId,
      position,
    });

    return this.stageRepository.save(stage);
  }

  async findAll(userId: number, pipelineId: number): Promise<PipelineStage[]> {
    // Verify pipeline exists and belongs to user
    const pipeline = await this.pipelineRepository.findOne({
      where: { id: pipelineId, userId },
    });

    if (!pipeline) {
      throw new NotFoundException('Pipeline not found');
    }

    return this.stageRepository
      .createQueryBuilder('stage')
      .leftJoinAndSelect('stage.leads', 'lead', 'lead.isArchived = false')
      .leftJoinAndSelect('lead.tags', 'tags')
      .where('stage.pipelineId = :pipelineId', { pipelineId })
      .andWhere('stage.isActive = true')
      .orderBy('stage.position', 'ASC')
      .addOrderBy('lead.createdAt', 'DESC')
      .getMany();
  }

  async findById(
    userId: number,
    pipelineId: number,
    stageId: number,
  ): Promise<PipelineStage> {
    // Verify pipeline exists and belongs to user
    const pipeline = await this.pipelineRepository.findOne({
      where: { id: pipelineId, userId },
    });

    if (!pipeline) {
      throw new NotFoundException('Pipeline not found');
    }

    const stage = await this.stageRepository.findOne({
      where: { id: stageId, pipelineId },
    });

    if (!stage) {
      throw new NotFoundException('Pipeline stage not found');
    }

    return stage;
  }

  async update(
    userId: number,
    pipelineId: number,
    stageId: number,
    updateData: Partial<CreatePipelineStageDto>,
  ): Promise<PipelineStage> {
    const stage = await this.findById(userId, pipelineId, stageId);

    Object.assign(stage, updateData);

    return this.stageRepository.save(stage);
  }

  async reorderStages(
    userId: number,
    pipelineId: number,
    stageOrder: { id: number; position: number }[],
  ): Promise<PipelineStage[]> {
    // Verify pipeline exists and belongs to user
    const pipeline = await this.pipelineRepository.findOne({
      where: { id: pipelineId, userId },
    });

    if (!pipeline) {
      throw new NotFoundException('Pipeline not found');
    }

    const stages = await Promise.all(
      stageOrder.map(async (item) => {
        const stage = await this.stageRepository.findOne({
          where: { id: item.id, pipelineId },
        });

        if (!stage) {
          throw new NotFoundException(`Stage ${item.id} not found`);
        }

        stage.position = item.position;
        return this.stageRepository.save(stage);
      }),
    );

    return stages.sort((a, b) => a.position - b.position);
  }

  async delete(
    userId: number,
    pipelineId: number,
    stageId: number,
  ): Promise<void> {
    const stage = await this.findById(userId, pipelineId, stageId);
    stage.isActive = false;
    await this.stageRepository.save(stage);
  }

  async getStageWithLeads(
    userId: number,
    pipelineId: number,
    stageId: number,
  ) {
    await this.findById(userId, pipelineId, stageId); // verify ownership

    return this.stageRepository
      .createQueryBuilder('stage')
      .leftJoinAndSelect('stage.leads', 'lead', 'lead.isArchived = false')
      .leftJoinAndSelect('lead.tags', 'tags')
      .where('stage.id = :stageId', { stageId })
      .andWhere('stage.pipelineId = :pipelineId', { pipelineId })
      .orderBy('lead.createdAt', 'DESC')
      .getOne();
  }
}
