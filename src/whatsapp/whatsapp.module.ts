import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppGateway } from './whatsapp.gateway';
// import { WhatsAppMetaService } from './whatsapp-meta.service';
// import { WhatsAppMetaController } from './whatsapp-meta.controller';
// import { WhatsAppConfig } from './entities/whatsapp-config.entity';
// import { WhatsAppTemplate } from './entities/whatsapp-template.entity';
// import { WhatsAppMessage } from './entities/whatsapp-message.entity';

@Module({
  imports: [TypeOrmModule.forFeature()],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppGateway],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
