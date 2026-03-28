import { CanActivate, ExecutionContext, Injectable, MethodNotAllowedException } from '@nestjs/common';

@Injectable()
export class AnalyticsReadOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method?: string; path?: string; url?: string }>();
    const method = (request.method ?? 'GET').toUpperCase();
    const requestPath = (request.path ?? request.url ?? '').split('?')[0];
    const isAiClassify =
      requestPath.length === 0 ||
      requestPath === '/ai/classify' ||
      requestPath.endsWith('/ai/classify') ||
      requestPath === '/api/v1/ai/classify' ||
      requestPath.endsWith('/api/v1/ai/classify');

    if (method !== 'GET' && !(method === 'POST' && isAiClassify)) {
      throw new MethodNotAllowedException('Analytics APIs are read-only except POST /ai/classify');
    }

    return true;
  }
}
