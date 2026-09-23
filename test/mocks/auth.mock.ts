import { vi, type Mock } from 'vitest';

import type { AuthUser } from '../../src/auth/domain/auth.types.js';
import { UserRole } from '../../src/auth/domain/user-role.js';

export function mockUser(overrides: Partial<AuthUser> = {}): AuthUser {
	return {
		firebaseUid: 'test-firebase-uid',
		id: 'test-user-id',
		email: 'user@test.com',
		emailVerified: true,
		roles: [],
		provider: 'firebase',
		...overrides,
	};
}

export function mockAdmin(overrides: Partial<AuthUser> = {}): AuthUser {
	return {
		firebaseUid: 'test-admin-firebase-uid',
		id: 'test-admin-id',
		email: 'admin@test.com',
		emailVerified: true,
		roles: [UserRole.ADMIN],
		provider: 'firebase',
		...overrides,
	};
}

export function createMockAuthService(): Record<string, Mock> {
	return {
		validateToken: vi.fn(),
		getUserByUid: vi.fn(),
		getUserByEmail: vi.fn(),
		setUserClaims: vi.fn(),
		enableUser: vi.fn(),
		disableUser: vi.fn(),
		revokeSessions: vi.fn(),
	};
}
