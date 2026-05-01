import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsArray,
  IsDateString,
  IsObject,
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

  /** Contacts whose tags match ANY of these IDs will be excluded */
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  excludeTagIds?: number[];

  /** Extra params merged with contact fields during template rendering e.g. { "discount": "20" } */
  @IsObject()
  @IsOptional()
  params?: Record<string, string>;

  // If provided, campaign is scheduled; otherwise sent immediately
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
