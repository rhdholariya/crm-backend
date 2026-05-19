import { PartialType } from '@nestjs/mapped-types';
import { CreateCatalogueProductDto } from './create-catalogue-product.dto';

export class UpdateCatalogueProductDto extends PartialType(
  CreateCatalogueProductDto,
) {}
