import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { PrismaService } from '../prisma/prisma.service.js';
import { AcademicWorkModule } from './academic-work.module.js';
import { ACADEMIC_WORK_SOURCE_PORT } from './application/academic-work-source.port.js';
import { AcademicWorkService } from './application/academic-work.service.js';
import { CrossrefAcademicWorkAdapter } from './infrastructure/crossref-academic-work.adapter.js';

describe('AcademicWorkModule', () => {
	it('exports a replaceable source port', async () => {
		const module = await Test.createTestingModule({
			imports: [AcademicWorkModule],
		})
			.overrideProvider(PrismaService)
			.useValue({})
			.overrideProvider(AcademicWorkService)
			.useValue({})
			.compile();
		expect(module.get(ACADEMIC_WORK_SOURCE_PORT)).toBeInstanceOf(
			CrossrefAcademicWorkAdapter,
		);
		await module.close();
	});
});
