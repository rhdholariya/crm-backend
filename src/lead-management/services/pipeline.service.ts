import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pipeline, PipelineType } from '../entities/pipeline.entity';
import { Lead } from '../entities/lead.entity';
import { CreatePipelineDto } from '../dto/create-pipeline.dto';
import { UpdatePipelineDto } from '../dto/update-pipeline.dto';

@Injectable()
export class PipelineService {
  constructor(
    @InjectRepository(Pipeline)
    private pipelineRepository: Repository<Pipeline>,
    @InjectRepository(Lead)
    private leadRepository: Repository<Lead>,
  ) {}

  async create(
    userId: number,
    createPipelineDto: CreatePipelineDto,
  ): Promise<Pipeline> {
    const pipeline = this.pipelineRepository.create({
      ...createPipelineDto,
      userId,
      type: createPipelineDto.type || PipelineType.SALES,
    });

    return this.pipelineRepository.save(pipeline);
  }

  async findAll(userId: number): Promise<Pipeline[]> {
    return this.pipelineRepository.find({
      where: { userId, isActive: true },
      relations: ['stages'],
      order: { createdAt: 'DESC' },
    });
  }

  async findById(userId: number, pipelineId: number): Promise<Pipeline> {
    const pipeline = await this.pipelineRepository.findOne({
      where: { id: pipelineId, userId },
      relations: ['stages'],
    });

    if (!pipeline) {
      throw new NotFoundException('Pipeline not found');
    }

    return pipeline;
  }

  async update(
    userId: number,
    pipelineId: number,
    updatePipelineDto: UpdatePipelineDto,
  ): Promise<Pipeline> {
    const pipeline = await this.findById(userId, pipelineId);

    Object.assign(pipeline, updatePipelineDto);

    return this.pipelineRepository.save(pipeline);
  }

  async delete(userId: number, pipelineId: number): Promise<void> {
    const pipeline = await this.findById(userId, pipelineId);
    pipeline.isActive = false;
    await this.pipelineRepository.save(pipeline);
  }

  async getByType(userId: number, type: PipelineType): Promise<Pipeline[]> {
    return this.pipelineRepository.find({
      where: { userId, type, isActive: true },
      relations: ['stages'],
      order: { createdAt: 'DESC' },
    });
  }

  async getPipelineWithStages(
    userId: number,
    pipelineId: number,
  ): Promise<any> {
    const pipeline = await this.pipelineRepository.findOne({
      where: { id: pipelineId, userId },
      relations: ['stages'],
    });

    if (!pipeline) {
      throw new NotFoundException('Pipeline not found');
    }

    // Fetch leads for each stage
    const stagesWithLeads = await Promise.all(
      pipeline.stages.map(async (stage) => {
        const leads = await this.leadRepository.find({
          where: {
            stageId: stage.id,
            userId,
            isArchived: false,
          },
          order: { createdAt: 'DESC' },
        });

        return {
          ...stage,
          leads: leads || [],
        };
      }),
    );

    return {
      ...pipeline,
      stages: stagesWithLeads,
    };
  }
}
