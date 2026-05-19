import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateCatalogueDto } from './create-catalogue.dto';
import { CatalogueStatus } from '../entities/catalogue.entity';

export class UpdateCatalogueDto extends PartialType(CreateCatalogueDto) {
  @IsOptional()
  @IsEnum(CatalogueStatus)
  status?: CatalogueStatus;
}
