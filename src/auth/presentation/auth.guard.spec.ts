import {
	ExecutionContext,
	ForbiddenException,
	UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockAuthService, mockUser } from '../../../test/mocks/index.js';
import { AuthService } from '../application/auth.service.js';
import { UserRole } from '../domain/user-role.js';
import { AuthGuard } from './auth.guard.js';

describe('AuthGuard', () => {
	let guard: AuthGuard;
	let authService: ReturnType<typeof createMockAuthService>;
	let reflector: Reflector;

	function createMockExecutionContext(
		authorization?: string,
	): ExecutionContext {
		const request = { headers: { authorization }, user: undefined };
		return {
			switchToHttp: () => ({ getRequest: () => request }),
			getHandler: () => vi.fn(),
			getClass: () => vi.fn(),
		} as unknown as ExecutionContext;
	}

	beforeEach(() => {
		authService = createMockAuthService();
		reflector = new Reflector();
		guard = new AuthGuard(authService as unknown as AuthService, reflector);
	});

	it('allows public routes without a token', async () => {
		vi.spyOn(reflector, 'getAllAndOverride')
			.mockReturnValueOnce(true)
			.mockReturnValueOnce(undefined);

		await expect(
			guard.canActivate(createMockExecutionContext()),
		).resolves.toBe(true);
	});

	it('rejects protected routes without a token', async () => {
		vi.spyOn(reflector, 'getAllAndOverride')
			.mockReturnValueOnce(false)
			.mockReturnValueOnce(undefined);

		await expect(
			guard.canActivate(createMockExecutionContext()),
		).rejects.toThrow(UnauthorizedException);
	});

	it('populates the request user after validating a token', async () => {
		const user = mockUser({ roles: [UserRole.ADMINISTRATOR] });
		vi.spyOn(reflector, 'getAllAndOverride')
			.mockReturnValueOnce(false)
			.mockReturnValueOnce([UserRole.ADMINISTRATOR]);
		authService.validateToken.mockResolvedValue(user);
		const context = createMockExecutionContext('Bearer valid-token');

		await expect(guard.canActivate(context)).resolves.toBe(true);
		expect(
			context.switchToHttp().getRequest<{ user: unknown }>().user,
		).toEqual(user);
	});

	it('enforces required roles', async () => {
		vi.spyOn(reflector, 'getAllAndOverride')
			.mockReturnValueOnce(false)
			.mockReturnValueOnce([UserRole.ADMINISTRATOR]);
		authService.validateToken.mockResolvedValue(mockUser());

		await expect(
			guard.canActivate(createMockExecutionContext('Bearer valid-token')),
		).rejects.toThrow(ForbiddenException);
	});
});
