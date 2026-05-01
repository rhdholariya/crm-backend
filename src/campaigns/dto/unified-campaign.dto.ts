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

export enum CampaignType {
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
}

export enum UnifiedRecipientType {
  ALL = 'all',
  SELECTED = 'selected',
  BY_TAGS = 'by_tags',
  EXCLUDE_TAGS = 'exclude_tags',
}

export class CreateUnifiedCampaignDto {
  @IsEnum(CampaignType)
  type: CampaignType;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  templateId: number;

  @IsEnum(UnifiedRecipientType)
  recipientType: UnifiedRecipientType;

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

  /** WhatsApp only: static params merged with contact fields */
  @IsObject()
  @IsOptional()
  params?: Record<string, string>;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}

export class UpdateUnifiedCampaignDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  templateId?: number;

  @IsEnum(UnifiedRecipientType)
  @IsOptional()
  recipientType?: UnifiedRecipientType;

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

  @IsObject()
  @IsOptional()
  params?: Record<string, string>;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
