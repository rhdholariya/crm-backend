import { Injectable, Logger } from '@nestjs/common';
import { EmailCampaignsService } from './email-campaigns.service';

@Injectable()
export class EmailCampaignsScheduler {
  private readonly logger = new Logger(EmailCampaignsScheduler.name);
  private intervalRef: ReturnType<typeof setInterval>;

  constructor(private readonly campaignsService: EmailCampaignsService) {
    // Poll every 60 seconds for due scheduled campaigns
    this.intervalRef = setInterval(() => this.run(), 60_000);
  }

  private async run() {
    try {
      this.logger.log('Checking for scheduled campaigns...');
      await this.campaignsService.dispatchScheduledCampaigns();
    } catch (err) {
      this.logger.error('Scheduler error', err);
    }
  }

  onModuleDestroy() {
    clearInterval(this.intervalRef);
  }
}
