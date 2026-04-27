import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

@UseGuards(JwtAuthGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}

  /**
   * GET /api/campaigns
   * Returns all email + whatsapp QR campaigns merged, latest first, paginated.
   *
   * Query params:
   *   page    - default 1
   *   limit   - default 10
   *   type    - filter by 'email' | 'whatsapp' (optional)
   *   search  - filter by campaign name (optional)
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
    @Param('id') id: string,
  ) {
    const result = await this.service.findOne(user.id, type, Number(id));
    return successResponse('Campaign detail', result);
  }
}
