import { IsString, IsOptional, IsArray } from 'class-validator';

export class UpdateEmailTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  parameters?: string[];
}
