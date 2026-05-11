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
import { EcommerceIntegrationService } from '../services/ecommerce-integration.service';
import { CreateEcommerceIntegrationDto } from '../dto/create-ecommerce-integration.dto';
import { IntegrationStatus } from '../entities/ecommerce-integration.entity';
import { successResponse } from '../../common/utils/response.util';

@Controller('ecommerce-integrations')
@UseGuards(JwtAuthGuard)
export class EcommerceIntegrationController {
  constructor(private integrationService: EcommerceIntegrationService) {}

  @Post()
  async create(@CurrentUser() user: any, @Body() dto: CreateEcommerceIntegrationDto) {
    const data = await this.integrationService.create(user.id, dto);
    return successResponse('Integration created successfully', data);
  }

  @Get()
  async findAll(@CurrentUser() user: any) {
    const data = await this.integrationService.findAll(user.id);
    return successResponse('Integrations fetched successfully', data);
  }

  @Get('platform/:platform')
  async getByPlatform(@CurrentUser() user: any, @Param('platform') platform: string) {
    const data = await this.integrationService.getByPlatform(user.id, platform);
    return successResponse('Integrations fetched successfully', data);
  }

  @Get(':id')
  async findById(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const data = await this.integrationService.findById(user.id, id);
    return successResponse('Integration fetched successfully', data);
  }

  @Put(':id')
  @Patch(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateEcommerceIntegrationDto>,
  ) {
    const data = await this.integrationService.update(user.id, id, dto);
    return successResponse('Integration updated successfully', data);
  }

  @Put(':id/status')
  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: IntegrationStatus },
  ) {
    const data = await this.integrationService.updateStatus(user.id, id, body.status);
    return successResponse('Integration status updated successfully', data);
  }

  @Delete(':id')
  async delete(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    await this.integrationService.delete(user.id, id);
    return successResponse('Integration deleted successfully');
  }
}
