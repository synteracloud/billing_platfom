import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { ExecutePullInput, PollingService } from './polling.service';

interface ExecutePullRequest {
  connector_id: string;
  pulled_at?: string;
  response: ExecutePullInput['response'];
}

@Controller('api/v1/integrations')
@RequirePermissions(PERMISSIONS.MANAGE_INTEGRATIONS)
export class IntegrationsController {
  constructor(private readonly pollingService: PollingService) {}

  @Post('pulls')
  executePull(@Req() req: AuthenticatedRequest, @Body() body: ExecutePullRequest) {
    return {
      data: this.pollingService.executePull({
        tenant_id: req.auth!.tenant_id,
        connector_id: body.connector_id,
        pulled_at: body.pulled_at,
        response: body.response
      }),
      meta: { request_id: randomUUID() },
      error: null
    };
  }

  @Get('raw-responses')
  listRawResponses(@Req() req: AuthenticatedRequest, @Query('connector_id') connectorId?: string) {
    return {
      data: this.pollingService.listRawResponses(req.auth!.tenant_id, connectorId),
      meta: { request_id: randomUUID() },
      error: null
    };
  }

  @Get('normalized-records')
  listNormalizedRecords(@Req() req: AuthenticatedRequest, @Query('connector_id') connectorId?: string) {
    return {
      data: this.pollingService.listNormalizedRecords(req.auth!.tenant_id, connectorId),
      meta: { request_id: randomUUID() },
      error: null
    };
  }
}
