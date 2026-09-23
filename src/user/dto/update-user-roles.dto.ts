import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';

import { UserRole } from '../../auth/domain/user-role.js';

export class UpdateUserRolesDto {
	@ApiProperty({
		enum: UserRole,
		isArray: true,
		example: [UserRole.COLLABORATOR],
	})
	@IsArray()
	@ArrayNotEmpty()
	@IsEnum(UserRole, { each: true })
	roles!: UserRole[];
}
