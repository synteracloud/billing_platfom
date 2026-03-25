import { Body, Controller, Headers, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { randomUUID } from 'crypto';
import { WebhooksService } from './webhooks.service';

interface SuccessResponse<T> {
  data: T;
  meta: {
    request_id: string;
  };
  error: null;
}

@Controller('api/v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post(':provider')
  ingest(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Body() body: unknown,
    @Headers('x-webhook-id') deliveryId: string | undefined,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Headers('x-webhook-timestamp') timestamp: string | undefined
  ): SuccessResponse<ReturnType<WebhooksService['ingest']>> {
    const rawPayload = this.resolveRawPayload(req, body);
    const result = this.webhooksService.ingest({
      provider,
      delivery_id: deliveryId ?? '',
      payload_raw: rawPayload,
      signature: signature ?? '',
      timestamp: timestamp ?? ''
    });

    return {
      data: result,
      meta: { request_id: randomUUID() },
      error: null
    };
  }

  private resolveRawPayload(req: Request, body: unknown): string {
    const requestWithRaw = req as Request & { rawBody?: Buffer | string };
    if (Buffer.isBuffer(requestWithRaw.rawBody)) {
      return requestWithRaw.rawBody.toString('utf8');
    }

    if (typeof requestWithRaw.rawBody === 'string') {
      return requestWithRaw.rawBody;
    }

    if (typeof body === 'string') {
      return body;
    }

    return JSON.stringify(body ?? {});
  }
}
