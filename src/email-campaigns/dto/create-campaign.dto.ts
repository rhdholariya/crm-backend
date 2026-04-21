import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsArray,
  IsDateString,
} from 'class-validator';
import { RecipientType } from '../entities/email-campaign.entity';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  templateId: number;

  @IsEnum(RecipientType)
  recipientType: RecipientType;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  selectedContactIds?: number[];

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  selectedTagIds?: number[];

  // If provided, campaign is scheduled; otherwise sent immediately
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
