import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  QrButtonType,
  QrHeaderFormat,
  QrTemplateCategory,
  QrTemplateStatus,
} from '../entities/wa-qr-template.entity';

// ── Sub-DTOs ──────────────────────────────────────────────────────────────────

export class QrTemplateHeaderDto {
  @IsEnum(QrHeaderFormat)
  format: QrHeaderFormat;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  filename?: string;
}

export class QrTemplateButtonDto {
  @IsEnum(QrButtonType)
  type: QrButtonType;

  @IsNotEmpty()
  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}

export class QrTemplateComponentsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => QrTemplateHeaderDto)
  header?: QrTemplateHeaderDto;

  @IsNotEmpty()
  @IsString()
  body: string;

  @IsOptional()
  @IsString()
  footer?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QrTemplateButtonDto)
  buttons?: QrTemplateButtonDto[];
}

// ── Create ────────────────────────────────────────────────────────────────────

export class CreateQrTemplateDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsEnum(QrTemplateCategory)
  category?: QrTemplateCategory;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => QrTemplateComponentsDto)
  components: QrTemplateComponentsDto;
}

// ── Update ────────────────────────────────────────────────────────────────────

export class UpdateQrTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsEnum(QrTemplateCategory)
  category?: QrTemplateCategory;

  @IsOptional()
  @IsEnum(QrTemplateStatus)
  status?: QrTemplateStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => QrTemplateComponentsDto)
  components?: QrTemplateComponentsDto;
}

// ── Send ──────────────────────────────────────────────────────────────────────

export class SendQrTemplateDto {
  @IsNotEmpty()
  @IsString()
  to: string;

  /** If provided, contact fields (name, email, phoneNumber, note) are auto-filled */
  @IsOptional()
  contactId?: number;

  /** Key-value map to resolve {{paramName}} placeholders */
  @IsOptional()
  params?: Record<string, string>;
}
