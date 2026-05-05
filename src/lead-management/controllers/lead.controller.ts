import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { LeadService } from '../services/lead.service';
import { CreateLeadDto } from '../dto/create-lead.dto';
import { UpdateLeadDto } from '../dto/update-lead.dto';
import { CustomerType } from '../entities/lead.entity';

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadController {
  constructor(private leadService: LeadService) {}

  @Post()
  async create(@CurrentUser() user: any, @Body() createLeadDto: CreateLeadDto) {
    return this.leadService.create(user.id, createLeadDto);
  }

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('stageId') stageId?: number,
    @Query('customerType') customerType?: CustomerType,
    @Query('isArchived') isArchived?: string,
    @Query('search') search?: string,
  ) {
    const filters = {
      stageId: stageId ? parseInt(stageId as any) : undefined,
      customerType,
      isArchived: isArchived !== undefined ? isArchived === 'true' : undefined,
      search,
    };

    return this.leadService.findAll(user.id, filters);
  }

  @Get('kanban/board')
  async getKanbanBoard(@CurrentUser() user: any) {
    const stages = await this.leadService.getKanbanBoard(user.id);
    return stages;
  }

  @Get('high-value')
  async getHighValueCustomers(
    @CurrentUser() user: any,
    @Query('minOrderValue') minOrderValue: number = 1000,
  ) {
    return this.leadService.getHighValueCustomers(
      user.id,
      minOrderValue,
    );
  }

  @Get('inactive')
  async getInactiveLeads(
    @CurrentUser() user: any,
    @Query('daysNoOrder') daysNoOrder: number = 30,
  ) {
    return this.leadService.getInactiveLeads(user.id, daysNoOrder);
  }

  @Get(':id')
  async findById(@CurrentUser() user: any, @Param('id') id: number) {
    return this.leadService.findById(user.id, id);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: number,
    @Body() updateLeadDto: UpdateLeadDto,
  ) {
    return this.leadService.update(user.id, id, updateLeadDto);
  }

  @Put(':id/stage/:stageId')
  async updateStage(
    @CurrentUser() user: any,
    @Param('id') id: number,
    @Param('stageId') stageId: number,
  ) {
    return this.leadService.updateStage(user.id, id, stageId);
  }

  @Put(':id/customer-type/:customerType')
  async updateCustomerType(
    @CurrentUser() user: any,
    @Param('id') id: number,
    @Param('customerType') customerType: CustomerType,
  ) {
    return this.leadService.updateCustomerType(user.id, id, customerType);
  }

  @Get(':id/activities')
  async getActivities(@CurrentUser() user: any, @Param('id') id: number) {
    return this.leadService.getActivities(user.id, id);
  }

  @Put(':id/archive')
  async archive(@CurrentUser() user: any, @Param('id') id: number) {
    return this.leadService.archive(user.id, id);
  }

  @Put(':id/unarchive')
  async unarchive(@CurrentUser() user: any, @Param('id') id: number) {
    return this.leadService.unarchive(user.id, id);
  }

  @Delete(':id')
  async delete(@CurrentUser() user: any, @Param('id') id: number) {
    return this.leadService.delete(user.id, id);
  }
}
