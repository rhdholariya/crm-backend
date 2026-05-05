import { IsString, IsEmail, IsOptional, IsEnum, IsNumber } from 'class-validator';
import { LeadSource, CustomerType } from '../entities/lead.entity';

export class CreateLeadDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
  @IsNumber()
  totalOrderValue?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsNumber()
  stageId: number;

  @IsOptional()
  customFields?: Record<string, any>;
}
