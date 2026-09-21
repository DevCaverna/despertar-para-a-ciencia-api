import { AuthUser } from './auth.types.js';
import { UserRole } from './user-role.js';

export const AUTH_PORT = Symbol('AuthPort');

export interface AuthPort {
	validateToken(token: string): Promise<AuthUser>;

	markEmailAsVerified({
		id,
		email,
	}: {
		id: string;
		email: string;
	}): Promise<void>;

	assignUserRoles({
		roles,
		email,
	}: {
		email: string;
		roles: UserRole[];
	}): Promise<void>;

	revokeUserRoles({
		roles,
		email,
	}: {
		email: string;
		roles: UserRole[];
	}): Promise<void>;

	updatePassword({
		email,
		password,
	}: {
		email: string;
		password: string;
	}): Promise<void>;

	getUserByEmail(email: string): Promise<AuthUser | undefined>;

	deleteUserByEmail(email: string): Promise<void>;
}
