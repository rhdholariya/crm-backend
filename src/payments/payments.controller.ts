// payments/payments.controller.ts
import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  Headers,
  UseGuards,
  BadRequestException,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/entities/auth-user.entity';
import { successResponse } from '../common/utils/response.util';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // One-time payment
  @UseGuards(JwtAuthGuard)
  @Post('checkout/:planId')
  async checkout(
    @Param('planId') planId: number,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.paymentsService.initiatePayment(
      user.id,
      user.email,
      Number(planId),
    );
    return successResponse('Checkout session created', result);
  }

  // Subscription
  @UseGuards(JwtAuthGuard)
  @Post('subscribe/:planId')
  async subscribe(
    @Param('planId') planId: number,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.paymentsService.initiateSubscription(
      user.id,
      user.email,
      Number(planId),
    );
    return successResponse('Subscription session created', result);
  }

  // Cancel subscription
  @UseGuards(JwtAuthGuard)
  @Post('cancel-subscription')
  async cancelSubscription(@CurrentUser() user: AuthUser) {
    const result = await this.paymentsService.cancelSubscription(user.id);
    return successResponse(result.message);
  }

  // Stripe webhook
  @Post('webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw body');
    }
    return this.paymentsService.handleWebhook(req.rawBody, signature);
  }

  // Payment history
  @UseGuards(JwtAuthGuard)
  @Get('my-payments')
  async myPayments(
    @CurrentUser() user: AuthUser,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    const result = await this.paymentsService.getPaymentsByUser(
      user.id,
      Number(page),
      Number(limit),
    );
    return successResponse('Success', result);
  }

  // Billing portal — manage subscription, update card, cancel, etc.
  @UseGuards(JwtAuthGuard)
  @Post('billing-portal')
  async billingPortal(@CurrentUser() user: AuthUser) {
    const result = await this.paymentsService.getBillingPortalUrl(user.id);
    return successResponse('Billing portal URL generated', result);
  }

  // Active subscription
  @UseGuards(JwtAuthGuard)
  @Get('my-subscription')
  async mySubscription(@CurrentUser() user: AuthUser) {
    const subscription = await this.paymentsService.getActiveSubscription(
      user.id,
    );
    if (!subscription) {
      return successResponse('No active plan', null);
    }
    return successResponse('Success', subscription);
  }

  // Admin — all customer plans
  @UseGuards(JwtAuthGuard)
  @Get('admin/customer-plans')
  async adminCustomerPlans(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search = '',
  ) {
    if (user.roleId !== 1) {
      return successResponse('Forbidden', null);
    }
    const result = await this.paymentsService.getAllCustomerPlans(page, limit, search);
    return successResponse('Customer plans fetched successfully', result);
  }

  // Admin — all user payments (latest/newest first)
  @UseGuards(JwtAuthGuard)
  @Get('admin/all-payments')
  async adminAllPayments(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    if (user.roleId !== 1) {
      return successResponse('Forbidden', null);
    }
    const result = await this.paymentsService.getAllPayments(
      page,
      limit,
      status,
      type,
      search,
    );
    return successResponse('All payments fetched successfully', result);
  }
}
