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

	getUserByUid(firebaseUid: string): Promise<AuthUser | undefined> {
		return this.auth.getUserByUid(firebaseUid);
	}

	getUserByEmail(email: string): Promise<AuthUser | undefined> {
		return this.auth.getUserByEmail(email);
	}

	setUserClaims(input: {
		firebaseUid: string;
		id?: string;
		roles: UserRole[];
	}): Promise<void> {
		return this.auth.setUserClaims(input);
	}

	setUserDisabled(firebaseUid: string, disabled: boolean): Promise<void> {
		return this.auth.setUserDisabled(firebaseUid, disabled);
	}

	revokeSessions(firebaseUid: string): Promise<void> {
		return this.auth.revokeSessions(firebaseUid);
	}
}
