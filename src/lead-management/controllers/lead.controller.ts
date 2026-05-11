import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { LeadService } from '../services/lead.service';
import { CreateLeadDto } from '../dto/create-lead.dto';
import { UpdateLeadDto } from '../dto/update-lead.dto';
import { CustomerType } from '../entities/lead.entity';
import { successResponse } from '../../common/utils/response.util';
import { IsString, IsArray, IsOptional } from 'class-validator';

class AddNoteDto {
  // Single: { "text": "..." }  OR  Multiple: { "texts": ["...", "..."] }
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  texts?: string[];
}

class UpdateNoteDto {
  // Single: { "id": "...", "text": "..." }  OR  Multiple: { "notes": [{ "id": "...", "text": "..." }] }
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  notes?: { id: string; text: string }[];
}

class DeleteNoteDto {
  // Single: { "id": "..." }  OR  Multiple: { "ids": ["...", "..."] }
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsArray()
  ids?: string[];
}

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadController {
  constructor(private leadService: LeadService) {}

  @Post()
  async create(@CurrentUser() user: any, @Body() dto: CreateLeadDto) {
    const data = await this.leadService.create(user.id, dto);
    return successResponse('Lead created successfully', data);
  }

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('pipelineId') pipelineId?: number,
    @Query('stageId') stageId?: number,
    @Query('customerType') customerType?: CustomerType,
    @Query('isArchived') isArchived?: string,
    @Query('search') search?: string,
  ) {
    const filters = {
      pipelineId: pipelineId ? parseInt(pipelineId as any) : undefined,
      stageId: stageId ? parseInt(stageId as any) : undefined,
      customerType,
      isArchived: isArchived !== undefined ? isArchived === 'true' : undefined,
      search,
    };
    const data = await this.leadService.findAll(user.id, filters);
    return successResponse('Leads fetched successfully', data);
  }

  @Get('kanban/board')
  async getKanbanBoard(@CurrentUser() user: any) {
    const data = await this.leadService.getKanbanBoard(user.id);
    return successResponse('Kanban board fetched successfully', data);
  }

  @Get('high-value')
  async getHighValueCustomers(
    @CurrentUser() user: any,
    @Query('minOrderValue') minOrderValue: number = 1000,
  ) {
    const data = await this.leadService.getHighValueCustomers(user.id, minOrderValue);
    return successResponse('High value customers fetched successfully', data);
  }

  @Get('inactive')
  async getInactiveLeads(
    @CurrentUser() user: any,
    @Query('daysNoOrder') daysNoOrder: number = 30,
  ) {
    const data = await this.leadService.getInactiveLeads(user.id, daysNoOrder);
    return successResponse('Inactive leads fetched successfully', data);
  }

  @Get(':id')
  async findById(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.leadService.findById(user.id, id);
    return successResponse('Lead fetched successfully', data);
  }

  // Support both PUT and PATCH
  @Put(':id')
  @Patch(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeadDto,
  ) {
    const data = await this.leadService.update(user.id, id, dto);
    return successResponse('Lead updated successfully', data);
  }

  // PUT /api/leads/:id/stage/:stageId  — stageId in URL
  // PATCH /api/leads/:id/stage/:stageId — alias
  @Put(':id/stage/:stageId')
  @Patch(':id/stage/:stageId')
  async updateStage(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('stageId', ParseIntPipe) stageId: number,
  ) {
    const data = await this.leadService.updateStage(user.id, id, stageId);
    return successResponse('Lead stage updated successfully', data);
  }

  @Put(':id/customer-type/:customerType')
  @Patch(':id/customer-type/:customerType')
  async updateCustomerType(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('customerType') customerType: CustomerType,
  ) {
    const data = await this.leadService.updateCustomerType(user.id, id, customerType);
    return successResponse('Lead customer type updated successfully', data);
  }

  @Get(':id/activities')
  async getActivities(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.leadService.getActivities(user.id, id);
    return successResponse('Lead activities fetched successfully', data);
  }

  @Put(':id/archive')
  @Patch(':id/archive')
  async archive(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.leadService.archive(user.id, id);
    return successResponse('Lead archived successfully', data);
  }

  @Put(':id/unarchive')
  @Patch(':id/unarchive')
  async unarchive(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.leadService.unarchive(user.id, id);
    return successResponse('Lead unarchived successfully', data);
  }

  @Delete(':id')
  async delete(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    await this.leadService.delete(user.id, id);
    return successResponse('Lead deleted successfully');
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  // POST /api/leads/:id/notes
  // Single:   { "text": "My note" }
  // Multiple: { "texts": ["Note 1", "Note 2"] }
  @Post(':id/notes')
  async addNote(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddNoteDto,
  ) {
    const texts = dto.texts?.length ? dto.texts : dto.text ? [dto.text] : [];
    const data = await this.leadService.addNotes(user.id, id, texts);
    return successResponse('Note(s) added successfully', data);
  }

  // PATCH /api/leads/:id/notes
  // Single:   { "id": "uuid", "text": "Updated text" }
  // Multiple: { "notes": [{ "id": "uuid1", "text": "..." }, { "id": "uuid2", "text": "..." }] }
  @Patch(':id/notes')
  @Put(':id/notes')
  async updateNote(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNoteDto,
  ) {
    const updates = dto.notes?.length
      ? dto.notes
      : dto.id && dto.text
        ? [{ id: dto.id, text: dto.text }]
        : [];
    const data = await this.leadService.updateNotes(user.id, id, updates);
    return successResponse('Note(s) updated successfully', data);
  }

  // DELETE /api/leads/:id/notes
  // Single:   { "id": "uuid" }
  // Multiple: { "ids": ["uuid1", "uuid2"] }
  @Delete(':id/notes')
  async deleteNote(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeleteNoteDto,
  ) {
    const ids = dto.ids?.length ? dto.ids : dto.id ? [dto.id] : [];
    const data = await this.leadService.deleteNotes(user.id, id, ids);
    return successResponse('Note(s) deleted successfully', data);
  }
}
