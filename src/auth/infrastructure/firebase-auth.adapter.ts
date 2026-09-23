import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
	cert,
	getApps,
	initializeApp,
	type ServiceAccount,
} from 'firebase-admin/app';
import {
	FirebaseAuthError,
	getAuth,
	type UserRecord,
} from 'firebase-admin/auth';

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
			initializeApp(
				process.env.FIREBASE_AUTH_EMULATOR_HOST
					? { projectId: firebaseConfig.projectId }
					: { credential: cert(serviceAccount) },
			);
		}
	}

	async validateToken(token: string): Promise<AuthUser> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'validate_token',
			work: async () => {
				const decoded = await getAuth().verifyIdToken(token, true);

				return this.toAuthUser({
					subject: decoded.uid,
					email: decoded.email,
					emailVerified: decoded.email_verified,
					customClaims: decoded,
				});
			},
		});
	}

	async getUserBySubject(subject: string): Promise<AuthUser | undefined> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'get_user',
			work: async () => {
				try {
					return this.toAuthUserFromRecord(
						await getAuth().getUser(subject),
					);
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

	async getUserByEmail(email: string): Promise<AuthUser | undefined> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'get_user',
			work: async () => {
				try {
					return this.toAuthUserFromRecord(
						await getAuth().getUserByEmail(email),
					);
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

	async markEmailVerified(subject: string): Promise<void> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'verify_email',
			work: async () => {
				await getAuth().updateUser(subject, { emailVerified: true });
			},
		});
	}

	async setUserClaims({
		subject,
		id,
		roles,
	}: {
		subject: string;
		id?: string;
		roles: UserRole[];
	}): Promise<void> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'roles',
			work: async () => {
				const { customClaims = {} } = await getAuth().getUser(subject);

				await getAuth().setCustomUserClaims(subject, {
					...customClaims,
					...(id ? { id } : {}),
					roles: this.normalizeRoles(roles),
				});
			},
		});
	}

	async enableUser(subject: string): Promise<void> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'enable_user',
			work: async () => {
				await getAuth().updateUser(subject, { disabled: false });
			},
		});
	}

	async disableUser(subject: string): Promise<void> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'disable_user',
			work: async () => {
				await getAuth().updateUser(subject, { disabled: true });
			},
		});
	}

	async revokeSessions(subject: string): Promise<void> {
		return measureDependency({
			dependency: 'firebase',
			operation: 'revoke_sessions',
			work: async () => {
				await getAuth().revokeRefreshTokens(subject);
			},
		});
	}

	private toAuthUserFromRecord(user: UserRecord): AuthUser {
		return this.toAuthUser({
			subject: user.uid,
			email: user.email,
			emailVerified: user.emailVerified,
			customClaims: user.customClaims,
		});
	}

	private toAuthUser({
		subject,
		email,
		emailVerified,
		customClaims,
	}: {
		subject: string;
		email?: string;
		emailVerified?: boolean;
		customClaims?: Record<string, unknown>;
	}): AuthUser {
		return {
			subject,
			...(typeof customClaims?.id === 'string'
				? { id: customClaims.id }
				: {}),
			email: email ?? '',
			emailVerified: emailVerified ?? false,
			roles: this.normalizeRoles(customClaims?.roles),
		};
	}

	private normalizeRoles(value: unknown): UserRole[] {
		if (!Array.isArray(value)) {
			return [];
		}

		const validRoles = new Set(Object.values(UserRole));
		return [...new Set(value)].filter(
			(role): role is UserRole =>
				typeof role === 'string' && validRoles.has(role as UserRole),
		);
	}
}
