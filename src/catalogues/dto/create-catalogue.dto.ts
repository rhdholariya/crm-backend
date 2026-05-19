import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsPositive,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CatalogueSource } from '../entities/catalogue.entity';

export class CreateCatalogueDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(CatalogueSource)
  source?: CatalogueSource;

  @IsOptional()
  @IsInt()
  @IsPositive()
  integrationId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;
}
