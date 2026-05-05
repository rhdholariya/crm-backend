import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { EcommerceIntegrationService } from '../services/ecommerce-integration.service';
import { CreateEcommerceIntegrationDto } from '../dto/create-ecommerce-integration.dto';
import { IntegrationStatus } from '../entities/ecommerce-integration.entity';

@Controller('ecommerce-integrations')
@UseGuards(JwtAuthGuard)
export class EcommerceIntegrationController {
  constructor(private integrationService: EcommerceIntegrationService) {}

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body() createIntegrationDto: CreateEcommerceIntegrationDto,
  ) {
    return this.integrationService.create(user.id, createIntegrationDto);
  }

  @Get()
  async findAll(@CurrentUser() user: any) {
    return this.integrationService.findAll(user.id);
  }

  @Get(':id')
  async findById(@CurrentUser() user: any, @Param('id') id: number) {
    return this.integrationService.findById(user.id, id);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: number,
    @Body() updateData: Partial<CreateEcommerceIntegrationDto>,
  ) {
    return this.integrationService.update(user.id, id, updateData);
  }

  @Put(':id/status')
  async updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: number,
    @Body() { status }: { status: IntegrationStatus },
  ) {
    return this.integrationService.updateStatus(user.id, id, status);
  }

  @Delete(':id')
  async delete(@CurrentUser() user: any, @Param('id') id: number) {
    return this.integrationService.delete(user.id, id);
  }

  @Get('platform/:platform')
  async getByPlatform(
    @CurrentUser() user: any,
    @Param('platform') platform: string,
  ) {
    return this.integrationService.getByPlatform(user.id, platform);
  }
}
