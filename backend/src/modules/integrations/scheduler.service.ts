import { Injectable, Logger } from '@nestjs/common';
import { PollingClient, PollingService, PullSummary } from './polling.service';
import { PollingRepository } from './polling.repository';

@Injectable()
export class IntegrationsSchedulerService {
  private readonly logger = new Logger(IntegrationsSchedulerService.name);

  constructor(
    private readonly pollingService: PollingService,
    private readonly pollingRepository: PollingRepository
  ) {}

  async runSlot(tenantId: string, connectorId: string, intervalMinutes: number, client: PollingClient, now = new Date()): Promise<PullSummary | null> {
    const slot = this.floorToSlot(now, intervalMinutes);
    const shouldRun = this.pollingRepository.markScheduleSlot(tenantId, connectorId, slot.toISOString());
    if (!shouldRun) {
      this.logger.debug(`Skipping pull for ${tenantId}/${connectorId}; slot ${slot.toISOString()} already completed.`);
      return null;
    }

    return this.pollingService.pullFromApi(tenantId, connectorId, client, now.toISOString());
  }

  private floorToSlot(timestamp: Date, intervalMinutes: number): Date {
    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
    const floored = Math.floor(timestamp.getTime() / intervalMs) * intervalMs;
    return new Date(floored);
  }
}
