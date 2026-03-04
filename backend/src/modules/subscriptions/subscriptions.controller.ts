import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post
} from '@nestjs/common';
import { Req } from '@nestjs/common/decorators';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

interface SuccessResponse<T> {
  data: T;
  meta: {
    request_id: string;
  };
  error: null;
}

@Controller('api/v1/subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  listSubscriptions(@Req() req: AuthenticatedRequest): SuccessResponse<ReturnType<SubscriptionsService['listSubscriptions']>> {
    return {
      data: this.subscriptionsService.listSubscriptions(req.auth!.tenant_id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createSubscription(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateSubscriptionDto
  ): SuccessResponse<ReturnType<SubscriptionsService['createSubscription']>> {
    return {
      data: this.subscriptionsService.createSubscription(req.auth!.tenant_id, body),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Get(':id')
  getSubscription(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string
  ): SuccessResponse<ReturnType<SubscriptionsService['getSubscription']>> {
    return {
      data: this.subscriptionsService.getSubscription(req.auth!.tenant_id, id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Patch(':id')
  updateSubscription(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateSubscriptionDto
  ): SuccessResponse<ReturnType<SubscriptionsService['updateSubscription']>> {
    return {
      data: this.subscriptionsService.updateSubscription(req.auth!.tenant_id, id, body),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post(':id/cancel')
  cancelSubscription(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string
  ): SuccessResponse<ReturnType<SubscriptionsService['cancelSubscription']>> {
    return {
      data: this.subscriptionsService.cancelSubscription(req.auth!.tenant_id, id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post(':id/pause')
  pauseSubscription(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string
  ): SuccessResponse<ReturnType<SubscriptionsService['pauseSubscription']>> {
    return {
      data: this.subscriptionsService.pauseSubscription(req.auth!.tenant_id, id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  @Post(':id/resume')
  resumeSubscription(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string
  ): SuccessResponse<ReturnType<SubscriptionsService['resumeSubscription']>> {
    return {
      data: this.subscriptionsService.resumeSubscription(req.auth!.tenant_id, id),
      meta: { request_id: this.getRequestId() },
      error: null
    };
  }

  private getRequestId(): string {
    return randomUUID();
  }
}
