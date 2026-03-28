import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { AnalyticsReadOnlyGuard } from './analytics-readonly.guard';
import { AnalyticsService, ClassificationInput } from './analytics.service';

@Controller('api/v1/ai')
@UseGuards(AnalyticsReadOnlyGuard)
@RequirePermissions(PERMISSIONS.VIEW_REPORTS)
export class AiController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('classify')
  classify(@Body() input: ClassificationInput) {
    return {
      assistive_only: true,
      grounded_only: true,
      no_hallucination: true,
      result: this.analyticsService.classifyTransaction(input)
    };
  }

  @Get('copilot')
  getCopilot(@Req() request: AuthenticatedRequest) {
    return {
      grounded_only: true,
      no_hallucination: true,
      data_source: 'approved_read_models',
      ...this.analyticsService.getCopilotSuggestions(request.tenant.id)
    };
  }

  @Get('collections-prediction')
  getCollectionsPrediction(@Req() request: AuthenticatedRequest) {
    return {
      grounded_only: true,
      no_hallucination: true,
      data_source: 'approved_read_models',
      ...this.analyticsService.getCollectionsPrediction(request.tenant.id)
    };
  }
}
