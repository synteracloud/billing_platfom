import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuthMiddleware } from './modules/auth/auth.middleware';
import { AuthModule } from './modules/auth/module';
import { CustomersModule } from './modules/customers/customers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { EventsModule } from './modules/events/events.module';
import { IdempotencyModule } from './modules/idempotency/idempotency.module';
import { IdempotencyMiddleware } from './modules/idempotency/idempotency.middleware';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProductsModule } from './modules/products/products.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { TenantsModule } from './modules/tenants/module';
import { UsersModule } from './modules/users/module';

@Module({
  imports: [
    TenantsModule,
    UsersModule,
    CustomersModule,
    DashboardModule,
    ProductsModule,
    IdempotencyModule,
    InvoicesModule,
    PaymentsModule,
    SubscriptionsModule,
    DocumentsModule,
    EventsModule,
    AuthModule
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
      { path: 'api/v1/payments', method: RequestMethod.ALL },
      { path: 'api/v1/payments/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/subscriptions', method: RequestMethod.ALL },
      { path: 'api/v1/subscriptions/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/documents', method: RequestMethod.ALL },
      { path: 'api/v1/documents/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/events', method: RequestMethod.ALL },
      { path: 'api/v1/events/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/tenants/:id', method: RequestMethod.GET },
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
      { path: 'api/v1/payments/:id/void', method: RequestMethod.POST }
    );


  }
}
