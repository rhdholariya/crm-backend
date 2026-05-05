import {
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  ValidateNested,
  IsArray,
  Allow,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  TemplateCategory,
  HeaderFormat,
  TemplateType,
  TemplateStatus,
} from '../entities/whatsapp-template.entity';

// ── Dynamic Parameter ────────────────────────────────────────────────────────

export class DynamicParameterDto {
  @IsString()
  field: string;

  @IsString()
  value: string;
}

// ── Named Parameter Example ──────────────────────────────────────────────────

export class NamedParameterExampleDto {
  @IsString()
  param_name: string;

  @IsString()
  example: string;
}

// ── Body Text Named Params Example ──────────────────────────────────────────

export class BodyTextNamedParamsExampleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NamedParameterExampleDto)
  body_text_named_params: NamedParameterExampleDto[];
}

// ── Header Text Named Params Example ────────────────────────────────────────

export class HeaderTextNamedParamsExampleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NamedParameterExampleDto)
  header_text_named_params: NamedParameterExampleDto[];
}

// ── Component ────────────────────────────────────────────────────────────────

export class ComponentDto {
  @IsString()
  type: string; // "HEADER", "BODY", "FOOTER", "BUTTONS"

  @IsOptional()
  @IsEnum(HeaderFormat)
  format?: HeaderFormat;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsObject()
  example?: any;

  @IsOptional()
  @IsArray()
  buttons?: any[];
}

// ── Create Meta Template ────────────────────────────────────────────────────

export class CreateMetaTemplateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsEnum(TemplateCategory)
  category: TemplateCategory;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComponentDto)
  @Allow()
  components: ComponentDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DynamicParameterDto)
  @Allow()
  dynamicParameters?: DynamicParameterDto[];
}

// ── Update Meta Template ────────────────────────────────────────────────────

export class UpdateMetaTemplateDto {
  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComponentDto)
  components?: ComponentDto[];
}

// ── Send Template Message ───────────────────────────────────────────────────

export class SendMetaTemplateDto {
  @IsString()
  to: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DynamicParameterDto)
  @Allow()
  dynamicParameters?: DynamicParameterDto[];
}

// ── List Templates Query ────────────────────────────────────────────────────

export class ListMetaTemplatesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(TemplateStatus)
  status?: TemplateStatus;

  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
