import { IsNotEmpty, IsOptional, IsString, IsObject } from 'class-validator';

export class SendMetaMessageDto {
  @IsNotEmpty()
  @IsString()
  to: string;

  @IsNotEmpty()
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsObject()
  templateParams?: Record<string, string>;
}
