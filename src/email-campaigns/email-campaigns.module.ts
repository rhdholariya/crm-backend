import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailCampaign } from './entities/email-campaign.entity';
import { CampaignRecipient } from './entities/campaign-recipient.entity';
import { EmailCampaignsService } from './email-campaigns.service';
import { EmailCampaignsController } from './email-campaigns.controller';
import { EmailCampaignsScheduler } from './email-campaigns.scheduler';
import { Contact } from '../contacts/entities/contact.entity';
import { EmailTemplate } from '../email-templates/entities/email-template.entity';
import { User } from '../users/entities/user.entity';
import { MailService } from '../common/services/mail.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmailCampaign,
      CampaignRecipient,
      Contact,
      EmailTemplate,
      User,
    ]),
  ],
  controllers: [EmailCampaignsController],
  providers: [EmailCampaignsService, EmailCampaignsScheduler, MailService],
})
export class EmailCampaignsModule {}
