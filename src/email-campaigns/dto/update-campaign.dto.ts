import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsArray,
  IsDateString,
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

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
