import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import * as planEntity from '../entities/plan.entity';

export class PlanFeatureInputDto {
  @IsNumber()
  id: number;

  @IsNumber()
  @IsOptional()
  limit?: number | null;
}

export class CreatePlanDto {
  @IsString()
  name: string;

  @IsNumber()
  price: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isBest?: boolean;

  @IsEnum(['day', 'week', 'month', 'year'])
  @IsOptional()
  interval?: planEntity.PlanInterval;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureInputDto)
  @IsOptional()
  featureIds?: PlanFeatureInputDto[];
}
