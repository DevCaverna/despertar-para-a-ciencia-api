import {
	Body,
	Controller,
	Get,
	Param,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOkResponse,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';

import type { AuthUser } from '../auth/domain/auth.types.js';
import { UserRole } from '../auth/domain/user-role.js';
import { Actor } from '../decorators/actor.decorator.js';
import { Public } from '../decorators/public.decorator.js';
import { Roles } from '../decorators/roles.decorator.js';
import { CreateProfileDto } from './dto/create-profile.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { SendEmailVerificationCodeDto } from './dto/send-email-verification-code.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { UserModel, type User } from './models/user.model.js';
import { UserService } from './user.service.js';

@ApiTags('Users')
@ApiBearerAuth('firebase-auth')
@Controller('users')
export class UserController {
	constructor(private readonly users: UserService) {}

	@Post('profile')
	@ApiOperation({ summary: 'Create or reconcile the authenticated profile' })
	@ApiOkResponse({ type: UserModel })
	createProfile(
		@Actor() actor: AuthUser,
		@Body() body: CreateProfileDto,
	): Promise<User> {
		return this.users.createProfile(actor, body);
	}

	@Post('send-email-verification-code')
	@Public()
	@ApiOperation({ summary: 'Send an email verification code' })
	sendEmailVerificationCode(
		@Body() body: SendEmailVerificationCodeDto,
	): Promise<void> {
		return this.users.sendEmailVerificationCode(body.email);
	}

	@Get('profile')
	@ApiOperation({ summary: 'Get the authenticated profile' })
	@ApiOkResponse({ type: UserModel })
	getProfile(@Actor() actor: AuthUser): Promise<User> {
		return this.users.getProfile(actor);
	}

	@Patch('profile')
	@ApiOperation({ summary: 'Update the authenticated profile name' })
	@ApiOkResponse({ type: UserModel })
	updateProfile(
		@Actor() actor: AuthUser,
		@Body() body: UpdateProfileDto,
	): Promise<User> {
		return this.users.updateProfile(actor, body.name);
	}

	@Get()
	@Roles(UserRole.ADMIN)
	@ApiOperation({ summary: 'List user profiles' })
	@ApiOkResponse({ type: UserModel, isArray: true })
	listUsers(
		@Actor() actor: AuthUser,
		@Query() query: ListUsersQueryDto,
	): Promise<Array<User & { roles: UserRole[] }>> {
		return this.users.listUsers(actor, query.page, query.perPage);
	}

	@Patch(':id/roles')
	@Roles(UserRole.ADMIN)
	@ApiOperation({ summary: 'Replace a user role set' })
	@ApiOkResponse({ type: UserModel })
	updateRoles(
		@Actor() actor: AuthUser,
		@Param('id') id: string,
		@Body() body: UpdateUserRolesDto,
	): Promise<User> {
		return this.users.updateRoles(actor, id, body.roles);
	}

	@Patch(':id/status')
	@Roles(UserRole.ADMIN)
	@ApiOperation({ summary: 'Activate or deactivate a user' })
	@ApiOkResponse({ type: UserModel })
	updateStatus(
		@Actor() actor: AuthUser,
		@Param('id') id: string,
		@Body() body: UpdateUserStatusDto,
	): Promise<User> {
		return this.users.updateStatus(actor, id, body.active);
	}
}
