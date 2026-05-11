import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadSource, CustomerType } from '../entities/lead.entity';

export class LeadNoteDto {
  @IsString()
  text: string;
}

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeadNoteDto)
  notesList?: LeadNoteDto[];

  @IsNumber()
  stageId: number;

  @IsOptional()
  customFields?: Record<string, any>;
}
