import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertConfigDto {
  @IsOptional()
  @IsString()
  whatsAppAppId?: string;

  @IsNotEmpty()
  @IsString()
  accessToken: string;

  @IsNotEmpty()
  @IsString()
  phoneNumberId: string;

  @IsNotEmpty()
  @IsString()
  wabaId: string;

  @IsOptional()
  @IsString()
  webhookVerifyToken?: string;
}
