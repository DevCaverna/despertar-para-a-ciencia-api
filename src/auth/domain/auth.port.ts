import { AuthUser } from './auth.types.js';
import { UserRole } from './user-role.js';

export const AUTH_PORT = Symbol('AuthPort');

export interface AuthPort {
	validateToken(token: string): Promise<AuthUser>;

	getUserByUid(firebaseUid: string): Promise<AuthUser | undefined>;

	getUserByEmail(email: string): Promise<AuthUser | undefined>;

	setUserClaims({
		firebaseUid,
		id,
		roles,
	}: {
		firebaseUid: string;
		id?: string;
		roles: UserRole[];
	}): Promise<void>;

	enableUser(firebaseUid: string): Promise<void>;

	disableUser(firebaseUid: string): Promise<void>;

	revokeSessions(firebaseUid: string): Promise<void>;
}
