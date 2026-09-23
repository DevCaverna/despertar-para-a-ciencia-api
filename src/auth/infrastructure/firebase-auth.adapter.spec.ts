import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserRole } from '../domain/user-role.js';

const rootAuth = {
	getUser: vi.fn(),
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

	it('maps the Firebase UID and ignores invalid role claims', async () => {
		const adapter = new FirebaseAuthAdapter(config as never);
		rootAuth.verifyIdToken.mockResolvedValue({
			uid: 'firebase-uid',
			email: 'user@example.com',
			email_verified: true,
			id: 'profile-id',
			roles: [UserRole.ADMIN, 'INVALID', UserRole.ADMIN],
		});

		await expect(adapter.validateToken('valid-token')).resolves.toEqual({
			firebaseUid: 'firebase-uid',
			id: 'profile-id',
			email: 'user@example.com',
			emailVerified: true,
			roles: [UserRole.ADMIN],
			provider: 'firebase',
		});
	});

	it('replaces roles while preserving the profile claim', async () => {
		const adapter = new FirebaseAuthAdapter(config as never);
		rootAuth.getUser.mockResolvedValue({
			uid: 'user-id',
			customClaims: { id: 'app-user-id', roles: [] },
		});

		await adapter.setUserClaims({
			firebaseUid: 'user-id',
			roles: [UserRole.ADMIN],
		});

		expect(rootAuth.setCustomUserClaims).toHaveBeenCalledWith('user-id', {
			id: 'app-user-id',
			roles: [UserRole.ADMIN],
		});
		expect(rootAuth.revokeRefreshTokens).not.toHaveBeenCalled();
	});

	it('enables and disables Firebase users explicitly', async () => {
		const adapter = new FirebaseAuthAdapter(config as never);

		await adapter.enableUser('user-id');
		await adapter.disableUser('user-id');

		expect(rootAuth.updateUser).toHaveBeenNthCalledWith(1, 'user-id', {
			disabled: false,
		});
		expect(rootAuth.updateUser).toHaveBeenNthCalledWith(2, 'user-id', {
			disabled: true,
		});
	});
});
