import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuthMiddleware } from './modules/auth/auth.middleware';
import { AuthModule } from './modules/auth/module';
import { TenantsModule } from './modules/tenants/module';
import { UsersModule } from './modules/users/module';

@Module({
  imports: [TenantsModule, UsersModule, AuthModule]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(
      { path: 'api/v1/users', method: RequestMethod.ALL },
      { path: 'api/v1/users/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/tenants/:id', method: RequestMethod.GET },
      { path: 'api/v1/tenants/:id', method: RequestMethod.PATCH }
    );
  }
}
