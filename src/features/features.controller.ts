import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FeaturesService } from './features.service';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { successResponse } from '../common/utils/response.util';

@Controller('features')
export class FeaturesController {
  constructor(private readonly featuresService: FeaturesService) {}

  @Get()
  async findAll() {
    const features = await this.featuresService.findAll();
    return successResponse('Success', features);
  }

  @Post()
  async create(@Body() dto: CreateFeatureDto) {
    const feature = await this.featuresService.create(dto);
    return successResponse('Feature created successfully', feature);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: number) {
    const result = await this.featuresService.remove(Number(id));
    return successResponse(result.message);
  }
}
