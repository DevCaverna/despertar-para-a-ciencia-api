import { ConfigService } from '@nestjs/config';
import { deleteApp, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { UserRole } from '../src/auth/domain/user-role.js';
import { FirebaseAuthAdapter } from '../src/auth/infrastructure/firebase-auth.adapter.js';
import type { AppConfig } from '../src/config/config.types.js';

const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const emulatorSuite = emulatorHost ? describe : describe.skip;

emulatorSuite('FirebaseAuthAdapter with the Auth Emulator', () => {
	let adapter: FirebaseAuthAdapter;
	let uid: string;
	const email = `emulator-${Date.now()}@example.com`;
	const password = 'valid-password-123';

	beforeAll(async () => {
		if (!emulatorHost) return;

		const config = new ConfigService({
			auth: {
				firebase: {
					projectId: process.env.FIREBASE_PROJECT_ID,
					privateKey: process.env.FIREBASE_PRIVATE_KEY?.replaceAll(
						String.raw`\n`,
						'\n',
					),
					clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
				},
			},
		}) as ConfigService<AppConfig, true>;
		adapter = new FirebaseAuthAdapter(config);
		const user = await getAuth().createUser({ email, password });
		uid = user.uid;
		await getAuth().setCustomUserClaims(uid, {
			id: 'application-user-id',
			roles: [UserRole.ADMIN],
		});
	});

	afterAll(async () => {
		if (uid) await getAuth().deleteUser(uid);
		if (uid) await deleteApp(getApp());
	});

	async function signIn(
		userEmail = email,
		userPassword = password,
	): Promise<string> {
		const response = await fetch(
			`http://${emulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					email: userEmail,
					password: userPassword,
					returnSecureToken: true,
				}),
			},
		);
		const body = (await response.json()) as { idToken?: string };
		if (!response.ok || !body.idToken) {
			throw new Error(
				`Firebase emulator sign-in failed: ${response.status}`,
			);
		}
		return body.idToken;
	}

	it('validates emulator-issued tokens and custom claims', async () => {
		const user = await adapter.validateToken(await signIn());

		expect(user).toMatchObject({
			subject: uid,
			id: 'application-user-id',
			email,
			roles: [UserRole.ADMIN],
		});
	});

	it('rejects malformed tokens', async () => {
		await expect(adapter.validateToken('not-a-jwt')).rejects.toThrow(/./);
	});

	it('rejects tokens for disabled users', async () => {
		const token = await signIn();
		await getAuth().updateUser(uid, { disabled: true });

		await expect(adapter.validateToken(token)).rejects.toThrow(/./);
		await getAuth().updateUser(uid, { disabled: false });
	});

	it('exposes changed custom claims only in a newly issued ID token', async () => {
		const issuedToken = await signIn();
		await getAuth().setCustomUserClaims(uid, {
			id: 'application-user-id',
			roles: [UserRole.USER],
		});

		await expect(adapter.validateToken(issuedToken)).resolves.toMatchObject(
			{
				roles: [UserRole.ADMIN],
			},
		);
		await expect(
			adapter.validateToken(await signIn()),
		).resolves.toMatchObject({
			roles: [UserRole.USER],
		});
	});

	it('rejects tokens revoked after issuance', async () => {
		const token = await signIn();
		await new Promise((resolve) => setTimeout(resolve, 1100));
		await getAuth().revokeRefreshTokens(uid);

		await expect(adapter.validateToken(token)).rejects.toThrow(/./);
	});
});
