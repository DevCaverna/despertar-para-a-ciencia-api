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

	getUserBySubject(subject: string): Promise<AuthUser | undefined> {
		return this.auth.getUserBySubject(subject);
	}

	getUserByEmail(email: string): Promise<AuthUser | undefined> {
		return this.auth.getUserByEmail(email);
	}

	setUserClaims(input: {
		subject: string;
		id?: string;
		roles: UserRole[];
	}): Promise<void> {
		return this.auth.setUserClaims(input);
	}

	enableUser(subject: string): Promise<void> {
		return this.auth.enableUser(subject);
	}

	disableUser(subject: string): Promise<void> {
		return this.auth.disableUser(subject);
	}

	revokeSessions(subject: string): Promise<void> {
		return this.auth.revokeSessions(subject);
	}
}
