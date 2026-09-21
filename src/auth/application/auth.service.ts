import { Inject, Injectable } from '@nestjs/common';

import { AUTH_PORT, type AuthPort } from '../domain/auth.port.js';
import { AuthUser } from '../domain/auth.types.js';
import { UserRole } from '../domain/user-role.js';

@Injectable()
export class AuthService {
	constructor(@Inject(AUTH_PORT) private readonly auth: AuthPort) {}

	validateToken(token: string): Promise<AuthUser> {
		return this.auth.validateToken(token);
	}

	async assignUserRoles({
		roles,
		email,
	}: {
		roles: UserRole[];
		email: string;
	}): Promise<void> {
		return this.auth.assignUserRoles({ roles, email });
	}

	async revokeUserRoles({
		roles,
		email,
	}: {
		roles: UserRole[];
		email: string;
	}): Promise<void> {
		return this.auth.revokeUserRoles({ roles, email });
	}

	async markEmailAsVerified({
		email,
		id,
	}: {
		id: string;
		email: string;
	}): Promise<void> {
		return this.auth.markEmailAsVerified({ email, id });
	}

	async updatePassword({
		email,
		password,
	}: {
		email: string;
		password: string;
	}): Promise<void> {
		return this.auth.updatePassword({ email, password });
	}

	async getUserByEmail(email: string): Promise<AuthUser | undefined> {
		return this.auth.getUserByEmail(email);
	}

	async deleteUserByEmail(email: string): Promise<void> {
		return this.auth.deleteUserByEmail(email);
	}
}
