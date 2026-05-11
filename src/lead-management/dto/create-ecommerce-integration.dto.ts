import { IsString, IsEnum, IsOptional, IsArray, IsUrl } from 'class-validator';
import { IntegrationPlatform } from '../entities/ecommerce-integration.entity';

export class CreateEcommerceIntegrationDto {
  @IsEnum(IntegrationPlatform)
  platform: IntegrationPlatform;

  @IsString()
  storeName: string;

  @IsOptional()
  @IsUrl(
    { require_protocol: false },
    { message: 'storeUrl must be a valid URL (e.g. mystore.myshopify.com or https://mystore.com)' },
  )
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
