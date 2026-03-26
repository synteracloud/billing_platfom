import { CanActivate, ExecutionContext, Injectable, MethodNotAllowedException } from '@nestjs/common';

@Injectable()
export class TaxReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method?: string }>();
    if ((request.method ?? 'GET').toUpperCase() !== 'GET') {
      throw new MethodNotAllowedException('Tax report APIs are read-only');
    }

    return true;
  }
}
