import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../modules/users/entities/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const hasRole = requiredRoles.some((role) => user?.role === role);

    if (!hasRole) {
      const handler = context.getHandler().name;
      const userRole = user?.role || 'unauthenticated';
      const userId = user?.id || 'unknown';
      this.logger.warn(
        `Access denied: user ${userId} (role: ${userRole}) ` +
        `tried to access ${handler} (requires: ${requiredRoles.join(', ')})`,
      );
    }

    return hasRole;
  }
}
