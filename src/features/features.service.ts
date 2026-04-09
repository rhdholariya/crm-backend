import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feature } from './entities/feature.entity';
import { PlanFeature } from './entities/plan-feature.entity';
import { CreateFeatureDto } from './dto/create-feature.dto';

@Injectable()
export class FeaturesService {
  constructor(
    @InjectRepository(Feature)
    private featureRepo: Repository<Feature>,
    @InjectRepository(PlanFeature)
    private planFeatureRepo: Repository<PlanFeature>,
  ) {}

  findAll() {
    return this.featureRepo.find({ where: { isActive: true } });
  }

  async create(dto: CreateFeatureDto) {
    return this.featureRepo.save(this.featureRepo.create(dto));
  }

  async remove(id: number) {
    const feature = await this.featureRepo.findOne({ where: { id } });
    if (!feature) throw new NotFoundException('Feature not found');
    await this.featureRepo.remove(feature);
    return { message: 'Feature deleted successfully' };
  }

  // Upsert — never generates new PKs for existing (planId, featureId) pairs
  async syncPlanFeatures(
    planId: number,
    selectedFeatures: { id: number; limit?: number | null }[],
  ) {
    const allFeatures = await this.featureRepo.find({
      where: { isActive: true },
    });
    if (!allFeatures.length) return [];

    const selectedMap = new Map(
      selectedFeatures.map((f) => [f.id, f.limit ?? null]),
    );

    const records = allFeatures.map((feature) => ({
      planId,
      featureId: feature.id,
      isEnabled: selectedMap.has(feature.id),
      limitValue: selectedMap.get(feature.id) ?? null,
    }));

    await this.planFeatureRepo
      .createQueryBuilder()
      .insert()
      .into(PlanFeature)
      .values(records)
      .orUpdate(['isEnabled', 'limitValue'], ['planId', 'featureId'])
      .execute();

    return this.planFeatureRepo.find({ where: { planId } });
  }

  getPlanFeatures(planId: number) {
    return this.planFeatureRepo.find({
      where: { planId },
      relations: ['feature'],
    });
  }
}
