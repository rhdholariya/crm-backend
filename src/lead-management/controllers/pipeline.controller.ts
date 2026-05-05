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
import { PipelineService } from '../services/pipeline.service';
import { CreatePipelineDto } from '../dto/create-pipeline.dto';
import { UpdatePipelineDto } from '../dto/update-pipeline.dto';

@Controller('pipelines')
@UseGuards(JwtAuthGuard)
export class PipelineController {
  constructor(private pipelineService: PipelineService) {}

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body() createPipelineDto: CreatePipelineDto,
  ) {
    return this.pipelineService.create(user.id, createPipelineDto);
  }

  @Get()
  async findAll(@CurrentUser() user: any) {
    return this.pipelineService.findAll(user.id);
  }

  @Get(':id')
  async findById(@CurrentUser() user: any, @Param('id') id: number) {
    return this.pipelineService.findById(user.id, id);
  }

  @Get(':id/with-stages')
  async getPipelineWithStages(
    @CurrentUser() user: any,
    @Param('id') id: number,
  ) {
    return this.pipelineService.getPipelineWithStages(user.id, id);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: number,
    @Body() updatePipelineDto: UpdatePipelineDto,
  ) {
    return this.pipelineService.update(user.id, id, updatePipelineDto);
  }

  @Delete(':id')
  async delete(@CurrentUser() user: any, @Param('id') id: number) {
    return this.pipelineService.delete(user.id, id);
  }
}
