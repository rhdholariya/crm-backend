import { PartialType } from '@nestjs/mapped-types';
import { CreateLeadDto } from './create-lead.dto';
import { IsOptional, IsEnum, IsNumber } from 'class-validator';
import { CustomerType } from '../entities/lead.entity';

export class UpdateLeadDto extends PartialType(CreateLeadDto) {
  @IsOptional()
  @IsNumber()
  stageId?: number;

  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
  isArchived?: boolean;
}
