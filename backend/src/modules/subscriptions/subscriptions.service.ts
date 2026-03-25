import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomersService } from '../customers/customers.service';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { InvoicesService } from '../invoices/invoices.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { BillingFrequency, SubscriptionEntity } from './entities/subscription.entity';
import { SubscriptionsRepository } from './subscriptions.repository';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly customersService: CustomersService,
    private readonly invoicesService: InvoicesService
  ) {}

  listSubscriptions(tenantId: string): SubscriptionEntity[] {
    return this.subscriptionsRepository.listByTenant(tenantId);
  }

  createSubscription(tenantId: string, data: CreateSubscriptionDto): SubscriptionEntity {
    this.validateCreatePayload(data);
    this.customersService.getCustomer(tenantId, data.customer_id);

    const created = this.subscriptionsRepository.create({
      tenant_id: tenantId,
      customer_id: data.customer_id,
      plan_reference: data.plan_reference ?? null,
      status: data.status ?? 'draft',
      start_date: data.start_date,
      end_date: data.end_date ?? null,
      billing_frequency: data.billing_frequency,
      next_billing_date: data.next_billing_date ?? data.start_date,
      auto_renew: data.auto_renew ?? true,
      pricing_terms: data.pricing_terms,
      canceled_at: null,
      metadata: data.metadata ?? null
    });

    return created;
  }

  getSubscription(tenantId: string, id: string): SubscriptionEntity {
    const subscription = this.subscriptionsRepository.findById(tenantId, id);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return subscription;
  }

  updateSubscription(tenantId: string, id: string, data: UpdateSubscriptionDto): SubscriptionEntity {
    const existing = this.getSubscription(tenantId, id);
    if (existing.status === 'canceled' || existing.status === 'expired') {
      throw new ConflictException('Terminal subscriptions cannot be updated');
    }

    this.validateUpdatePayload(data);

    const next = this.subscriptionsRepository.update(tenantId, id, { ...data });
    if (!next) {
      throw new NotFoundException('Subscription not found');
    }

    return next;
  }

  cancelSubscription(tenantId: string, id: string): SubscriptionEntity {
    const subscription = this.getSubscription(tenantId, id);
    if (subscription.status === 'canceled') {
      return subscription;
    }

    const now = new Date().toISOString();
    const updated = this.subscriptionsRepository.update(tenantId, id, {
      status: 'canceled',
      canceled_at: now,
      end_date: subscription.end_date ?? now.slice(0, 10)
    });



    return updated!;
  }

  processDueSubscriptions(asOf = new Date()): { processed: number; invoices_generated: number } {
    const dueSubscriptions = this.subscriptionsRepository.listDue(asOf);
    let invoicesGenerated = 0;

    for (const subscription of dueSubscriptions) {
      if (subscription.status !== 'active' || !subscription.next_billing_date) {
        continue;
      }

      let nextBillingDate = subscription.next_billing_date;
      let generatedForCurrentSubscription = 0;

      while (new Date(nextBillingDate).getTime() <= asOf.getTime()) {
        if (subscription.end_date && new Date(nextBillingDate).getTime() > new Date(subscription.end_date).getTime()) {
          break;
        }

        const amountMinor = Number(subscription.pricing_terms.amount_minor ?? 0);
        const description = String(subscription.pricing_terms.description ?? subscription.plan_reference ?? 'Subscription');

        const payload: CreateInvoiceDto = {
          customer_id: subscription.customer_id,
          subscription_id: subscription.id,
          currency: String(subscription.pricing_terms.currency ?? 'USD'),
          issue_date: nextBillingDate,
          metadata: {
            source: 'subscription',
            ...(subscription.metadata ?? {})
          },
          lines: [
            {
              description,
              quantity: 1,
              unit_price_minor: amountMinor,
              line_tax_minor: Number(subscription.pricing_terms.tax_minor ?? 0)
            }
          ]
        };

        this.invoicesService.createInvoice(subscription.tenant_id, payload);
        invoicesGenerated += 1;
        generatedForCurrentSubscription += 1;
        nextBillingDate = this.advanceDate(nextBillingDate, subscription.billing_frequency);
      }

      if (generatedForCurrentSubscription > 0) {
        this.subscriptionsRepository.update(subscription.tenant_id, subscription.id, {
          next_billing_date: nextBillingDate
        });
      }
    }

    return {
      processed: dueSubscriptions.length,
      invoices_generated: invoicesGenerated
    };
  }

  private validateCreatePayload(data: CreateSubscriptionDto): void {
    if (!data.customer_id || data.customer_id.trim().length === 0) {
      throw new BadRequestException('customer_id is required');
    }

    this.validateBillingFrequency(data.billing_frequency);
    this.validateDate(data.start_date, 'start_date');

    if (data.end_date) {
      this.validateDate(data.end_date, 'end_date');
    }
  }

  private validateUpdatePayload(data: UpdateSubscriptionDto): void {
    if (data.billing_frequency !== undefined) {
      this.validateBillingFrequency(data.billing_frequency);
    }

    if (data.end_date !== undefined && data.end_date !== null) {
      this.validateDate(data.end_date, 'end_date');
    }

    if (data.next_billing_date !== undefined && data.next_billing_date !== null) {
      this.validateDate(data.next_billing_date, 'next_billing_date');
    }
  }

  private validateBillingFrequency(value: string): void {
    if (value !== 'monthly' && value !== 'quarterly' && value !== 'yearly' && value !== 'custom') {
      throw new BadRequestException('billing_frequency must be monthly, quarterly, yearly, or custom');
    }
  }

  private validateDate(value: string, field: string): void {
    if (Number.isNaN(new Date(value).getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
  }

  private advanceDate(isoDate: string, frequency: BillingFrequency): string {
    const date = new Date(isoDate);

    if (frequency === 'monthly') {
      date.setMonth(date.getMonth() + 1);
    } else if (frequency === 'quarterly') {
      date.setMonth(date.getMonth() + 3);
    } else if (frequency === 'yearly') {
      date.setFullYear(date.getFullYear() + 1);
    } else {
      date.setMonth(date.getMonth() + 1);
    }

    return date.toISOString();
  }
}
