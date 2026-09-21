import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserRole } from '../domain/user-role.js';

const rootAuth = {
	getUserByEmail: vi.fn(),
	setCustomUserClaims: vi.fn(),
	revokeRefreshTokens: vi.fn(),
	updateUser: vi.fn(),
	verifyIdToken: vi.fn(),
};
const getAuth = vi.fn(() => rootAuth);
const getApps = vi.fn(() => [{}]);
const config = {
	getOrThrow: vi.fn(() => ({
		projectId: 'project-id',
		privateKey: 'private-key',
		clientEmail: 'service@example.com',
	})),
};

vi.mock('firebase-admin/app', () => ({
	cert: vi.fn(),
	getApps,
	initializeApp: vi.fn(),
}));
vi.mock('firebase-admin/auth', () => ({
	FirebaseAuthError: class FirebaseAuthError extends Error {},
	getAuth,
}));

const { FirebaseAuthAdapter } = await import('./firebase-auth.adapter.js');

describe('FirebaseAuthAdapter', () => {
	beforeEach(() => vi.clearAllMocks());

	it('delegates token validation to Firebase', async () => {
		const adapter = new FirebaseAuthAdapter(config as never);
		rootAuth.verifyIdToken.mockRejectedValue(
			new Error('auth/id-token-revoked'),
		);

		await expect(adapter.validateToken('revoked-token')).rejects.toThrow(
			'auth/id-token-revoked',
		);
		expect(rootAuth.verifyIdToken).toHaveBeenCalledWith(
			'revoked-token',
			true,
		);
	});

	it('revokes refresh tokens after assigning an administrative role', async () => {
		const adapter = new FirebaseAuthAdapter(config as never);
		rootAuth.getUserByEmail.mockResolvedValue({
			uid: 'user-id',
			customClaims: { id: 'app-user-id', roles: [] },
		});

		await adapter.assignUserRoles({
			email: 'admin@example.com',
			roles: [UserRole.ADMINISTRATOR],
		});

		expect(rootAuth.setCustomUserClaims).toHaveBeenCalledWith('user-id', {
			id: 'app-user-id',
			roles: [UserRole.ADMINISTRATOR],
		});
		expect(rootAuth.revokeRefreshTokens).toHaveBeenCalledWith('user-id');
	});
});
