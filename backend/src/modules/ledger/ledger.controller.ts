import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { LedgerService } from './ledger.service';
import { CreateReversalEntryDto } from './dto/create-reversal-entry.dto';
import { CreateAdjustmentEntryDto, CreateManualJournalEntryDto } from './dto/manual-journal-entry.dto';
import { PostJournalDto } from './dto/post-journal.dto';
import { LedgerService } from './ledger.service';

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

  @Post('manual-entries')
  @HttpCode(HttpStatus.CREATED)
  async createManualJournal(@Req() req: AuthenticatedRequest, @Body() body: CreateManualJournalEntryDto) {
    return {
      data: this.ledgerService.createManualJournalEntry(req.auth!.tenant_id, req.auth!.role, body, req.idempotency?.key),
      meta: { request_id: randomUUID() },
      error: null
    };
  }

  @Post('adjustments')
  @HttpCode(HttpStatus.CREATED)
  async createAdjustmentEntry(@Req() req: AuthenticatedRequest, @Body() body: CreateAdjustmentEntryDto) {
    return {
      data: this.ledgerService.createAdjustmentEntry(req.auth!.tenant_id, req.auth!.role, body, req.idempotency?.key),
      meta: { request_id: randomUUID() },
      error: null
    };
  }

  @Post('entries/:journal_entry_id/reversal')
  @HttpCode(HttpStatus.CREATED)
  async createReversalEntry(
    @Req() req: AuthenticatedRequest,
    @Param('journal_entry_id') journalEntryId: string,
    @Body() body: CreateReversalEntryDto
  ) {
    return {
      data: this.ledgerService.createReversalEntry(req.auth!.tenant_id, req.auth!.role, journalEntryId, body, req.idempotency?.key),
      meta: { request_id: randomUUID() },
      error: null
    };
  }
}
