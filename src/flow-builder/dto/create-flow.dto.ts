import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsObject,
  Min,
  MaxLength,
} from 'class-validator';
import { FlowStatus, FlowTriggerType } from '../entities/flow.entity';

export class CreateFlowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsEnum(FlowTriggerType)
  triggerType: FlowTriggerType;

  @IsObject()
  @IsOptional()
  triggerConfig?: Record<string, any>;

  @IsObject()
  @IsOptional()
  variables?: Record<string, any>;

  @IsEnum(FlowStatus)
  @IsOptional()
  status?: FlowStatus;

  @IsBoolean()
  @IsOptional()
  isTemplate?: boolean;

  @IsString()
  @IsOptional()
  language?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  rateLimitPerUser?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  rateLimitGlobal?: number;

  @IsBoolean()
  @IsOptional()
  abTestingEnabled?: boolean;

  @IsObject()
  @IsOptional()
  abTestConfig?: Record<string, any>;
}
