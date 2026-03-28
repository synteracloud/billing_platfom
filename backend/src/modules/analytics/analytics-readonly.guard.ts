import { CanActivate, ExecutionContext, Injectable, MethodNotAllowedException } from '@nestjs/common';

@Injectable()
export class AnalyticsReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method?: string; path?: string; url?: string }>();
    const method = (request.method ?? 'GET').toUpperCase();
    const requestPath = (request.path ?? request.url ?? '').split('?')[0];
    const isAiClassify = requestPath === '/ai/classify' || requestPath.endsWith('/ai/classify');

    if (method !== 'GET' && !(method === 'POST' && isAiClassify)) {
      throw new MethodNotAllowedException('Analytics APIs are read-only except POST /ai/classify');
    }

    return true;
  }
}
