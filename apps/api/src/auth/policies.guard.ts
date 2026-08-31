import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '@prisma/client';
import { defineAbilityFor } from '@macgrading/shared';
import { CHECK_POLICIES_KEY, PolicyHandler } from './check-policies.decorator';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handlers =
      this.reflector.get<PolicyHandler[]>(
        CHECK_POLICIES_KEY,
        context.getHandler(),
      ) ?? [];
    const { user } = context.switchToHttp().getRequest<{ user?: User }>();
    if (!user) {
      throw new ForbiddenException('PoliciesGuard requires JwtAuthGuard first');
    }
    const ability = defineAbilityFor(user);
    if (!handlers.every((handler) => handler(ability))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
