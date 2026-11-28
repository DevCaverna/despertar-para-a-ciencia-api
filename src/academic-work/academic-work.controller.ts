import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import {
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiCreatedResponse,
	ApiForbiddenResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiOperation,
	ApiParam,
	ApiTags,
} from '@nestjs/swagger';

import type { AuthUser } from '../auth/domain/auth.types.js';
import { UserRole } from '../auth/domain/user-role.js';
import { Actor } from '../decorators/actor.decorator.js';
import { Roles } from '../decorators/roles.decorator.js';
import { AcademicWorkService } from './application/academic-work.service.js';
import { ListAcademicWorksQueryDto } from './dto/list-academic-works-query.dto.js';
import { SyncAcademicWorksResponseDto } from './dto/sync-academic-works-response.dto.js';
import { SyncAcademicWorksDto } from './dto/sync-academic-works.dto.js';
import {
	AcademicWorkModel,
	AcademicWorkPageModel,
} from './models/academic-work.model.js';

@ApiTags('Academic Works')
@ApiBearerAuth('firebase-auth')
@Controller('academic-works')
export class AcademicWorkController {
	constructor(private readonly academicWorks: AcademicWorkService) {}

	@Get()
	@Roles(UserRole.COLLABORATOR, UserRole.ADMIN)
	@ApiOperation({
		summary: 'List imported academic works',
		description:
			'Ordered by import date descending, then id descending. Reads only persisted works.',
	})
	@ApiOkResponse({ type: AcademicWorkPageModel })
	@ApiBadRequestResponse({
		description: 'Invalid pagination or unknown query parameters.',
	})
	@ApiForbiddenResponse({
		description: 'Insufficient role or inactive profile.',
	})
	list(
		@Actor() actor: AuthUser,
		@Query() query: ListAcademicWorksQueryDto,
	): Promise<AcademicWorkPageModel> {
		return this.academicWorks.list(actor, query);
	}

	@Get(':id')
	@Roles(UserRole.COLLABORATOR, UserRole.ADMIN)
	@ApiOperation({ summary: 'Read an imported academic work' })
	@ApiParam({
		name: 'id',
		description: 'ExternalWork UUIDv7',
		schema: { type: 'string', format: 'uuid' },
	})
	@ApiOkResponse({ type: AcademicWorkModel })
	@ApiBadRequestResponse({ description: 'Invalid UUIDv7.' })
	@ApiForbiddenResponse({
		description: 'Insufficient role or inactive profile.',
	})
	@ApiNotFoundResponse({ description: 'Academic work not found.' })
	get(
		@Actor() actor: AuthUser,
		@Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
	): Promise<AcademicWorkModel> {
		return this.academicWorks.get(actor, id);
	}

	@Post('sync')
	@Roles(UserRole.ADMIN)
	@ApiOperation({ summary: 'Import academic works from a journal' })
	@ApiCreatedResponse({
		description: 'Import counts and optional continuation cursor',
		type: SyncAcademicWorksResponseDto,
	})
	sync(
		@Actor() actor: AuthUser,
		@Body() body: SyncAcademicWorksDto,
	): Promise<SyncAcademicWorksResponseDto> {
		return this.academicWorks.sync(actor, body);
	}
}
