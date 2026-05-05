import { IsString, IsEnum, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { WebhookEventType } from '../entities/field-mapping.entity';

export class CreateFieldMappingDto {
  @IsNumber()
  integrationId: number;

  @IsEnum(WebhookEventType)
  eventType: WebhookEventType;

  @IsString()
  externalFieldPath: string;

  @IsString()
  leadFieldName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsString()
  transformationLogic?: string;
}
