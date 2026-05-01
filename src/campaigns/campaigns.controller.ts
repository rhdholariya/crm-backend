import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';
import { CreateUnifiedCampaignDto, UpdateUnifiedCampaignDto } from './dto/unified-campaign.dto';

@UseGuards(JwtAuthGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}

  /**
   * POST /api/campaigns
   * Body must include `type: 'email' | 'whatsapp'`
   */
  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateUnifiedCampaignDto) {
    const result = await this.service.create(user.id, dto);
    return successResponse('Campaign created successfully', result);
  }

  /**
   * GET /api/campaigns
   * Query: page, limit, type ('email'|'whatsapp'), search
   */
  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('type') type?: 'email' | 'whatsapp',
    @Query('search') search?: string,
  ) {
    const result = await this.service.findAll(
      user.id,
      Number(page),
      Number(limit),
      type,
      search,
    );
    return successResponse('Campaigns', result);
  }

  /**
   * GET /api/campaigns/:type/:id
   * type = 'email' | 'whatsapp'
   */
  @Get(':type/:id')
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('type') type: 'email' | 'whatsapp',
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.service.findOne(user.id, type, id);
    return successResponse('Campaign detail', result);
  }

  /**
   * PATCH /api/campaigns/:type/:id
   */
  @Patch(':type/:id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('type') type: 'email' | 'whatsapp',
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUnifiedCampaignDto,
  ) {
    const result = await this.service.update(user.id, type, id, dto);
    return successResponse('Campaign updated successfully', result);
  }

  /**
   * DELETE /api/campaigns/:type/:id
   */
  @Delete(':type/:id')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('type') type: 'email' | 'whatsapp',
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.service.remove(user.id, type, id);
    return successResponse(result.message);
  }

  /**
   * GET /api/campaigns/:type/:id/recipients
   */
  @Get(':type/:id/recipients')
  async getRecipients(
    @CurrentUser() user: AuthUser,
    @Param('type') type: 'email' | 'whatsapp',
    @Param('id', ParseIntPipe) id: number,
  ) {
    const recipients = await this.service.getRecipients(user.id, type, id);
    return successResponse('Recipients fetched successfully', recipients);
  }

  /**
   * POST /api/campaigns/:type/:id/send
   * Manually trigger dispatch for a draft/scheduled campaign
   */
  @Post(':type/:id/send')
  async send(
    @CurrentUser() user: AuthUser,
    @Param('type') type: 'email' | 'whatsapp',
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.send(user.id, type, id);
    return successResponse('Campaign dispatched successfully');
  }
}
