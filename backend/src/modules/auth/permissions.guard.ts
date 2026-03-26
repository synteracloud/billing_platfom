import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator';
import { hasPermission, Permission } from './permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(reflector: Reflector) {
    this.reflector = reflector;
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) {
      throw new ForbiddenException('authentication context is required');
    }

    const unauthorizedPermission = requiredPermissions.find((permission) => !hasPermission(request.auth!.role, permission));

    if (unauthorizedPermission) {
      throw new ForbiddenException(`missing permission: ${unauthorizedPermission}`);
    }

    return true;
  }
}
