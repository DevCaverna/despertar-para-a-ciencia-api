import { AuthUser } from './auth.types.js';
import { UserRole } from './user-role.js';

export const AUTH_PORT = Symbol('AuthPort');

export interface AuthPort {
	validateToken(token: string): Promise<AuthUser>;

	getUserBySubject(subject: string): Promise<AuthUser | undefined>;

	getUserByEmail(email: string): Promise<AuthUser | undefined>;

	markEmailVerified(subject: string): Promise<void>;

	setUserClaims({
		subject,
		id,
		roles,
	}: {
		subject: string;
		id?: string;
		roles: UserRole[];
	}): Promise<void>;

	enableUser(subject: string): Promise<void>;

	disableUser(subject: string): Promise<void>;

	revokeSessions(subject: string): Promise<void>;
}
