import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FlowBuilderService } from './flow-builder.service';
import { AutomationWorkflowService } from '../lead-management/services/automation-workflow.service';
import { CreateAutomationWorkflowDto } from '../lead-management/dto/create-automation-workflow.dto';
import { WorkflowStatus } from '../lead-management/entities/automation-workflow.entity';
import { CreateFlowDto } from './dto/create-flow.dto';
import { UpdateFlowDto } from './dto/update-flow.dto';
import { SaveFlowGraphDto } from './dto/save-flow-graph.dto';
import { FeSaveFlowDto } from './dto/fe-save-flow.dto';
import { SimulateFlowDto } from './dto/simulate-flow.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';
import { FlowStatus } from './entities/flow.entity';
import { IsEnum } from 'class-validator';

class UpdateStatusDto {
  @IsEnum(FlowStatus)
  status: FlowStatus;
}

class UpdateWorkflowStatusDto {
  @IsEnum(WorkflowStatus)
  status: WorkflowStatus;
}

@UseGuards(JwtAuthGuard)
@Controller('flows')
export class FlowBuilderController {
  constructor(
    private readonly flowService: FlowBuilderService,
    private readonly automationService: AutomationWorkflowService,
  ) {}

  // ── Flow CRUD ─────────────────────────────────────────────────────────────

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateFlowDto) {
    const flow = await this.flowService.create(user.id, dto);
    return successResponse('Flow created successfully', flow);
  }

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('search') search?: string,
    @Query('status') status?: FlowStatus,
  ) {
    const result = await this.flowService.findAll(
      user.id,
      Number(page),
      Number(limit),
      search,
      status,
    );
    return successResponse('Flows fetched successfully', result);
  }

  @Get('templates')
  async getTemplates(@CurrentUser() user: AuthUser) {
    const templates = await this.flowService.getTemplates(user.id);
    return successResponse('Templates fetched successfully', templates);
  }

  @Post('templates/:id/clone')
  async cloneTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body('name') name: string,
  ) {
    const flow = await this.flowService.cloneFromTemplate(user.id, id, name);
    return successResponse('Flow cloned from template', flow);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const flow = await this.flowService.findOne(user.id, id);
    return successResponse('Flow fetched successfully', flow);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFlowDto,
  ) {
    const flow = await this.flowService.update(user.id, id, dto);
    return successResponse('Flow updated successfully', flow);
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
  ) {
    const flow = await this.flowService.updateStatus(user.id, id, dto.status);
    return successResponse('Flow status updated', flow);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.flowService.remove(user.id, id);
    return successResponse(result.message);
  }

  // ── Graph (drag & drop canvas) ────────────────────────────────────────────

  @Get(':id/graph')
  async getGraph(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const graph = await this.flowService.getFEGraph(user.id, id);
    return successResponse('Flow graph fetched successfully', graph);
  }

  /**
   * Primary save endpoint — accepts raw Vue Flow / React Flow canvas payload.
   * FE sends: { name, nodes: [...vueFlowNodes], edges: [...vueFlowEdges] }
   */
  @Post(':id/graph')
  async saveGraph(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FeSaveFlowDto,
  ) {
    const graph = await this.flowService.saveFEGraph(user.id, id, dto);
    return successResponse('Flow graph saved successfully', graph);
  }

  /**
   * Also accept PUT for FE frameworks that prefer PUT for full replace.
   */
  @Put(':id/graph')
  async putGraph(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FeSaveFlowDto,
  ) {
    const graph = await this.flowService.saveFEGraph(user.id, id, dto);
    return successResponse('Flow graph saved successfully', graph);
  }

  // ── Validation ────────────────────────────────────────────────────────────

  @Get(':id/validate')
  async validate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.flowService.validateGraph(user.id, id);
    return successResponse('Flow validation complete', result);
  }

  // ── Simulation (test mode) ────────────────────────────────────────────────

  @Post(':id/simulate')
  async simulate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SimulateFlowDto,
  ) {
    const result = await this.flowService.simulate(user.id, id, dto);
    return successResponse('Flow simulation complete', result);
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  @Get(':id/analytics')
  async getAnalytics(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('days') days = 30,
  ) {
    const result = await this.flowService.getAnalytics(user.id, id, Number(days));
    return successResponse('Flow analytics fetched', result);
  }

  @Get(':id/executions')
  async getExecutions(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const result = await this.flowService.getExecutions(user.id, id, Number(page), Number(limit));
    return successResponse('Executions fetched successfully', result);
  }

  @Get('executions/:executionId')
  async getExecutionDetail(
    @CurrentUser() user: AuthUser,
    @Param('executionId', ParseIntPipe) executionId: number,
  ) {
    const result = await this.flowService.getExecutionDetail(user.id, executionId);
    return successResponse('Execution detail fetched', result);
  }

  // ── Automation Workflows ──────────────────────────────────────────────────

  // POST /api/flows/automations
  @Post('automations')
  async createAutomation(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAutomationWorkflowDto,
  ) {
    const result = await this.automationService.create(user.id, dto);
    return successResponse('Automation workflow created successfully', result);
  }

  // GET /api/flows/automations
  @Get('automations')
  async findAllAutomations(@CurrentUser() user: AuthUser) {
    const result = await this.automationService.findAll(user.id);
    return successResponse('Automation workflows fetched successfully', result);
  }

  // GET /api/flows/automations/:id
  @Get('automations/:id')
  async findOneAutomation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.automationService.findById(user.id, id);
    return successResponse('Automation workflow fetched successfully', result);
  }

  // PUT /api/flows/automations/:id
  @Put('automations/:id')
  async updateAutomation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateAutomationWorkflowDto>,
  ) {
    const result = await this.automationService.update(user.id, id, dto);
    return successResponse('Automation workflow updated successfully', result);
  }

  // PUT /api/flows/automations/:id/status
  @Put('automations/:id/status')
  async updateAutomationStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkflowStatusDto,
  ) {
    const result = await this.automationService.updateStatus(user.id, id, dto.status);
    return successResponse('Automation workflow status updated', result);
  }

  // DELETE /api/flows/automations/:id
  @Delete('automations/:id')
  @HttpCode(HttpStatus.OK)
  async removeAutomation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.automationService.delete(user.id, id);
    return successResponse('Automation workflow deleted successfully');
  }
}
