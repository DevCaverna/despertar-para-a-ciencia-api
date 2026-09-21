import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

import { AuthUser } from '../auth/domain/auth.types.js';

export const Actor = createParamDecorator(
	(data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
		const request: Request & { user?: AuthUser } = ctx
			.switchToHttp()
			.getRequest();
		const actor = request.user;

		if (!actor) return null;

		if (data && actor[data] !== undefined) {
			return actor[data];
		}
		return actor;
	},
);
