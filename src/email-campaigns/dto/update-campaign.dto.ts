import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsArray,
  IsDateString,
  IsObject,
} from 'class-validator';
import { RecipientType } from '../entities/email-campaign.entity';

export class UpdateCampaignDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  templateId?: number;

  @IsEnum(RecipientType)
  @IsOptional()
  recipientType?: RecipientType;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  selectedContactIds?: number[];

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  selectedTagIds?: number[];

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  excludeTagIds?: number[];

  @IsObject()
  @IsOptional()
  params?: Record<string, string>;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
