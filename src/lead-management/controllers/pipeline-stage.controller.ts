import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { PipelineStageService } from '../services/pipeline-stage.service';
import { CreatePipelineStageDto } from '../dto/create-pipeline-stage.dto';
import { successResponse } from '../../common/utils/response.util';

@Controller('pipelines/:pipelineId/stages')
@UseGuards(JwtAuthGuard)
export class PipelineStageController {
  constructor(private stageService: PipelineStageService) {}

  @Post()
  async create(
    @CurrentUser() user: any,
    @Param('pipelineId', ParseIntPipe) pipelineId: number,
    @Body() dto: CreatePipelineStageDto,
  ) {
    const data = await this.stageService.create(user.id, pipelineId, dto);
    return successResponse('Stage created successfully', data);
  }

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Param('pipelineId', ParseIntPipe) pipelineId: number,
  ) {
    const data = await this.stageService.findAll(user.id, pipelineId);
    return successResponse('Stages fetched successfully', data);
  }

  // Support both PUT and PATCH for reorder
  // Must be defined BEFORE `:id` routes to avoid route conflict
  @Put('reorder')
  @Patch('reorder')
  async reorderStages(
    @CurrentUser() user: any,
    @Param('pipelineId', ParseIntPipe) pipelineId: number,
    @Body() body: any,
  ) {
    let stageOrder: { id: number; position: number }[];

    if (Array.isArray(body)) {
      // Format: [{ id, position }, ...]
      stageOrder = body;
    } else if (Array.isArray(body?.stages)) {
      // Format: { stages: [{ id, position }, ...] }
      stageOrder = body.stages;
    } else if (body?.id !== undefined && body?.position !== undefined) {
      // Format: single object { id, position } — wrap it
      stageOrder = [body];
    } else {
      stageOrder = [];
    }

    const data = await this.stageService.reorderStages(user.id, pipelineId, stageOrder);
    return successResponse('Stages reordered successfully', data);
  }

  @Get(':id')
  async findById(
    @CurrentUser() user: any,
    @Param('pipelineId', ParseIntPipe) pipelineId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.stageService.findById(user.id, pipelineId, id);
    return successResponse('Stage fetched successfully', data);
  }

  @Get(':id/with-leads')
  async getStageWithLeads(
    @CurrentUser() user: any,
    @Param('pipelineId', ParseIntPipe) pipelineId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this.stageService.getStageWithLeads(user.id, pipelineId, id);
    return successResponse('Stage with leads fetched successfully', data);
  }

  // Support both PUT and PATCH
  @Put(':id')
  @Patch(':id')
  async update(
    @CurrentUser() user: any,
    @Param('pipelineId', ParseIntPipe) pipelineId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreatePipelineStageDto>,
  ) {
    const data = await this.stageService.update(user.id, pipelineId, id, dto);
    return successResponse('Stage updated successfully', data);
  }

  @Delete(':id')
  async delete(
    @CurrentUser() user: any,
    @Param('pipelineId', ParseIntPipe) pipelineId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.stageService.delete(user.id, pipelineId, id);
    return successResponse('Stage deleted successfully');
  }
}
