import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
	cert,
	getApps,
	initializeApp,
	type ServiceAccount,
} from 'firebase-admin/app';
import { FirebaseAuthError, getAuth } from 'firebase-admin/auth';

import type { AppConfig } from '../../config/config.types.js';
import { measureDependency } from '../../telemetry/telemetry.js';
import { AuthPort } from '../domain/auth.port.js';
import { AuthUser } from '../domain/auth.types.js';
import { UserRole } from '../domain/user-role.js';

@Injectable()
export class FirebaseAuthAdapter implements AuthPort {
	constructor(private readonly config: ConfigService<AppConfig, true>) {
		const firebaseConfig = config.getOrThrow('auth.firebase', {
			infer: true,
		});

		const serviceAccount: ServiceAccount = {
			projectId: firebaseConfig.projectId,
			privateKey: firebaseConfig.privateKey,
			clientEmail: firebaseConfig.clientEmail,
		};

		if (getApps().length === 0) {
			initializeApp({ credential: cert(serviceAccount) });
		}
	}

	async updatePassword({
		email,
		password,
	}: {
		email: string;
		password: string;
	}): Promise<void> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'update_user',
			work: async () => {
				const { uid } = await getAuth().getUserByEmail(email);
				await getAuth().updateUser(uid, { password });
			},
		});
	}

	async validateToken(token: string): Promise<AuthUser> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'validate_token',
			work: async () => {
				const decoded = await getAuth().verifyIdToken(token, true);

				return {
					id: decoded.id as string,
					email: decoded.email ?? '',
					roles: (decoded.roles ?? []) as UserRole[],
					emailVerified: decoded.email_verified ?? false,
					provider: 'firebase',
				};
			},
		});
	}

	async assignUserRoles({
		roles,
		email,
	}: {
		roles: UserRole[];
		email: string;
	}): Promise<void> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'roles',
			work: async () => {
				const { uid, customClaims = {} } =
					await getAuth().getUserByEmail(email);

				await getAuth().setCustomUserClaims(uid, {
					...customClaims,
					roles: [
						...((customClaims.roles ?? []) as UserRole[]),
						...roles,
					],
				});
				await getAuth().revokeRefreshTokens(uid);
			},
		});
	}

	async revokeUserRoles({
		roles,
		email,
	}: {
		email: string;
		roles: UserRole[];
	}): Promise<void> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'roles',
			work: async () => {
				const { uid, customClaims = {} } =
					await getAuth().getUserByEmail(email);

				await getAuth().setCustomUserClaims(uid, {
					...customClaims,
					roles: (Array.isArray(customClaims.roles)
						? (customClaims.roles as UserRole[])
						: []
					).filter((role) => !roles.includes(role)),
				});
				await getAuth().revokeRefreshTokens(uid);
			},
		});
	}

	async markEmailAsVerified({
		id,
		email,
	}: {
		id: string;
		email: string;
	}): Promise<void> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'update_user',
			work: async () => {
				const { uid, customClaims } =
					await getAuth().getUserByEmail(email);

				await getAuth().updateUser(uid, { emailVerified: true });
				await getAuth().setCustomUserClaims(uid, {
					...customClaims,
					id,
				});
				await getAuth().revokeRefreshTokens(uid);
			},
		});
	}

	async getUserByEmail(email: string): Promise<AuthUser | undefined> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'get_user',
			work: async () => {
				try {
					const userRecord = await getAuth().getUserByEmail(email);

					return {
						id: userRecord.customClaims?.id as string,
						email: userRecord.email ?? '',
						roles: (userRecord.customClaims?.roles ??
							[]) as UserRole[],
						provider: 'firebase',
					};
				} catch (error) {
					if (
						error instanceof FirebaseAuthError &&
						error.code === 'auth/user-not-found'
					) {
						return undefined;
					}

					throw error;
				}
			},
		});
	}

	async deleteUserByEmail(email: string): Promise<void> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'delete_user',
			work: async () => {
				const { uid } = await getAuth().getUserByEmail(email);
				await getAuth().deleteUser(uid);
			},
		});
	}
}
