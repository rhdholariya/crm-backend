import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TemplateCategory, TemplateType } from '../entities/whatsapp-template.entity';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  headerText?: string;

  @IsOptional()
  @IsString()
  footerText?: string;

  @IsOptional()
  @IsEnum(TemplateType)
  type?: TemplateType;

  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;
}
