import { ConflictException, Injectable } from '@nestjs/common';
import { ApprovalRequestEntity, ApprovalThreshold, SensitiveActionType } from './entities/approval-request.entity';

@Injectable()
export class ApprovalRepository {
  private readonly requests = new Map<string, ApprovalRequestEntity>();
  private readonly thresholds = new Map<string, ApprovalThreshold>();

  saveRequest(request: ApprovalRequestEntity): ApprovalRequestEntity {
    const existing = this.requests.get(request.id);
    if (existing && existing.tenant_id !== request.tenant_id) {
      throw new ConflictException('approval request id collision across tenants');
    }

    this.requests.set(request.id, this.freeze({ ...request, steps: request.steps.map((step) => this.freeze({ ...step })) }));
    return this.getRequest(request.tenant_id, request.id)!;
  }

  getRequest(tenantId: string, requestId: string): ApprovalRequestEntity | undefined {
    const request = this.requests.get(requestId);
    if (!request || request.tenant_id !== tenantId) {
      return undefined;
    }

    return this.freeze({ ...request, steps: request.steps.map((step) => this.freeze({ ...step })) });
  }

  setThreshold(tenantId: string, actionType: SensitiveActionType, threshold: ApprovalThreshold): void {
    this.thresholds.set(`${tenantId}:${actionType}`, this.freeze({ ...threshold }));
  }

  getThreshold(tenantId: string, actionType: SensitiveActionType): ApprovalThreshold | undefined {
    const threshold = this.thresholds.get(`${tenantId}:${actionType}`);
    return threshold ? this.freeze({ ...threshold }) : undefined;
  }

  createSnapshot(): {
    requests: Map<string, ApprovalRequestEntity>;
    thresholds: Map<string, ApprovalThreshold>;
  } {
    return {
      requests: new Map([...this.requests.entries()].map(([id, request]) => [id, this.freeze({ ...request, steps: request.steps.map((step) => this.freeze({ ...step })) })])),
      thresholds: new Map([...this.thresholds.entries()].map(([key, threshold]) => [key, this.freeze({ ...threshold })]))
    };
  }

  restoreSnapshot(snapshot: {
    requests: Map<string, ApprovalRequestEntity>;
    thresholds: Map<string, ApprovalThreshold>;
  }): void {
    this.requests.clear();
    this.thresholds.clear();

    for (const [id, request] of snapshot.requests.entries()) {
      this.requests.set(id, this.freeze({ ...request, steps: request.steps.map((step) => this.freeze({ ...step })) }));
    }

    for (const [key, threshold] of snapshot.thresholds.entries()) {
      this.thresholds.set(key, this.freeze({ ...threshold }));
    }
  }

  private freeze<T>(value: T): T {
    return Object.freeze(value);
  }
}
