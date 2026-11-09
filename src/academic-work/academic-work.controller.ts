import { Body, Controller, Post } from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiCreatedResponse,
	ApiOperation,
	ApiTags,
} from '@nestjs/swagger';

import type { AuthUser } from '../auth/domain/auth.types.js';
import { UserRole } from '../auth/domain/user-role.js';
import { Actor } from '../decorators/actor.decorator.js';
import { Roles } from '../decorators/roles.decorator.js';
import { AcademicWorkService } from './application/academic-work.service.js';
import { SyncAcademicWorksDto } from './dto/sync-academic-works.dto.js';

@ApiTags('Academic Works')
@Controller('academic-works')
export class AcademicWorkController {
	constructor(private readonly academicWorks: AcademicWorkService) {}

	@Post('sync')
	@ApiBearerAuth('firebase-auth')
	@Roles(UserRole.ADMIN)
	@ApiOperation({ summary: 'Import academic works from a journal' })
	@ApiCreatedResponse({
		description: 'Import counts and optional continuation cursor',
	})
	sync(
		@Actor() actor: AuthUser,
		@Body() body: SyncAcademicWorksDto,
	): Promise<{
		found: number;
		imported: number;
		ignored: number;
		nextCursor?: string;
	}> {
		return this.academicWorks.sync(actor, body);
	}
}
