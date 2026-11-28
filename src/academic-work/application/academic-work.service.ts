import {
	BadRequestException,
	ForbiddenException,
	Inject,
	Injectable,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';

import type { AuthUser } from '../../auth/domain/auth.types.js';
import type { I18nTranslations } from '../../generated/i18n.generated.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ListAcademicWorksQueryDto } from '../dto/list-academic-works-query.dto.js';
import type { SyncAcademicWorksDto } from '../dto/sync-academic-works.dto.js';
import { AcademicWorkRepository } from '../infrastructure/academic-work.repository.js';
import type {
	AcademicWorkModel,
	AcademicWorkPageModel,
} from '../models/academic-work.model.js';
import {
	ACADEMIC_WORK_SOURCE_PORT,
	AcademicWorkSourceError,
	type AcademicWorkCandidate,
	type AcademicWorkSourcePort,
} from './academic-work-source.port.js';

const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

export interface SyncAcademicWorksResult {
	found: number;
	imported: number;
	ignored: number;
	nextCursor?: string;
}

@Injectable()
export class AcademicWorkService {
	constructor(
		private readonly prisma: PrismaService,
		@Inject(ACADEMIC_WORK_SOURCE_PORT)
		private readonly source: AcademicWorkSourcePort,
		private readonly i18n: I18nService<I18nTranslations>,
		private readonly repository: AcademicWorkRepository,
	) {}

	async list(
		actor: AuthUser,
		query: ListAcademicWorksQueryDto,
	): Promise<AcademicWorkPageModel> {
		await this.requireActiveProfile(actor);
		const offset = (query.page - 1) * query.perPage;
		if (!Number.isSafeInteger(offset)) {
			throw new BadRequestException(
				'Pagination offset must be a safe integer.',
			);
		}
		return this.repository.list(query.page, query.perPage);
	}

	async get(actor: AuthUser, id: string): Promise<AcademicWorkModel> {
		await this.requireActiveProfile(actor);
		const work = await this.repository.get(id);
		if (!work) {
			throw new NotFoundException(
				this.i18n.t('errors.NOT_FOUND', {
					args: { entity: 'ExternalWork' },
				}),
			);
		}
		return work;
	}

	async sync(
		actor: AuthUser,
		request: SyncAcademicWorksDto,
	): Promise<SyncAcademicWorksResult> {
		await this.requireActiveProfile(actor);
		if (
			request.fromDate &&
			request.untilDate &&
			request.fromDate > request.untilDate
		) {
			throw new BadRequestException(
				this.i18n.t('errors.ACADEMIC_WORK_DATE_RANGE_INVALID'),
			);
		}

		const issn = request.issn.replace('-', '');
		const { candidates, nextCursor } = await this.collectCandidates(
			request,
			issn,
			request.cursor,
			MAX_PAGES,
			new Set(),
		);

		const imported = await this.repository.importWorks(
			issn,
			request.name,
			candidates,
		);

		return {
			found: candidates.length,
			imported,
			ignored: candidates.length - imported,
			...(nextCursor ? { nextCursor } : {}),
		};
	}

	private async requireActiveProfile(actor: AuthUser): Promise<void> {
		if (
			!actor.id ||
			!(await this.prisma.database.orm.public.User.where({
				id: actor.id,
				active: true,
			}).first())
		) {
			throw new ForbiddenException(this.i18n.t('errors.FORBIDDEN'));
		}
	}

	private async collectCandidates(
		request: SyncAcademicWorksDto,
		issn: string,
		cursor: string | undefined,
		remainingPages: number,
		seenCursors: Set<string>,
	): Promise<{ candidates: AcademicWorkCandidate[]; nextCursor?: string }> {
		if (cursor) seenCursors.add(cursor);
		let page;
		try {
			page = await this.source.search({
				sourceIdentifier: issn,
				fromDate: request.fromDate,
				untilDate: request.untilDate,
				requireAbstract: request.requireAbstract,
				cursor,
				limit: PAGE_LIMIT,
			});
		} catch (error) {
			if (!(error instanceof AcademicWorkSourceError)) throw error;
			throw new ServiceUnavailableException(
				this.i18n.t('errors.ACADEMIC_SOURCE_UNAVAILABLE'),
			);
		}
		if (page.nextCursor && seenCursors.has(page.nextCursor)) {
			throw new ServiceUnavailableException(
				this.i18n.t('errors.ACADEMIC_SOURCE_PAGINATION_INVALID'),
			);
		}
		if (!page.nextCursor || remainingPages === 1) {
			return {
				candidates: page.items,
				...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
			};
		}
		const continuation = await this.collectCandidates(
			request,
			issn,
			page.nextCursor,
			remainingPages - 1,
			seenCursors,
		);
		return {
			candidates: [...page.items, ...continuation.candidates],
			...(continuation.nextCursor
				? { nextCursor: continuation.nextCursor }
				: {}),
		};
	}
}
