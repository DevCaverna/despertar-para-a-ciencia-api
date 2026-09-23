import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { IS_PUBLIC_KEY } from '../../decorators/public.decorator.js';
import { REQUIRED_ROLES_KEY } from '../../decorators/roles.decorator.js';
import { AuthService } from '../application/auth.service.js';
import { AuthUser } from '../domain/auth.types.js';
import { UserRole } from '../domain/user-role.js';

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		private readonly authService: AuthService,
		private readonly reflector: Reflector,
	) {}

	async canActivate(ctx: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(
			IS_PUBLIC_KEY,
			[ctx.getHandler(), ctx.getClass()],
		);

		const requiredRoles = this.reflector.getAllAndOverride<
			UserRole[] | undefined
		>(REQUIRED_ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);

		const request: Request & { user?: AuthUser } = ctx
			.switchToHttp()
			.getRequest();

		const authHeader = request.headers.authorization;

		let user: AuthUser | undefined;

		if (authHeader?.startsWith('Bearer ')) {
			const token = authHeader.slice(7);

			try {
				user = await this.authService.validateToken(token);
				request.user = user;
			} catch {
				if (!isPublic) {
					throw new UnauthorizedException('Invalid token');
				}
			}
		} else if (!isPublic) {
			throw new UnauthorizedException('Missing bearer token');
		}

		if (
			requiredRoles?.length &&
			!user?.roles.some((role) => requiredRoles.includes(role))
		) {
			throw new ForbiddenException(
				`You don't have access to this resource`,
			);
		}

		return true;
	}
}
