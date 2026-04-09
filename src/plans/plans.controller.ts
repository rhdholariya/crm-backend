import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { PlansService } from './plans.service';
import { successResponse } from '../common/utils/response.util';
import { CreatePlanDto } from './dto/create-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getPlans(@CurrentUser() user: AuthUser) {
    const plans = await this.plansService.getPlans(user.roleId);
    return successResponse('Success', plans);
  }

  @Get(':id')
  async getPlan(@Param('id') id: number) {
    const plan = await this.plansService.getPlanById(Number(id));

    return successResponse('Success', plan);
  }

  @Put(':id')
  async updatePlan(@Param('id') id: number, @Body() dto: UpdatePlanDto) {
    const updated = await this.plansService.updatePlan(Number(id), dto);

    return successResponse('Plan updated successfully', updated);
  }

  @Post()
  async createPlan(@Body() dto: CreatePlanDto) {
    const plan = await this.plansService.createPlan(dto);

    return {
      success: true,
      message: 'Plan Created successfully',
      data: plan,
    };
  }

  @Delete(':id')
  async deletePlan(@Param('id') id: number) {
    const result = await this.plansService.deletePlan(Number(id));
    return successResponse(result.message);
  }
}
