import { vi, type Mock } from 'vitest';

import type { AuthUser } from '../../src/auth/domain/auth.types.js';
import { UserRole } from '../../src/auth/domain/user-role.js';

export function mockUser(overrides: Partial<AuthUser> = {}): AuthUser {
	return {
		subject: 'test-subject',
		id: 'test-user-id',
		email: 'user@test.com',
		emailVerified: true,
		roles: [],
		...overrides,
	};
}

export function mockAdmin(overrides: Partial<AuthUser> = {}): AuthUser {
	return {
		subject: 'test-admin-subject',
		id: 'test-admin-id',
		email: 'admin@test.com',
		emailVerified: true,
		roles: [UserRole.ADMIN],
		...overrides,
	};
}

export function createMockAuthService(): Record<string, Mock> {
	return {
		validateToken: vi.fn(),
		getUserByUid: vi.fn(),
		getUserByEmail: vi.fn(),
		markEmailVerified: vi.fn(),
		setUserClaims: vi.fn(),
		enableUser: vi.fn(),
		disableUser: vi.fn(),
		revokeSessions: vi.fn(),
	};
}
