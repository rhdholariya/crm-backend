// plans/plans.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { StripeService } from '../stripe/stripe.service';
import { PaymentSettingsService } from '../payment-settings/payment-settings.service';
import { FeaturesService } from '../features/features.service';
import { CurrencyService } from '../currency/currency.service';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private planRepo: Repository<Plan>,
    private stripeService: StripeService,
    private paymentSettingsService: PaymentSettingsService,
    private featuresService: FeaturesService,
    private currencyService: CurrencyService,
  ) {}

  async getPlans(roleId: number) {
    const plans = await (roleId === 1
      ? this.planRepo.find({ order: { price: 'ASC' } })
      : this.planRepo.find({
          where: { isActive: true },
          order: { price: 'ASC' },
        }));

    let currency = 'usd';
    try {
      // First try the new currencies table (active currency by code from payment-settings)
      const setting = await this.paymentSettingsService.findOne('currency');
      const found = await this.currencyService.findByCode(setting.value);
      currency = found.code.toLowerCase();
    } catch {
      // fall back to USD
    }

    const plansWithFeatures = await Promise.all(
      plans.map(async (plan) => {
        const features = await this.featuresService.getPlanFeatures(plan.id);
        return { ...plan, currency, features };
      }),
    );

    return plansWithFeatures;
  }

  async createPlan(dto: CreatePlanDto) {
    const { productId, priceId } = await this.stripeService.createStripeProduct(
      {
        name: dto.name,
        price: dto.price,
        interval: dto.interval ?? 'month',
      },
    );

    const { featureIds, ...planData } = dto;

    const plan = await this.planRepo.save(
      this.planRepo.create({
        ...planData,
        stripeProductId: productId,
        stripePriceId: priceId,
      }),
    );

    await this.featuresService.syncPlanFeatures(plan.id, featureIds ?? []);

    const features = await this.featuresService.getPlanFeatures(plan.id);
    return { ...plan, features };
  }

  async getPlanById(id: number) {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    const features = await this.featuresService.getPlanFeatures(id);
    return { ...plan, features };
  }

  async updatePlan(id: number, dto: UpdatePlanDto) {
    const plan = await this.getPlanById(id);

    if (dto.name && plan.stripeProductId) {
      await this.stripeService.updateStripeProduct({
        productId: plan.stripeProductId,
        name: dto.name,
      });
    }

    let newPriceId = plan.stripePriceId;

    if (
      (dto.price && dto.price !== Number(plan.price)) ||
      (dto.interval && dto.interval !== plan.interval)
    ) {
      const priceData = await this.stripeService.createStripePrice({
        productId: plan.stripeProductId,
        price: dto.price ?? Number(plan.price),
        interval: dto.interval ?? plan.interval,
      });

      newPriceId = priceData.priceId;

      if (plan.stripePriceId) {
        await this.stripeService.archiveStripePrice(plan.stripePriceId);
      }
    }

    const { featureIds, ...updateData } = dto;

    await this.planRepo.update(id, {
      ...updateData,
      stripePriceId: newPriceId,
    });

    if (featureIds !== undefined) {
      await this.featuresService.syncPlanFeatures(id, featureIds);
    }

    const updated = await this.getPlanById(id);
    const features = await this.featuresService.getPlanFeatures(id);
    return { ...updated, features };
  }

  async deletePlan(id: number) {
    const plan = await this.getPlanById(id);

    // Archive on Stripe (can't delete products/prices that have been used)
    if (plan.stripeProductId) {
      await this.stripeService.updateStripeProduct({
        productId: plan.stripeProductId,
        active: false,
      });
    }

    if (plan.stripePriceId) {
      await this.stripeService.archiveStripePrice(plan.stripePriceId);
    }

    await this.planRepo.update(id, { isActive: false });
    await this.planRepo.softDelete(id);

    return { message: 'Plan deleted successfully' };
  }
}
