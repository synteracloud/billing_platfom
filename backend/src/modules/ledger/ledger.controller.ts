import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { LedgerService } from './ledger.service';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { PostJournalDto } from './dto/post-journal.dto';

@Controller('api/v1/ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Post('postings')
  @RequirePermissions(PERMISSIONS.POST_JOURNAL_ENTRIES)
  @HttpCode(HttpStatus.CREATED)
  async postJournal(@Req() req: AuthenticatedRequest, @Body() body: PostJournalDto) {
    return {
      data: this.ledgerService.postEvent(req.auth!.tenant_id, body.event_id, req.idempotency?.key, body.rule_version ?? 1),
      meta: { request_id: randomUUID() },
      error: null
    };
  }
}
