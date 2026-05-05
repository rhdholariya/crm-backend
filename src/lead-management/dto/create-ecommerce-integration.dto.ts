import { IsString, IsEnum, IsOptional, IsArray } from 'class-validator';
import { IntegrationPlatform } from '../entities/ecommerce-integration.entity';

export class CreateEcommerceIntegrationDto {
  @IsEnum(IntegrationPlatform)
  platform: IntegrationPlatform;

  @IsString()
  storeName: string;

  @IsOptional()
  @IsString()
  storeUrl?: string;

  @IsString()
  apiKey: string;

  @IsOptional()
  @IsString()
  apiSecret?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @IsOptional()
  @IsArray()
  webhookEvents?: string[];
}
