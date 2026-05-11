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
import { FieldMappingService } from '../services/field-mapping.service';
import { CreateFieldMappingDto } from '../dto/create-field-mapping.dto';
import { successResponse } from '../../common/utils/response.util';

@Controller('field-mappings')
@UseGuards(JwtAuthGuard)
export class FieldMappingController {
  constructor(private mappingService: FieldMappingService) {}

  @Post()
  async create(@Body() dto: CreateFieldMappingDto) {
    const data = await this.mappingService.create(dto);
    return successResponse('Field mapping created successfully', data);
  }

  @Get('integration/:integrationId')
  async findAll(@Param('integrationId', ParseIntPipe) integrationId: number) {
    const data = await this.mappingService.findAll(integrationId);
    return successResponse('Field mappings fetched successfully', data);
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    const data = await this.mappingService.findById(id);
    return successResponse('Field mapping fetched successfully', data);
  }

  @Put(':id')
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateFieldMappingDto>,
  ) {
    const data = await this.mappingService.update(id, dto);
    return successResponse('Field mapping updated successfully', data);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.mappingService.delete(id);
    return successResponse('Field mapping deleted successfully');
  }
}
