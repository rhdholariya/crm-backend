import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Catalogue } from './entities/catalogue.entity';
import { CatalogueProduct } from './entities/catalogue-product.entity';
import { CatalogueService } from './services/catalogue.service';
import { CatalogueSyncService } from './services/catalogue-sync.service';
import { CatalogueShareService } from './services/catalogue-share.service';
import { CatalogueController } from './controllers/catalogue.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { EcommerceIntegration } from '../lead-management/entities/ecommerce-integration.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Catalogue,
      CatalogueProduct,
      EcommerceIntegration,
    ]),
    WhatsAppModule,
  ],
  controllers: [CatalogueController],
  providers: [CatalogueService, CatalogueSyncService, CatalogueShareService],
  exports: [CatalogueService, CatalogueSyncService, CatalogueShareService],
})
export class CataloguesModule {}
