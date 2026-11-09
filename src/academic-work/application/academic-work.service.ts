import {
	BadRequestException,
	ForbiddenException,
	Inject,
	Injectable,
	ServiceUnavailableException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';

import type { AuthUser } from '../../auth/domain/auth.types.js';
import type { I18nTranslations } from '../../generated/i18n.generated.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { SyncAcademicWorksDto } from '../dto/sync-academic-works.dto.js';
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
	) {}

	async sync(
		actor: AuthUser,
		request: SyncAcademicWorksDto,
	): Promise<SyncAcademicWorksResult> {
		if (
			!actor.id ||
			!(await this.prisma.database.orm.public.User.where({
				id: actor.id,
				active: true,
			}).first())
		) {
			throw new ForbiddenException(this.i18n.t('errors.FORBIDDEN'));
		}
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

		const database = this.prisma.database.orm.public;
		let academicSource = await database.AcademicSource.where({
			issn,
		}).first();
		if (!academicSource) {
			try {
				academicSource = await database.AcademicSource.create({
					issn,
					name: request.name,
				});
			} catch (error) {
				if (!this.isUniqueViolation(error, 'academicSource_issn_key')) {
					throw error;
				}
				academicSource = await database.AcademicSource.where({
					issn,
				}).first();
				if (!academicSource) throw error;
			}
		}

		const { imported, ignored } = await candidates.reduce<
			Promise<{ imported: number; ignored: number }>
		>(
			async (previous, candidate) => {
				const counts = await previous;
				try {
					await database.ExternalWork.create({
						sourceId: academicSource.id,
						doi: candidate.externalId,
						title: candidate.title,
						authors: candidate.authors,
						abstract: candidate.abstract ?? null,
						publicationDate: candidate.publicationDate ?? null,
						journal: candidate.journal ?? null,
						url: candidate.url ?? null,
					});
					return { ...counts, imported: counts.imported + 1 };
				} catch (error) {
					if (
						!this.isUniqueViolation(error, 'externalWork_doi_key')
					) {
						throw error;
					}
					return { ...counts, ignored: counts.ignored + 1 };
				}
			},
			Promise.resolve({ imported: 0, ignored: 0 }),
		);

		return {
			found: candidates.length,
			imported,
			ignored,
			...(nextCursor ? { nextCursor } : {}),
		};
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

	private isUniqueViolation(error: unknown, constraint: string): boolean {
		let current: unknown = error;
		while (typeof current === 'object' && current !== null) {
			const candidate = current as {
				code?: unknown;
				constraint?: unknown;
				cause?: unknown;
			};
			if (
				candidate.code === '23505' &&
				candidate.constraint === constraint
			) {
				return true;
			}
			current = candidate.cause;
		}
		return false;
	}
}
