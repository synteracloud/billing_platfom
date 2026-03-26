import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { LedgerReadQueryDto } from './dto/ledger-read-query.dto';
import { PostJournalDto } from './dto/post-journal.dto';
import { LedgerService } from './ledger.service';

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

  @Get('activity')
  getAccountActivity(@Req() req: AuthenticatedRequest, @Query() query: LedgerReadQueryDto) {
    return {
      data: this.ledgerService.getAccountActivity(req.auth!.tenant_id, query),
      meta: { request_id: randomUUID(), read_only: true, source_of_truth: 'ledger' },
      error: null
    };
  }

  @Get('trial-balance')
  getTrialBalance(@Req() req: AuthenticatedRequest, @Query() query: LedgerReadQueryDto) {
    return {
      data: this.ledgerService.getTrialBalance(req.auth!.tenant_id, query),
      meta: { request_id: randomUUID(), read_only: true, source_of_truth: 'ledger' },
      error: null
    };
  }

  @Get('journals')
  getJournalDetails(@Req() req: AuthenticatedRequest, @Query() query: LedgerReadQueryDto) {
    return {
      data: this.ledgerService.getJournalDetails(req.auth!.tenant_id, query),
      meta: { request_id: randomUUID(), read_only: true, source_of_truth: 'ledger' },
      error: null
    };
  }

  @Get('journals/:journalEntryId')
  getJournalDetailById(@Req() req: AuthenticatedRequest, @Param('journalEntryId') journalEntryId: string) {
    return {
      data: this.ledgerService.getJournalEntry(req.auth!.tenant_id, journalEntryId),
      meta: { request_id: randomUUID(), read_only: true, source_of_truth: 'ledger' },
      error: null
    };
  }
}
