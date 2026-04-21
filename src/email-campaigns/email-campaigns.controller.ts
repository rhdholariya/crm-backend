import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { EmailCampaignsService } from './email-campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

@UseGuards(JwtAuthGuard)
@Controller('email-campaigns')
export class EmailCampaignsController {
  constructor(private readonly service: EmailCampaignsService) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateCampaignDto) {
    const campaign = await this.service.create(user.id, dto);
    return successResponse('Campaign created successfully', campaign);
  }

  @Get()
  async findAll(@CurrentUser() user: AuthUser) {
    const campaigns = await this.service.findAll(user.id);
    return successResponse('Campaigns fetched successfully', campaigns);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const campaign = await this.service.findOne(user.id, id);
    return successResponse('Campaign fetched successfully', campaign);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCampaignDto,
  ) {
    const campaign = await this.service.update(user.id, id, dto);
    return successResponse('Campaign updated successfully', campaign);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.service.remove(user.id, id);
    return successResponse(result.message);
  }

  @Get(':id/recipients')
  async getRecipients(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const recipients = await this.service.getRecipients(user.id, id);
    return successResponse('Recipients fetched successfully', recipients);
  }

  // Manually trigger dispatch for a scheduled/draft campaign
  @Post(':id/send')
  async send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.findOne(user.id, id); // ownership check
    await this.service.dispatch(id, user.id);
    return successResponse('Campaign dispatched successfully');
  }
}
