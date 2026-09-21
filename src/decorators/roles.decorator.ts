import { applyDecorators, SetMetadata } from '@nestjs/common';

import { UserRole } from '../auth/domain/user-role.js';

export const REQUIRED_ROLES_KEY = 'requiredRoles';

export function Roles(...roles: UserRole[]): ClassDecorator & MethodDecorator {
	return applyDecorators(SetMetadata(REQUIRED_ROLES_KEY, roles));
}
