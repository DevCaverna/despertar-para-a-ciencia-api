import { UserRole } from './user-role.js';

export interface AuthUser {
	firebaseUid: string;
	id?: string;
	email: string;
	roles: UserRole[];
	emailVerified: boolean;
	provider: 'firebase';
}
