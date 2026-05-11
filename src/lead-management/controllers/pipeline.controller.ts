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
import { PipelineService } from '../services/pipeline.service';
import { CreatePipelineDto } from '../dto/create-pipeline.dto';
import { UpdatePipelineDto } from '../dto/update-pipeline.dto';
import { successResponse } from '../../common/utils/response.util';

@Controller('pipelines')
@UseGuards(JwtAuthGuard)
export class PipelineController {
  constructor(private pipelineService: PipelineService) {}

  @Post()
  async create(@CurrentUser() user: any, @Body() dto: CreatePipelineDto) {
    const data = await this.pipelineService.create(user.id, dto);
    return successResponse('Pipeline created successfully', data);
  }

  @Get()
  async findAll(@CurrentUser() user: any) {
    const data = await this.pipelineService.findAll(user.id);
    return successResponse('Pipelines fetched successfully', data);
  }

  @Get(':id')
  async findById(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.pipelineService.findById(user.id, id);
    return successResponse('Pipeline fetched successfully', data);
  }

  @Get(':id/with-stages')
  async getPipelineWithStages(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.pipelineService.getPipelineWithStages(user.id, id);
    return successResponse('Pipeline with stages fetched successfully', data);
  }

  // Support both PUT and PATCH
  @Put(':id')
  @Patch(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePipelineDto,
  ) {
    const data = await this.pipelineService.update(user.id, id, dto);
    return successResponse('Pipeline updated successfully', data);
  }

  @Delete(':id')
  async delete(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    await this.pipelineService.delete(user.id, id);
    return successResponse('Pipeline deleted successfully');
  }
}
