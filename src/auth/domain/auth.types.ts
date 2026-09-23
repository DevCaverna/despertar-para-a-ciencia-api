import { UserRole } from './user-role.js';

export interface AuthUser {
	subject: string;
	id?: string;
	email: string;
	roles: UserRole[];
	emailVerified: boolean;
}
