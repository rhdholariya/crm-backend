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
import { FieldMappingService } from '../services/field-mapping.service';
import { CreateFieldMappingDto } from '../dto/create-field-mapping.dto';

@Controller('field-mappings')
@UseGuards(JwtAuthGuard)
export class FieldMappingController {
  constructor(private mappingService: FieldMappingService) {}

  @Post()
  async create(@Body() createMappingDto: CreateFieldMappingDto) {
    return this.mappingService.create(createMappingDto);
  }

  @Get('integration/:integrationId')
  async findAll(@Param('integrationId') integrationId: number) {
    return this.mappingService.findAll(integrationId);
  }

  @Get(':id')
  async findById(@Param('id') id: number) {
    return this.mappingService.findById(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: number,
    @Body() updateData: Partial<CreateFieldMappingDto>,
  ) {
    return this.mappingService.update(id, updateData);
  }

  @Delete(':id')
  async delete(@Param('id') id: number) {
    return this.mappingService.delete(id);
  }
}
