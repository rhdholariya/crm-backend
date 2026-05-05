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
import { AutomationWorkflowService } from '../services/automation-workflow.service';
import { CreateAutomationWorkflowDto } from '../dto/create-automation-workflow.dto';
import { WorkflowStatus } from '../entities/automation-workflow.entity';

@Controller('automation-workflows')
@UseGuards(JwtAuthGuard)
export class AutomationWorkflowController {
  constructor(private workflowService: AutomationWorkflowService) {}

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body() createWorkflowDto: CreateAutomationWorkflowDto,
  ) {
    return this.workflowService.create(user.id, createWorkflowDto);
  }

  @Get()
  async findAll(@CurrentUser() user: any) {
    return this.workflowService.findAll(user.id);
  }

  @Get(':id')
  async findById(@CurrentUser() user: any, @Param('id') id: number) {
    return this.workflowService.findById(user.id, id);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: number,
    @Body() updateData: Partial<CreateAutomationWorkflowDto>,
  ) {
    return this.workflowService.update(user.id, id, updateData);
  }

  @Put(':id/status')
  async updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: number,
    @Body() { status }: { status: WorkflowStatus },
  ) {
    return this.workflowService.updateStatus(user.id, id, status);
  }

  @Delete(':id')
  async delete(@CurrentUser() user: any, @Param('id') id: number) {
    return this.workflowService.delete(user.id, id);
  }
}
