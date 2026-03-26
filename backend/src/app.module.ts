import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ChartOfAccountsModule } from './modules/accounting/chart-of-accounts.module';
import { AuthMiddleware } from './modules/auth/auth.middleware';
import { AuthModule } from './modules/auth/module';
import { BankConnectorModule } from './modules/bank-connector/bank-connector.module';
import { ArModule } from './modules/ar/ar.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ApModule } from './modules/ap/ap.module';
import { DatabaseModule } from './database/database.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EventsModule } from './modules/events/events.module';
import { IdempotencyModule } from './modules/idempotency/idempotency.module';
import { IdempotencyMiddleware } from './modules/idempotency/idempotency.middleware';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProductsModule } from './modules/products/products.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { StatementsModule } from './modules/statements/statements.module';
import { TenantsModule } from './modules/tenants/module';
import { UsersModule } from './modules/users/module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { CashflowModule } from './modules/cashflow/cashflow.module';
import { AccountingPeriodsModule } from './modules/accounting-periods/accounting-periods.module';

@Module({
  imports: [
    DatabaseModule,
    BankConnectorModule,
    ChartOfAccountsModule,
    TenantsModule,
    UsersModule,
    CustomersModule,
    DashboardModule,
    ProductsModule,
    IdempotencyModule,
    InvoicesModule,
    LedgerModule,
    PaymentsModule,
    LedgerModule,
    IntegrationsModule,
    SubscriptionsModule,
    DocumentsModule,
    EventsModule,
    AuthModule,
    ArModule,
    ApModule,
    AnalyticsModule,
    WebhooksModule,
    ReconciliationModule,
    CashflowModule,
    AccountingPeriodsModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {

    consumer.apply(AuthMiddleware).forRoutes(
      { path: 'api/v1/users', method: RequestMethod.ALL },
      { path: 'api/v1/users/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/customers', method: RequestMethod.ALL },
      { path: 'api/v1/customers/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/dashboard', method: RequestMethod.ALL },
      { path: 'api/v1/dashboard/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/products', method: RequestMethod.ALL },
      { path: 'api/v1/products/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/invoices', method: RequestMethod.ALL },
      { path: 'api/v1/invoices/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/ledger', method: RequestMethod.ALL },
      { path: 'api/v1/ledger/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/integrations', method: RequestMethod.ALL },
      { path: 'api/v1/integrations/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/payments', method: RequestMethod.ALL },
      { path: 'api/v1/payments/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/subscriptions', method: RequestMethod.ALL },
      { path: 'api/v1/subscriptions/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/documents', method: RequestMethod.ALL },
      { path: 'api/v1/documents/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/events', method: RequestMethod.ALL },
      { path: 'api/v1/events/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/ar', method: RequestMethod.ALL },
      { path: 'api/v1/ar/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/ap', method: RequestMethod.ALL },
      { path: 'api/v1/ap/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/reconciliation', method: RequestMethod.ALL },
      { path: 'api/v1/reports/cashflow', method: RequestMethod.ALL },
      { path: 'api/v1/reconciliation/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/reports/cashflow/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/accounting', method: RequestMethod.ALL },
      { path: 'api/v1/accounting/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/tenants/:id', method: RequestMethod.GET },
      { path: 'api/v1/tenants/:id/chart-of-accounts', method: RequestMethod.GET },
      { path: 'api/v1/tenants/:id', method: RequestMethod.PATCH }
    );
    consumer.apply(IdempotencyMiddleware).forRoutes(
      { path: 'api/v1/invoices', method: RequestMethod.POST },
      { path: 'api/v1/invoices/:id', method: RequestMethod.PATCH },
      { path: 'api/v1/invoices/:id/issue', method: RequestMethod.POST },
      { path: 'api/v1/invoices/:id/void', method: RequestMethod.POST },
      { path: 'api/v1/invoices/:id/lines', method: RequestMethod.POST },
      { path: 'api/v1/invoices/:id/lines/:line_id', method: RequestMethod.DELETE },
      { path: 'api/v1/payments', method: RequestMethod.POST },
      { path: 'api/v1/payments/:id/allocate', method: RequestMethod.POST },
      { path: 'api/v1/payments/:id/void', method: RequestMethod.POST },
      { path: 'api/v1/ledger/postings', method: RequestMethod.POST }
    );


  }
}
