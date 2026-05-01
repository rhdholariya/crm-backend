import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppGateway } from './whatsapp.gateway';
import { WhatsAppMetaService } from './whatsapp-meta.service';
import { WhatsAppMetaController } from './whatsapp-meta.controller';
import { WhatsAppConfig } from './entities/whatsapp-config.entity';
import { WhatsAppTemplate } from './entities/whatsapp-template.entity';
import { WhatsAppMessage } from './entities/whatsapp-message.entity';
import { WaQrTemplate } from './entities/wa-qr-template.entity';
import { WaQrCampaign } from './entities/wa-qr-campaign.entity';
import { WaQrCampaignRecipient } from './entities/wa-qr-campaign-recipient.entity';
import { WaQrTemplateService } from './wa-qr-template.service';
import { WaQrTemplateController } from './wa-qr-template.controller';
import { WaQrCampaignService } from './wa-qr-campaign.service';
import { WaQrCampaignController } from './wa-qr-campaign.controller';
import { WaQrCampaignScheduler } from './wa-qr-campaign.scheduler';
import { ContactsModule } from '../contacts/contacts.module';
import { Contact } from '../contacts/entities/contact.entity';
import { FlowBuilderModule } from '../flow-builder/flow-builder.module';
import { AiChatbotModule } from '../ai-chatbot/ai-chatbot.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsAppConfig,
      WhatsAppTemplate,
      WhatsAppMessage,
      WaQrTemplate,
      WaQrCampaign,
      WaQrCampaignRecipient,
      Contact,
    ]),
    ContactsModule,
    FlowBuilderModule,
    AiChatbotModule,
  ],
  controllers: [WhatsAppController, WhatsAppMetaController, WaQrTemplateController, WaQrCampaignController],
  providers: [WhatsAppService, WhatsAppGateway, WhatsAppMetaService, WaQrTemplateService, WaQrCampaignService, WaQrCampaignScheduler],
  exports: [WhatsAppService, WhatsAppMetaService, WaQrTemplateService, WaQrCampaignService],
})
export class WhatsAppModule {}
