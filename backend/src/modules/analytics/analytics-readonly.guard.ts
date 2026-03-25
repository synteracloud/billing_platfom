import { CanActivate, ExecutionContext, Injectable, MethodNotAllowedException } from '@nestjs/common';

@Injectable()
export class AnalyticsReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method?: string }>();
    if ((request.method ?? 'GET').toUpperCase() !== 'GET') {
      throw new MethodNotAllowedException('Analytics APIs are read-only');
    }

    return true;
  }
}
