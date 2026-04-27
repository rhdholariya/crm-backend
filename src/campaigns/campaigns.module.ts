import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { EmailCampaign } from '../email-campaigns/entities/email-campaign.entity';
import { CampaignRecipient } from '../email-campaigns/entities/campaign-recipient.entity';
import { WaQrCampaign } from '../whatsapp/entities/wa-qr-campaign.entity';
import { WaQrCampaignRecipient } from '../whatsapp/entities/wa-qr-campaign-recipient.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EmailCampaign, CampaignRecipient, WaQrCampaign, WaQrCampaignRecipient])],
  controllers: [CampaignsController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
