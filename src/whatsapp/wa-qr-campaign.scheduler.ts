import { Injectable, Logger } from '@nestjs/common';
import { WaQrCampaignService } from './wa-qr-campaign.service';

@Injectable()
export class WaQrCampaignScheduler {
  private readonly logger = new Logger(WaQrCampaignScheduler.name);

  constructor(private readonly service: WaQrCampaignService) {
    // Poll every 60 seconds for due scheduled campaigns
    setInterval(() => this.run(), 60_000);
  }

  private async run() {
    try {
      await this.service.dispatchScheduled();
    } catch (err: any) {
      this.logger.error(`[SCHEDULER] Error: ${err.message}`);
    }
  }
}
