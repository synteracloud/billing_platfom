import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async use(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    const rawKey = req.header('idempotency-key');
    const idempotencyKey = rawKey?.trim();
    if (!idempotencyKey) {
      throw new BadRequestException('idempotency-key header is required for financial operations');
    }

    const tenantId = req.auth?.tenant_id ?? 'anonymous';
    const scope = `${tenantId}:${req.method}:${req.baseUrl}${req.path}`;
    req.idempotency = { key: idempotencyKey, scope };
    const beginResult = this.idempotencyService.begin(scope, idempotencyKey);

    if (beginResult.state === 'completed') {
      this.respondFromRecord(res, beginResult.record.response?.status_code ?? 200, beginResult.record.response?.body);
      return;
    }

    if (beginResult.state === 'in_progress') {
      const completed = await this.idempotencyService.waitForCompletion(scope, idempotencyKey);
      if (completed?.response) {
        this.respondFromRecord(res, completed.response.status_code, completed.response.body);
        return;
      }

      next();
      return;
    }

    let responseBody: unknown;
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = ((body: unknown) => {
      responseBody = body;
      return originalJson(body);
    }) as Response['json'];

    res.send = ((body: unknown) => {
      if (responseBody === undefined) {
        responseBody = body;
      }

      return originalSend(body);
    }) as Response['send'];

    res.on('finish', () => {
      if (res.statusCode >= 500) {
        this.idempotencyService.fail(scope, idempotencyKey);
        return;
      }

      this.idempotencyService.complete(scope, idempotencyKey, {
        status_code: res.statusCode,
        body: responseBody
      });
    });

    next();
  }

  private respondFromRecord(res: Response, statusCode: number, body: unknown): void {
    res.setHeader('x-idempotency-replay', 'true');
    res.status(statusCode).json(body);
  }
}
