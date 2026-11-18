import { Module } from '@nestjs/common';

import { ACADEMIC_WORK_SOURCE_PORT } from './application/academic-work-source.port.js';
import { CrossrefAcademicWorkAdapter } from './infrastructure/crossref-academic-work.adapter.js';

@Module({
	providers: [
		{
			provide: ACADEMIC_WORK_SOURCE_PORT,
			useFactory: () => new CrossrefAcademicWorkAdapter(),
		},
	],
	exports: [ACADEMIC_WORK_SOURCE_PORT],
})
export class AcademicWorkModule {}
