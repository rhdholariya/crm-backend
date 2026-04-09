// payments/payments.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Payment } from './entities/payment.entity';
import { StripeModule } from '../stripe/stripe.module';
import { PlansModule } from '../plans/plans.module';
import { UserSubscription } from './entities/user-subscription.entity';
import { Invoice } from './entities/invoice.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, UserSubscription, Invoice]),
    StripeModule,
    PlansModule,
    UsersModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
