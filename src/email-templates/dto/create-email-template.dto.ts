import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';

export class CreateEmailTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  parameters?: string[];
}
