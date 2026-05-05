import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PipelineStageService } from '../services/pipeline-stage.service';
import { CreatePipelineStageDto } from '../dto/create-pipeline-stage.dto';

@Controller('pipelines/:pipelineId/stages')
@UseGuards(JwtAuthGuard)
export class PipelineStageController {
  constructor(private stageService: PipelineStageService) {}

  @Post()
  async create(
    @CurrentUser() user: any,
    @Param('pipelineId') pipelineId: number,
    @Body() createStageDto: CreatePipelineStageDto,
  ) {
    return this.stageService.create(user.id, pipelineId, createStageDto);
  }

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Param('pipelineId') pipelineId: number,
  ) {
    return this.stageService.findAll(user.id, pipelineId);
  }

  @Get(':id')
  async findById(
    @CurrentUser() user: any,
    @Param('pipelineId') pipelineId: number,
    @Param('id') id: number,
  ) {
    return this.stageService.findById(user.id, pipelineId, id);
  }

  @Get(':id/with-leads')
  async getStageWithLeads(
    @CurrentUser() user: any,
    @Param('pipelineId') pipelineId: number,
    @Param('id') id: number,
  ) {
    return this.stageService.getStageWithLeads(user.id, pipelineId, id);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: any,
    @Param('pipelineId') pipelineId: number,
    @Param('id') id: number,
    @Body() updateData: Partial<CreatePipelineStageDto>,
  ) {
    return this.stageService.update(user.id, pipelineId, id, updateData);
  }

  @Put('reorder')
  async reorderStages(
    @CurrentUser() user: any,
    @Param('pipelineId') pipelineId: number,
    @Body() stageOrder: { id: number; position: number }[],
  ) {
    return this.stageService.reorderStages(user.id, pipelineId, stageOrder);
  }

  @Delete(':id')
  async delete(
    @CurrentUser() user: any,
    @Param('pipelineId') pipelineId: number,
    @Param('id') id: number,
  ) {
    return this.stageService.delete(user.id, pipelineId, id);
  }
}
