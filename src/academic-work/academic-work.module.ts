import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { AcademicWorkController } from './academic-work.controller.js';
import { ACADEMIC_WORK_SOURCE_PORT } from './application/academic-work-source.port.js';
import { AcademicWorkService } from './application/academic-work.service.js';
import { AcademicWorkRepository } from './infrastructure/academic-work.repository.js';
import { CrossrefAcademicWorkAdapter } from './infrastructure/crossref-academic-work.adapter.js';

@Module({
	imports: [PrismaModule],
	controllers: [AcademicWorkController],
	providers: [
		AcademicWorkService,
		AcademicWorkRepository,
		{
			provide: ACADEMIC_WORK_SOURCE_PORT,
			useFactory: () => new CrossrefAcademicWorkAdapter(),
		},
	],
	exports: [ACADEMIC_WORK_SOURCE_PORT],
})
export class AcademicWorkModule {}
