import { Controller, Get, Query } from '@nestjs/common';
import { Req } from '@nestjs/common/decorators';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { QueryEventsDto } from './dto/query-events.dto';
import { EventsService } from './events.service';

interface SuccessResponse<T> {
  data: T;
  meta: {
    request_id: string;
  };
  error: null;
}

@Controller('api/v1/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  listEvents(
    @Req() req: AuthenticatedRequest,
    @Query() query: QueryEventsDto
  ): SuccessResponse<ReturnType<EventsService['listEvents']>> {
    return {
      data: this.eventsService.listEvents(req.auth!.tenant_id, query),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  private getRequestId(): string {
    return randomUUID();
  }
}
