import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { LedgerService } from './ledger.service';
import { PostJournalDto } from './dto/post-journal.dto';
import { ClosePeriodDto } from './dto/close-period.dto';
import { ReopenPeriodDto } from './dto/reopen-period.dto';

@Controller('api/v1/ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Post('postings')
  @HttpCode(HttpStatus.CREATED)
  async postJournal(@Req() req: AuthenticatedRequest, @Body() body: PostJournalDto) {
    return {
      data: this.ledgerService.postEvent(req.auth!.tenant_id, body.event_id, req.idempotency?.key, body.rule_version ?? 1),
      meta: { request_id: randomUUID() },
      error: null
    };
  }

  @Post('periods/close')
  @HttpCode(HttpStatus.OK)
  closePeriod(@Req() req: AuthenticatedRequest, @Body() body: ClosePeriodDto) {
    if (!req.auth?.user_id || !req.auth?.role) {
      throw new ForbiddenException('Authenticated user context is required');
    }
    return {
      data: this.ledgerService.closePeriod(req.auth.tenant_id, body.period, { actor_id: req.auth.user_id, role: req.auth.role }),
      meta: { request_id: randomUUID() },
      error: null
    };
  }

  @Post('periods/reopen')
  @HttpCode(HttpStatus.OK)
  reopenPeriod(@Req() req: AuthenticatedRequest, @Body() body: ReopenPeriodDto) {
    if (!req.auth?.user_id || !req.auth?.role) {
      throw new ForbiddenException('Authenticated user context is required');
    }
    return {
      data: this.ledgerService.reopenPeriod(req.auth.tenant_id, body.period, body.reopen_reason, { actor_id: req.auth.user_id, role: req.auth.role }),
      meta: { request_id: randomUUID() },
      error: null
    };
  }
}
