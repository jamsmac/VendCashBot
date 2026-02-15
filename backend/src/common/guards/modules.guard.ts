import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MODULES_KEY } from '../decorators/require-module.decorator';
import { UserModule, ROLE_DEFAULT_MODULES } from '../../modules/users/entities/user-module.entity';

@Injectable()
export class ModulesGuard implements CanActivate {
  private readonly logger = new Logger(ModulesGuard.name);

  constructor(
    private reflector: Reflector,
    @InjectRepository(UserModule)
    private readonly userModuleRepository: Repository<UserModule>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModules = this.reflector.getAllAndOverride<string[]>(MODULES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @RequireModule decorator → allow
    if (!requiredModules || requiredModules.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // Get default modules from role
    const roleDefaults = ROLE_DEFAULT_MODULES[user.role] || [];

    // Get custom grants from DB
    const customGrants = await this.userModuleRepository.find({
      where: { userId: user.id },
      select: ['module'],
    });
    const customModules = customGrants.map((g) => g.module);

    // Combine: defaults + custom
    const userModules = new Set([...roleDefaults, ...customModules]);

    // Check if user has ANY of the required modules
    const hasAccess = requiredModules.some((m) => userModules.has(m));

    if (!hasAccess) {
      const handler = context.getHandler().name;
      this.logger.warn(
        `Module access denied: user ${user.id} (role: ${user.role}) ` +
        `tried to access ${handler} (requires: ${requiredModules.join(', ')})`,
      );
    }

    return hasAccess;
  }
}
