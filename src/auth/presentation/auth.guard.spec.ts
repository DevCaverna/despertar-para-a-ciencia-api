import {
	ExecutionContext,
	ForbiddenException,
	ServiceUnavailableException,
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
		const user = mockUser({ roles: [UserRole.ADMIN] });
		vi.spyOn(reflector, 'getAllAndOverride')
			.mockReturnValueOnce(false)
			.mockReturnValueOnce([UserRole.ADMIN]);
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
			.mockReturnValueOnce([UserRole.ADMIN]);
		authService.validateToken.mockResolvedValue(mockUser());

		await expect(
			guard.canActivate(createMockExecutionContext('Bearer valid-token')),
		).rejects.toThrow(ForbiddenException);
	});

	it('preserves service unavailability instead of treating it as invalid credentials', async () => {
		vi.spyOn(reflector, 'getAllAndOverride')
			.mockReturnValueOnce(false)
			.mockReturnValueOnce(undefined);
		authService.validateToken.mockRejectedValue(
			new ServiceUnavailableException('private upstream detail'),
		);

		await expect(
			guard.canActivate(createMockExecutionContext('Bearer token')),
		).rejects.toMatchObject({
			status: 503,
			message: 'Authentication service is unavailable',
		});
	});

	it('ignores invalid bearer tokens on public routes', async () => {
		vi.spyOn(reflector, 'getAllAndOverride')
			.mockReturnValueOnce(true)
			.mockReturnValueOnce(undefined);
		authService.validateToken.mockRejectedValue(
			new UnauthorizedException('provider detail'),
		);

		await expect(
			guard.canActivate(createMockExecutionContext('Bearer bad-token')),
		).resolves.toBe(true);
	});
});
