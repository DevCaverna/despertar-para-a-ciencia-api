import { UserRole } from './user-role.js';

export interface AuthUser {
	id?: string;
	email: string;
	roles?: UserRole[];
	emailVerified?: boolean;
	provider: 'firebase' | 'jwt' | 'keycloak';
}
