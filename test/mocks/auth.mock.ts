import { vi, type Mock } from 'vitest';

import type { AuthUser } from '../../src/auth/domain/auth.types.js';
import { UserRole } from '../../src/auth/domain/user-role.js';

export function mockUser(overrides: Partial<AuthUser> = {}): AuthUser {
	return {
		id: 'test-user-id',
		email: 'user@test.com',
		roles: [],
		provider: 'firebase',
		...overrides,
	};
}

export function mockAdmin(overrides: Partial<AuthUser> = {}): AuthUser {
	return {
		id: 'test-admin-id',
		email: 'admin@test.com',
		roles: [UserRole.ADMINISTRATOR],
		provider: 'firebase',
		...overrides,
	};
}

export function createMockAuthService(): Record<string, Mock> {
	return {
		validateToken: vi.fn(),
		assignUserRoles: vi.fn(),
		markEmailAsVerified: vi.fn(),
		updatePassword: vi.fn(),
		getUserByEmail: vi.fn(),
		deleteUserByEmail: vi.fn(),
		revokeUserRoles: vi.fn(),
	};
}
