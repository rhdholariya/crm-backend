// stripe/stripe.module.ts
import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { PaymentSettingsModule } from '../payment-settings/payment-settings.module';

@Module({
  imports: [PaymentSettingsModule],
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
