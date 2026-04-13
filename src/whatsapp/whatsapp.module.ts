import { Module } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppGateway } from './whatsapp.gateway';

@Module({
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppGateway],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
