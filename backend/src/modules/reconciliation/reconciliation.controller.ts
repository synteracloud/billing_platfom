import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { CreateManualMatchDto } from './dto/create-manual-match.dto';
import { CreateReconciliationSuggestionsDto } from './dto/reconciliation-suggestions.dto';
import { ReconciliationService } from './reconciliation.service';

@Controller('api/v1/reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get('items/unmatched')
  getUnmatchedItems(
    @Req() request: AuthenticatedRequest,
    @Query('source_type') sourceType?: string,
    @Query('limit') limitRaw?: string
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 100;
    return this.reconciliationService.getUnmatchedItems(request.tenant.id, sourceType, Number.isNaN(limit) ? 100 : limit);
  }

  @Get('matches')
  getMatches(@Req() request: AuthenticatedRequest, @Query('item_id') itemId?: string) {
    return this.reconciliationService.getMatches(request.tenant.id, itemId);
  }

  @Post('matches/manual')
  createManualMatch(@Req() request: AuthenticatedRequest, @Body() body: CreateManualMatchDto) {
    return this.reconciliationService.createManualMatch(request.tenant.id, body);
  }

  @Post('suggestions')
  suggestMatches(@Req() request: AuthenticatedRequest, @Body() body: CreateReconciliationSuggestionsDto) {
    const tenantScopedBody: CreateReconciliationSuggestionsDto = {
      unmatched_transactions: body.unmatched_transactions.map((item) => ({ ...item, tenant_id: request.tenant.id })),
      matching_candidates: body.matching_candidates.map((item) => ({ ...item, tenant_id: request.tenant.id }))
    };

    return this.reconciliationService.suggestMatches(tenantScopedBody);
  }
}
