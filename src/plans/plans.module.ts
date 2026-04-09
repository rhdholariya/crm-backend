import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { StripeModule } from '../stripe/stripe.module';
import { PaymentSettingsModule } from '../payment-settings/payment-settings.module';
import { FeaturesModule } from '../features/features.module';

@Module({
  imports: [TypeOrmModule.forFeature([Plan]), StripeModule, PaymentSettingsModule, FeaturesModule],
  providers: [PlansService],
  controllers: [PlansController],
  exports: [PlansService],
})
export class PlansModule {}
