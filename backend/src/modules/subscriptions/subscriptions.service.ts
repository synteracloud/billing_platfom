import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { CustomersService } from '../customers/customers.service';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { InvoicesService } from '../invoices/invoices.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { BillingInterval, SubscriptionEntity } from './entities/subscription.entity';
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

    return this.subscriptionsRepository.create({
      tenant_id: tenantId,
      customer_id: data.customer_id,
      product_id: data.product_id ?? null,
      name: data.name.trim(),
      billing_interval: data.billing_interval,
      amount_minor: data.amount_minor,
      currency: data.currency.trim().toUpperCase(),
      start_date: data.start_date,
      end_date: data.end_date ?? null,
      next_billing_date: data.next_billing_date ?? data.start_date,
      status: 'active',
      metadata: data.metadata ?? null
    });
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
    if (existing.status === 'cancelled') {
      throw new ConflictException('Cancelled subscriptions cannot be updated');
    }

    this.validateUpdatePayload(data);

    const next = this.subscriptionsRepository.update(tenantId, id, {
      ...data,
      name: data.name?.trim(),
      currency: data.currency?.trim().toUpperCase()
    });

    if (!next) {
      throw new NotFoundException('Subscription not found');
    }

    return next;
  }

  cancelSubscription(tenantId: string, id: string): SubscriptionEntity {
    const subscription = this.getSubscription(tenantId, id);
    if (subscription.status === 'cancelled') {
      return subscription;
    }

    return this.subscriptionsRepository.update(tenantId, id, {
      status: 'cancelled',
      end_date: subscription.end_date ?? this.todayDate()
    })!;
  }

  pauseSubscription(tenantId: string, id: string): SubscriptionEntity {
    const subscription = this.getSubscription(tenantId, id);
    if (subscription.status === 'cancelled') {
      throw new ConflictException('Cancelled subscriptions cannot be paused');
    }

    if (subscription.status === 'paused') {
      return subscription;
    }

    return this.subscriptionsRepository.update(tenantId, id, { status: 'paused' })!;
  }

  resumeSubscription(tenantId: string, id: string): SubscriptionEntity {
    const subscription = this.getSubscription(tenantId, id);
    if (subscription.status === 'cancelled') {
      throw new ConflictException('Cancelled subscriptions cannot be resumed');
    }

    if (subscription.status === 'active') {
      return subscription;
    }

    return this.subscriptionsRepository.update(tenantId, id, { status: 'active' })!;
  }

  processDueSubscriptions(asOf = new Date()): { processed: number; invoices_generated: number } {
    const dueSubscriptions = this.subscriptionsRepository.listDue(asOf);
    let invoicesGenerated = 0;

    for (const subscription of dueSubscriptions) {
      let nextBillingDate = subscription.next_billing_date;
      let generatedForCurrentSubscription = 0;

      while (new Date(nextBillingDate).getTime() <= asOf.getTime()) {
        if (subscription.end_date && new Date(nextBillingDate).getTime() > new Date(subscription.end_date).getTime()) {
          break;
        }

        const payload: CreateInvoiceDto = {
          customer_id: subscription.customer_id,
          subscription_id: subscription.id,
          currency: subscription.currency,
          issue_date: nextBillingDate,
          metadata: {
            source: 'subscription',
            subscription_name: subscription.name,
            ...(subscription.metadata ?? {})
          },
          lines: [
            {
              product_id: subscription.product_id,
              description: subscription.name,
              quantity: 1,
              unit_price_minor: subscription.amount_minor,
              line_tax_minor: 0
            }
          ]
        };

        this.invoicesService.createInvoice(subscription.tenant_id, payload);
        invoicesGenerated += 1;
        generatedForCurrentSubscription += 1;
        nextBillingDate = this.advanceDate(nextBillingDate, subscription.billing_interval);
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

    if (!data.name || data.name.trim().length === 0) {
      throw new BadRequestException('name is required');
    }

    this.validateBillingInterval(data.billing_interval);
    this.validateAmount(data.amount_minor);
    this.validateCurrency(data.currency);
    this.validateDate(data.start_date, 'start_date');

    if (data.end_date !== undefined && data.end_date !== null) {
      this.validateDate(data.end_date, 'end_date');
      if (new Date(data.end_date).getTime() < new Date(data.start_date).getTime()) {
        throw new BadRequestException('end_date must be on or after start_date');
      }
    }

    if (data.next_billing_date !== undefined) {
      this.validateDate(data.next_billing_date, 'next_billing_date');
    }
  }

  private validateUpdatePayload(data: UpdateSubscriptionDto): void {
    if (data.name !== undefined && data.name.trim().length === 0) {
      throw new BadRequestException('name must not be empty');
    }

    if (data.billing_interval !== undefined) {
      this.validateBillingInterval(data.billing_interval);
    }

    if (data.amount_minor !== undefined) {
      this.validateAmount(data.amount_minor);
    }

    if (data.currency !== undefined) {
      this.validateCurrency(data.currency);
    }

    if (data.start_date !== undefined) {
      this.validateDate(data.start_date, 'start_date');
    }

    if (data.end_date !== undefined && data.end_date !== null) {
      this.validateDate(data.end_date, 'end_date');
    }

    if (data.next_billing_date !== undefined) {
      this.validateDate(data.next_billing_date, 'next_billing_date');
    }
  }

  private validateBillingInterval(value: string): void {
    if (value !== 'monthly' && value !== 'yearly') {
      throw new BadRequestException('billing_interval must be monthly or yearly');
    }
  }

  private validateAmount(amountMinor: number): void {
    if (!Number.isFinite(amountMinor) || amountMinor < 0) {
      throw new BadRequestException('amount_minor must be greater than or equal to 0');
    }
  }

  private validateCurrency(currency: string): void {
    if (!currency || currency.trim().length !== 3) {
      throw new BadRequestException('currency must be a 3-letter ISO code');
    }
  }

  private validateDate(value: string, field: string): void {
    if (Number.isNaN(new Date(value).getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
  }

  private advanceDate(isoDate: string, interval: BillingInterval): string {
    const date = new Date(isoDate);
    if (interval === 'monthly') {
      date.setMonth(date.getMonth() + 1);
    } else {
      date.setFullYear(date.getFullYear() + 1);
    }

    return date.toISOString();
  }

  private todayDate(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
