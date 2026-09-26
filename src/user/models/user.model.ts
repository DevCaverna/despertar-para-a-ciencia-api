import { ApiProperty } from '@nestjs/swagger';

import { UserRole } from '../../auth/domain/user-role.js';
import type { Models } from '../../prisma/contract.d.ts';

export type User = Models.public_User;

export class UserModel implements User {
	@ApiProperty({ format: 'uuid' })
	id!: string;

	@ApiProperty({ example: 'Ada Lovelace' })
	name!: string;

	@ApiProperty({ example: 'ada@example.com' })
	email!: string;

	@ApiProperty()
	active!: boolean;

	@ApiProperty({ format: 'date-time' })
	createdAt!: string;

	@ApiProperty({ format: 'date-time' })
	updatedAt!: string;

	@ApiProperty({ enum: UserRole, isArray: true, required: false })
	roles?: UserRole[];

	@ApiProperty({
		required: false,
		description: 'Whether a Firebase Auth account exists for the profile.',
	})
	authAccountExists?: boolean;
}
