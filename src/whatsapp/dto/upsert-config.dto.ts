import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertConfigDto {
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
