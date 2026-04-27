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
import { WaRecipientType } from '../entities/wa-qr-campaign.entity';

export class CreateWaCampaignDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  templateId: number;

  @IsEnum(WaRecipientType)
  recipientType: WaRecipientType;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  selectedContactIds?: number[];

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  selectedTagIds?: number[];

  /** Static params applied to all recipients. {{name}} is always auto-filled per contact. */
  @IsObject()
  @IsOptional()
  params?: Record<string, string>;

  /** If provided, campaign is scheduled; otherwise sent immediately */
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}

export class UpdateWaCampaignDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  templateId?: number;

  @IsEnum(WaRecipientType)
  @IsOptional()
  recipientType?: WaRecipientType;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  selectedContactIds?: number[];

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  selectedTagIds?: number[];

  @IsObject()
  @IsOptional()
  params?: Record<string, string>;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
